package kernel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	gotdtelegram "github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/telegram/auth/qrlogin"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
	"github.com/iyear/tdl/core/storage"
	"github.com/iyear/tdl/core/storage/keygen"
	tdlkey "github.com/iyear/tdl/pkg/key"
	"github.com/iyear/tdl/pkg/kv"
	tdlclient "github.com/iyear/tdl/pkg/tclient"

	"tgdesk/internal/paths"
)

const (
	authStateIdle            = "idle"
	authStateStarting        = "starting"
	authStateWaitingQR       = "waiting_qr"
	authStateWaitingCode     = "waiting_code"
	authStateWaitingPassword = "waiting_password"
	authStateVerifying       = "verifying"
	authStateSuccess         = "success"
	authStateError           = "error"
)

const (
	authUserKey  = "tgdesk.auth.user"
	tdlNamespace = "tgdesk"
)

// AuthUser is the small identity DTO the UI needs. It intentionally does not
// expose gotd types.
type AuthUser struct {
	ID          int64  `json:"id"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Username    string `json:"username"`
	Phone       string `json:"phone,omitempty"`
	DisplayName string `json:"displayName"`
	Restricted  bool   `json:"restricted,omitempty"`
	Restriction string `json:"restriction,omitempty"`
	Initials    string `json:"initials"`
	Color       string `json:"color"`
}

// AuthStatus is returned on app startup. It checks the tdl bolt session
// without opening a Telegram connection.
type AuthStatus struct {
	Authorized  bool      `json:"authorized"`
	User        *AuthUser `json:"user,omitempty"`
	ImportError string    `json:"importError,omitempty"`
}

// AuthEvent is pushed to the WebView over the "auth:event" event.
type AuthEvent struct {
	State string    `json:"state"`
	QRURL string    `json:"qrUrl,omitempty"`
	User  *AuthUser `json:"user,omitempty"`
	Error string    `json:"error,omitempty"`
}

func (s *Service) emitAuth(event AuthEvent) {
	s.eventMu.RLock()
	sink := s.eventSink
	s.eventMu.RUnlock()
	if sink != nil {
		sink(event)
	}
}

func (s *Service) setAuthState(state string) {
	s.authMu.Lock()
	s.authState = state
	s.authMu.Unlock()
}

func (s *Service) authChannels() (string, chan string, chan string) {
	s.authMu.Lock()
	defer s.authMu.Unlock()
	return s.authState, s.codeCh, s.passCh
}

// StartQR begins a real Telegram QR login. It returns immediately; progress
// arrives through AuthEvent.
func (s *Service) StartQR(proxy, ntp string) error {
	s.stopAuth()
	s.authMu.Lock()
	s.authUser = nil
	s.authMu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	codeCh := make(chan string, 1)
	passCh := make(chan string, 1)

	s.authMu.Lock()
	s.authCancel = cancel
	s.authDone = done
	s.codeCh = codeCh
	s.passCh = passCh
	s.authState = authStateStarting
	s.authMu.Unlock()

	s.emitAuth(AuthEvent{State: authStateStarting})
	go s.runQR(ctx, cancel, done, codeCh, passCh, proxy, ntp)
	return nil
}

// StartPhone begins the phone -> code -> optional 2FA flow.
func (s *Service) StartPhone(phone, proxy, ntp string) error {
	phone = normalizePhone(phone)
	if len(phone) < 6 {
		return errors.New("invalid phone number")
	}

	s.stopAuth()
	s.authMu.Lock()
	s.authUser = nil
	s.authMu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	codeCh := make(chan string, 1)
	passCh := make(chan string, 1)

	s.authMu.Lock()
	s.authCancel = cancel
	s.authDone = done
	s.codeCh = codeCh
	s.passCh = passCh
	s.authState = authStateStarting
	s.authMu.Unlock()

	s.emitAuth(AuthEvent{State: authStateStarting})
	go s.runPhone(ctx, cancel, done, codeCh, passCh, phone, proxy, ntp)
	return nil
}

func (s *Service) SubmitCode(code string) error {
	state, ch, _ := s.authChannels()
	if state != authStateWaitingCode || ch == nil {
		return errors.New("not waiting for a login code")
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return errors.New("empty login code")
	}
	s.setAuthState(authStateVerifying)
	select {
	case ch <- code:
		return nil
	default:
		s.setAuthState(authStateWaitingCode)
		return errors.New("login code already submitted")
	}
}

func (s *Service) SubmitPassword(password string) error {
	state, _, ch := s.authChannels()
	if state != authStateWaitingPassword || ch == nil {
		return errors.New("not waiting for a password")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return errors.New("empty password")
	}
	s.setAuthState(authStateVerifying)
	select {
	case ch <- password:
		return nil
	default:
		s.setAuthState(authStateWaitingPassword)
		return errors.New("password already submitted")
	}
}

func (s *Service) CancelLogin() error {
	s.stopAuth()
	return nil
}

func (s *Service) stopAuth() {
	s.authMu.Lock()
	cancel := s.authCancel
	done := s.authDone
	s.authCancel = nil
	s.authDone = nil
	s.authState = authStateIdle
	s.codeCh = nil
	s.passCh = nil
	s.authMu.Unlock()

	if cancel != nil {
		cancel()
	}
	if done != nil {
		select {
		case <-done:
		case <-time.After(5 * time.Second):
		}
	}
}

func (s *Service) finishAuth(done chan struct{}, cancel context.CancelFunc) {
	cancel()
	close(done)

	s.authMu.Lock()
	if s.authDone == done {
		s.authCancel = nil
		s.authDone = nil
		s.authState = authStateIdle
		s.codeCh = nil
		s.passCh = nil
	}
	s.authMu.Unlock()
}

func (s *Service) runQR(
	ctx context.Context,
	cancel context.CancelFunc,
	done chan struct{},
	codeCh, passCh chan string,
	proxy, ntp string,
) {
	defer s.finishAuth(done, cancel)

	stg, ns, err := openTDStorage()
	if err != nil {
		s.failAuth(err)
		return
	}
	defer stg.Close()
	if err := prepareAuthStorage(ns); err != nil {
		s.failAuth(err)
		return
	}

	dispatcher := tg.NewUpdateDispatcher()
	client, err := tdlclient.New(ctx, tdlclient.Options{
		KV:               ns,
		Proxy:            resolveAuthProxy(proxy),
		NTP:              ntp,
		ReconnectTimeout: 2 * time.Minute,
		UpdateHandler:    dispatcher,
	}, true)
	if err != nil {
		s.failAuth(err)
		return
	}

	qrReady := make(chan struct{})
	var qrOnce sync.Once
	watchdog := time.AfterFunc(30*time.Second, func() {
		select {
		case <-qrReady:
			return
		default:
			s.failAuth(errors.New("Telegram connection timed out; configure a proxy in the login screen"))
			cancel()
		}
	})
	defer watchdog.Stop()

	runErr := client.Run(ctx, func(ctx context.Context) error {
		if err := s.qrAuth(ctx, client, dispatcher, passCh, qrReady, &qrOnce); err != nil {
			return err
		}

		user, err := client.Self(ctx)
		if err != nil {
			return err
		}
		s.completeAuth(ctx, ns, user, cancel)
		return nil
	})
	if runErr != nil && !isCancelled(runErr) {
		s.failAuth(runErr)
	}
}

// qrAuth handles Telegram's DC migration during QR login. A token refresh can
// return AUTH_LOGIN_TOKEN_MIGRATE_TO before it is scanned (no token), while a
// scanned token can return the migration together with a token that must be
// imported on the new DC. Both cases are handled here; only the first requires
// the user to scan a fresh QR code.
func (s *Service) qrAuth(
	ctx context.Context,
	client *gotdtelegram.Client,
	dispatcher tg.UpdateDispatcher,
	passCh chan string,
	qrReady chan struct{},
	qrOnce *sync.Once,
) error {
	for attempt := 0; attempt < 3; attempt++ {
		_, err := client.QR().Auth(
			ctx,
			qrlogin.OnLoginToken(dispatcher),
			func(_ context.Context, token qrlogin.Token) error {
				qrOnce.Do(func() { close(qrReady) })
				s.setAuthState(authStateWaitingQR)
				s.emitAuth(AuthEvent{State: "qr", QRURL: token.URL()})
				return nil
			},
		)
		if err == nil {
			return nil
		}

		var migration *qrlogin.MigrationNeededError
		if errors.As(err, &migration) && migration.MigrateTo != nil {
			if migrateErr := client.MigrateTo(ctx, migration.MigrateTo.DCID); migrateErr != nil {
				return fmt.Errorf("migrate to DC %d: %w", migration.MigrateTo.DCID, migrateErr)
			}

			if len(migration.MigrateTo.Token) > 0 {
				res, importErr := client.API().AuthImportLoginToken(ctx, migration.MigrateTo.Token)
				if importErr != nil {
					if tgerr.Is(importErr, "SESSION_PASSWORD_NEEDED") {
						return s.askPassword(ctx, client, passCh)
					}
					return fmt.Errorf("import migrated login token: %w", importErr)
				}
				success, ok := res.(*tg.AuthLoginTokenSuccess)
				if !ok {
					return fmt.Errorf("unexpected migrated login result %T", res)
				}
				if _, ok := success.Authorization.(*tg.AuthAuthorization); !ok {
					return fmt.Errorf("unexpected migrated authorization %T", success.Authorization)
				}
				return nil
			}

			// No token to import: the token expired before the migration.
			// Retry on the new DC and show a fresh QR code.
			continue
		}

		if tgerr.Is(err, "SESSION_PASSWORD_NEEDED") {
			return s.askPassword(ctx, client, passCh)
		}
		return err
	}

	return errors.New("Telegram requested too many data-center migrations")
}

func (s *Service) askPassword(
	ctx context.Context,
	client *gotdtelegram.Client,
	passCh chan string,
) error {
	s.setAuthState(authStateWaitingPassword)
	s.emitAuth(AuthEvent{State: "password"})
	password, err := waitAuthValue(ctx, passCh)
	if err != nil {
		return err
	}
	_, err = client.Auth().Password(ctx, password)
	return err
}

func (s *Service) runPhone(
	ctx context.Context,
	cancel context.CancelFunc,
	done chan struct{},
	codeCh, passCh chan string,
	phone, proxy, ntp string,
) {
	defer s.finishAuth(done, cancel)

	stg, ns, err := openTDStorage()
	if err != nil {
		s.failAuth(err)
		return
	}
	defer stg.Close()
	if err := prepareAuthStorage(ns); err != nil {
		s.failAuth(err)
		return
	}

	client, err := tdlclient.New(ctx, tdlclient.Options{
		KV:               ns,
		Proxy:            resolveAuthProxy(proxy),
		NTP:              ntp,
		ReconnectTimeout: 2 * time.Minute,
	}, true)
	if err != nil {
		s.failAuth(err)
		return
	}

	codeReady := make(chan struct{})
	var codeOnce sync.Once
	watchdog := time.AfterFunc(30*time.Second, func() {
		select {
		case <-codeReady:
			return
		default:
			s.failAuth(errors.New("Telegram connection timed out; configure a proxy in the login screen"))
			cancel()
		}
	})
	defer watchdog.Stop()

	flow := auth.NewFlow(&phoneAuthenticator{
		phone:  phone,
		codeCh: codeCh,
		passCh: passCh,
		state:  s,
		ready:  func() { codeOnce.Do(func() { close(codeReady) }) },
	}, auth.SendCodeOptions{})

	runErr := client.Run(ctx, func(ctx context.Context) error {
		if err := client.Ping(ctx); err != nil {
			return err
		}
		if err := client.Auth().IfNecessary(ctx, flow); err != nil {
			return err
		}
		user, err := client.Self(ctx)
		if err != nil {
			return err
		}
		s.completeAuth(ctx, ns, user, cancel)
		return nil
	})
	if runErr != nil && !isCancelled(runErr) {
		s.failAuth(runErr)
	}
}

type phoneAuthenticator struct {
	phone  string
	codeCh chan string
	passCh chan string
	state  *Service
	ready  func()
}

func (a *phoneAuthenticator) Phone(context.Context) (string, error) {
	return a.phone, nil
}

func (a *phoneAuthenticator) Code(ctx context.Context, _ *tg.AuthSentCode) (string, error) {
	if a.ready != nil {
		a.ready()
	}
	a.state.setAuthState(authStateWaitingCode)
	a.state.emitAuth(AuthEvent{State: "code"})
	return waitAuthValue(ctx, a.codeCh)
}

func (a *phoneAuthenticator) Password(ctx context.Context) (string, error) {
	a.state.setAuthState(authStateWaitingPassword)
	a.state.emitAuth(AuthEvent{State: "password"})
	return waitAuthValue(ctx, a.passCh)
}

func (a *phoneAuthenticator) AcceptTermsOfService(_ context.Context, tos tg.HelpTermsOfService) error {
	return &auth.SignUpRequired{TermsOfService: tos}
}

func (a *phoneAuthenticator) SignUp(context.Context) (auth.UserInfo, error) {
	return auth.UserInfo{}, errors.New("sign up is not supported by tgdesk")
}

func waitAuthValue(ctx context.Context, ch chan string) (string, error) {
	select {
	case value := <-ch:
		return value, nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

func (s *Service) completeAuth(
	ctx context.Context,
	ns storage.Storage,
	user *tg.User,
	cancel context.CancelFunc,
) {
	dto := makeAuthUser(user)
	if err := saveAuthUser(ctx, ns, dto); err != nil {
		s.failAuth(err)
		return
	}
	s.authMu.Lock()
	s.authUser = &dto
	s.authMu.Unlock()
	if err := exportTelegramDesktopTData(ns, dto); err != nil {
		log.Printf("export Telegram Desktop tdata: %v", err)
	}
	s.setAuthState(authStateSuccess)
	s.emitAuth(AuthEvent{State: authStateSuccess, User: &dto})
	cancel()
}

func (s *Service) failAuth(err error) {
	if err == nil {
		return
	}
	s.setAuthState(authStateError)
	s.emitAuth(AuthEvent{State: authStateError, Error: err.Error()})
}

func isCancelled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// AuthStatus checks for a stored tdl session and the cached user record.
func (s *Service) AuthStatus() AuthStatus {
	s.authMu.Lock()
	cached := s.authUser
	s.authMu.Unlock()
	if cached != nil {
		return AuthStatus{Authorized: true, User: cached}
	}

	stg, ns, err := openTDStorage()
	if err != nil {
		return AuthStatus{}
	}
	defer stg.Close()

	importErr := s.tryImportDesktopTData(ns)
	sessionData, _ := storage.NewSession(ns, false).LoadSession(context.Background())
	importError := ""
	if importErr != nil {
		importError = importErr.Error()
	}
	if len(sessionData) == 0 {
		return AuthStatus{ImportError: importError}
	}

	// A session/auth key can exist before authorization completes (for example
	// after a QR attempt that was never scanned). The cached user record is the
	// marker that this session completed login.
	user := loadAuthUser(ns)
	if user == nil {
		return AuthStatus{ImportError: importError}
	}
	s.authMu.Lock()
	s.authUser = user
	s.authMu.Unlock()

	return AuthStatus{
		Authorized:  true,
		User:        user,
		ImportError: importError,
	}
}

// Logout removes the tdl session and cached identity.
func (s *Service) Logout() error {
	s.stopAuth()
	s.cancelAllDownloads()
	s.stopSession()
	s.authMu.Lock()
	s.authUser = nil
	s.tdataImportAttempted = false
	s.tdataImportErr = nil
	s.authMu.Unlock()

	stg, ns, err := openTDStorage()
	if err != nil {
		return err
	}
	defer stg.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ns.Delete(ctx, keygen.New("session")); err != nil {
		return err
	}
	if err := ns.Delete(ctx, keygen.New(authUserKey)); err != nil {
		return err
	}
	return nil
}

func openTDStorage() (kv.Storage, storage.Storage, error) {
	migrateLegacySession()
	// tdata belongs to the official Telegram Desktop format. tgdesk's tdl
	// session and caches live in the project data directory instead.
	dataDir := paths.Data()
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, nil, fmt.Errorf("create portable data dir: %w", err)
	}

	stg, err := kv.NewWithMap(map[string]string{
		kv.DriverTypeKey: string(kv.DriverBolt),
		"path":           dataDir,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("open tdl storage: %w", err)
	}

	ns, err := stg.Open(tdlNamespace)
	if err != nil {
		_ = stg.Close()
		return nil, nil, fmt.Errorf("open tdl namespace: %w", err)
	}
	return stg, ns, nil
}

// resolveAuthProxy lets a fresh install pick up the conventional proxy
// environment when the login screen has no explicit proxy configured.
func resolveAuthProxy(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		for _, name := range []string{
			"HTTPS_PROXY", "https_proxy",
			"ALL_PROXY", "all_proxy",
			"HTTP_PROXY", "http_proxy",
		} {
			if env := strings.TrimSpace(os.Getenv(name)); env != "" {
				value = env
				break
			}
		}
	}
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	return value
}

// migrateLegacySession copies the old profile-backed tgdesk session into the
// portable tdata directory once. The old file is only read, never rewritten.
func migrateLegacySession() {
	target := filepath.Join(paths.Data(), tdlNamespace)
	if _, err := os.Stat(target); err == nil {
		return
	}
	if err := os.MkdirAll(paths.Data(), 0o700); err != nil {
		return
	}

	// Move the previous tgdesk session out of tdata. tdata is reserved for
	// official Telegram Desktop files from now on.
	oldPortable := filepath.Join(paths.TData(), tdlNamespace)
	if data, err := os.ReadFile(oldPortable); err == nil {
		if os.WriteFile(target, data, 0o600) == nil {
			_ = os.Remove(oldPortable)
		}
		if oldBackup, backupErr := os.ReadFile(oldPortable + ".bak"); backupErr == nil {
			_ = os.WriteFile(target+".bak", oldBackup, 0o600)
			_ = os.Remove(oldPortable + ".bak")
		}
		return
	}

	if telegramDesktopTDataPresent() {
		// A user explicitly dropped Telegram Desktop tdata into the portable
		// folder; do not shadow it with an old profile session.
		return
	}
	marker := filepath.Join(paths.Data(), ".legacy-session-migrated")
	if _, err := os.Stat(marker); err == nil {
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	legacy := filepath.Join(home, ".tdl", "data", tdlNamespace)
	if _, err := os.Stat(legacy); err != nil {
		return
	}
	data, err := os.ReadFile(legacy)
	if err != nil {
		return
	}
	if err := os.WriteFile(target, data, 0o600); err != nil {
		return
	}
	_ = os.WriteFile(marker, []byte("1"), 0o600)
}

func prepareAuthStorage(ns storage.Storage) error {
	if err := ns.Set(context.Background(), tdlkey.App(), []byte(tdlclient.AppDesktop)); err != nil {
		return fmt.Errorf("store tdl app identity: %w", err)
	}
	return nil
}

func saveAuthUser(ctx context.Context, ns storage.Storage, user AuthUser) error {
	data, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("encode auth user: %w", err)
	}
	if err := ns.Set(ctx, keygen.New(authUserKey), data); err != nil {
		return fmt.Errorf("store auth user: %w", err)
	}
	return nil
}

func loadAuthUser(ns storage.Storage) *AuthUser {
	data, err := ns.Get(context.Background(), keygen.New(authUserKey))
	if err != nil || len(data) == 0 {
		return nil
	}
	var user AuthUser
	if err := json.Unmarshal(data, &user); err != nil {
		return nil
	}
	return &user
}

func makeAuthUser(user *tg.User) AuthUser {
	first := strings.TrimSpace(user.FirstName)
	last := strings.TrimSpace(user.LastName)
	display := strings.TrimSpace(first + " " + last)
	if display == "" {
		display = strings.TrimSpace(user.Username)
	}
	if display == "" {
		display = "Telegram user"
	}

	initials := firstRune(first) + firstRune(last)
	if initials == "" {
		initials = firstRune(display)
	}
	if initials == "" {
		initials = "T"
	}

	colors := []string{"#65aadd", "#8774e1", "#4fae4e", "#f08a3c", "#e05a8a", "#5fb3a1"}
	index := int(user.ID % int64(len(colors)))
	if index < 0 {
		index = -index
	}
	restriction := ""
	if len(user.RestrictionReason) > 0 {
		restriction = user.RestrictionReason[0].Text
	}

	return AuthUser{
		ID:          user.ID,
		FirstName:   first,
		LastName:    last,
		Username:    user.Username,
		Phone:       user.Phone,
		DisplayName: display,
		Initials:    strings.ToUpper(initials),
		Color:       colors[index],
		Restricted:  user.Restricted,
		Restriction: restriction,
	}
}

func firstRune(value string) string {
	for _, r := range strings.TrimSpace(value) {
		return string(r)
	}
	return ""
}

func normalizePhone(value string) string {
	var b strings.Builder
	for _, r := range value {
		if r == '+' || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
