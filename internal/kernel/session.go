package kernel

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/dcpool"
	"github.com/iyear/tdl/core/storage"
	coretclient "github.com/iyear/tdl/core/tclient"
	"github.com/iyear/tdl/pkg/kv"
	tdlclient "github.com/iyear/tdl/pkg/tclient"
)

// telegramSession keeps one authorized client alive for chat loads and file
// downloads. The tdl bolt database is held for the lifetime of the app session,
// which is fine because tgdesk uses its own "tgdesk" namespace.
type telegramSession struct {
	key    string
	client *telegram.Client
	// pool keeps a small set of warm connections per data center for tdl's
	// multi-connection downloader.
	pool dcpool.Pool
	// mediaClients caches one file connection per data center. Telegram stores
	// every file in the DC it was uploaded to, so thumbnails and avatars often
	// live outside the account's primary DC; each of those DCs is connected once
	// and reused. Connections are created outside the lock and in parallel, so
	// several DCs can come up at the same time.
	mediaMu       sync.Mutex
	mediaClients  map[int]telegram.CloseInvoker
	mediaCreating map[int]chan struct{}
	stg           kv.Storage
	ns            storage.Storage
	cancel        context.CancelFunc
	done          chan struct{}
}

func (s *Service) ensureSession(ctx context.Context, proxy, ntp string) (*telegram.Client, error) {
	key := proxy + "\x00" + ntp

	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()

	if s.session != nil && s.session.key == key {
		return s.session.client, nil
	}
	if s.session != nil {
		s.stopSessionLocked()
	}

	stg, ns, err := openTDStorage()
	if err != nil {
		return nil, err
	}
	if err := prepareAuthStorage(ns); err != nil {
		_ = stg.Close()
		return nil, err
	}

	runCtx, cancel := context.WithCancel(context.Background())
	client, err := tdlclient.New(runCtx, tdlclient.Options{
		KV:               ns,
		Proxy:            resolveAuthProxy(proxy),
		NTP:              ntp,
		ReconnectTimeout: 2 * time.Minute,
		UpdateHandler:    newLiveUpdateHandler(s, proxy, ntp),
	}, false)
	if err != nil {
		cancel()
		_ = stg.Close()
		return nil, fmt.Errorf("create Telegram client: %w", err)
	}

	ready := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		runErr := client.Run(runCtx, func(ctx context.Context) error {
			if err := client.Ping(ctx); err != nil {
				select {
				case ready <- err:
				default:
				}
				return err
			}
			select {
			case ready <- nil:
			default:
			}
			<-ctx.Done()
			return ctx.Err()
		})
		if runErr != nil {
			select {
			case ready <- runErr:
			default:
			}
		}
		close(done)
	}()

	select {
	case err := <-ready:
		if err != nil {
			cancel()
			closeSession(stg, done)
			return nil, fmt.Errorf("connect to Telegram: %w", err)
		}
	case <-ctx.Done():
		cancel()
		closeSession(stg, done)
		return nil, ctx.Err()
	}

	pool := dcpool.NewPool(
		client,
		2,
		coretclient.NewDefaultMiddlewares(runCtx, 2*time.Minute)...,
	)

	s.session = &telegramSession{
		key:           key,
		client:        client,
		pool:          pool,
		mediaClients:  make(map[int]telegram.CloseInvoker),
		mediaCreating: make(map[int]chan struct{}),
		stg:           stg,
		ns:            ns,
		cancel:        cancel,
		done:          done,
	}
	return client, nil
}

func closeSession(stg kv.Storage, done <-chan struct{}) {
	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
	_ = stg.Close()
}

// mediaClient returns a client bound to the data center that stores a file.
// Telegram keeps every file in the DC it was uploaded to, so a thumbnail or
// avatar can be several DCs away from the account's primary connection. The
// first file for a DC connects it (auth export/import + handshake, which costs
// seconds through a proxy); later files reuse the cached connection. Creation
// happens outside the lock so connections for different DCs come up in
// parallel instead of one after another.
func (t *telegramSession) mediaClient(ctx context.Context, dc int) (*tg.Client, error) {
	if dc <= 0 {
		return t.client.API(), nil
	}
	if current := t.client.Config().ThisDC; dc == current {
		return t.client.API(), nil
	}

	t.mediaMu.Lock()
	if invoker, ok := t.mediaClients[dc]; ok {
		t.mediaMu.Unlock()
		return tg.NewClient(invoker), nil
	}
	if waiting, ok := t.mediaCreating[dc]; ok {
		t.mediaMu.Unlock()
		select {
		case <-waiting:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		t.mediaMu.Lock()
		invoker, ok := t.mediaClients[dc]
		t.mediaMu.Unlock()
		if !ok {
			return nil, fmt.Errorf("connect media DC %d: no connection", dc)
		}
		return tg.NewClient(invoker), nil
	}
	waiting := make(chan struct{})
	t.mediaCreating[dc] = waiting
	t.mediaMu.Unlock()

	invoker, err := t.client.DC(ctx, dc, 1)

	t.mediaMu.Lock()
	delete(t.mediaCreating, dc)
	if err == nil {
		t.mediaClients[dc] = invoker
	}
	close(waiting)
	t.mediaMu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("connect media DC %d: %w", dc, err)
	}
	return tg.NewClient(invoker), nil
}

func (t *telegramSession) closeMediaClients() {
	t.mediaMu.Lock()
	clients := t.mediaClients
	pending := t.mediaCreating
	t.mediaClients = make(map[int]telegram.CloseInvoker)
	t.mediaCreating = make(map[int]chan struct{})
	t.mediaMu.Unlock()
	// Wake goroutines waiting on a handshake that will no longer complete.
	for _, waiting := range pending {
		close(waiting)
	}
	for _, invoker := range clients {
		_ = invoker.Close()
	}
}

func (s *Service) stopSession() {
	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()
	s.stopSessionLocked()
}

func (s *Service) stopSessionLocked() {
	session := s.session
	s.session = nil
	if session == nil {
		return
	}
	s.dialogsCacheMu.Lock()
	s.dialogsCache = make(map[string]dialogsCacheEntry)
	s.dialogsCacheMu.Unlock()
	s.invalidateStickerCaches()
	if session.pool != nil {
		_ = session.pool.Close()
	}
	session.closeMediaClients()
	session.cancel()
	closeSession(session.stg, session.done)
}
