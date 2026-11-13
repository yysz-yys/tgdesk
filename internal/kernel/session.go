package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
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
	// pool keeps a small set of warm connections per data center. Chat
	// thumbnails and avatars are fetched through it: recreating a pool for every
	// image (the old behaviour) opened a fresh media connection per photo.
	pool   dcpool.Pool
	stg    kv.Storage
	ns     storage.Storage
	cancel context.CancelFunc
	done   chan struct{}
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
		key:    key,
		client: client,
		pool:   pool,
		stg:    stg,
		ns:     ns,
		cancel: cancel,
		done:   done,
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
	if session.pool != nil {
		_ = session.pool.Close()
	}
	session.cancel()
	closeSession(session.stg, session.done)
}
