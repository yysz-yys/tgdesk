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

	"github.com/gotd/td/session"
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

	// loginCodeAttempts caps retries for a wrong SMS/app code before the user
	// has to start the phone login again.
	loginCodeAttempts = 4
	// loginPasswordAttempts caps retries for a wrong 2FA password.
	loginPasswordAttempts = 4
	// connectionTimeout is how long the login screen waits for Telegram to
	// respond before suggesting proxy settings.
	connectionTimeout = 40 * time.Second
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
// without opening a Telegram connection. TData points at the official
// Telegram Desktop folder written after the last login, when it still matches
// this session.
type AuthStatus struct {
	Authorized  bool         `json:"authorized"`
	User        *AuthUser    `json:"user,omitempty"`
	ImportError string       `json:"importError,omitempty"`
	TData       *TDataExport `json:"tData,omitempty"`
	TDataError  string       `json:"tDataError,omitempty"`
}

// AuthEvent is pushed to the WebView over the "auth:event" event.
type AuthEvent struct {
	State string    `json:"state"`
	QRURL string    `json:"qrUrl,omitempty"`
	User  *AuthUser `json:"user,omitempty"`
	Error string    `json:"error,omitempty"`

	// QRExpiresIn is the remaining lifetime of QRURL in seconds. Telegram
	// rotates the token automatically; the UI can show a countdown.
	QRExpiresIn int `json:"qrExpiresIn,omitempty"`
	// Phone is the normalized international number ("+8613800138000").
	Phone string `json:"phone,omitempty"`
	// CodeType is one of app, sms, call, flash_call, missed_call, email,
	// fragment_sms or unknown.
	CodeType string `json:"codeType,omitempty"`
	// CodeLength is the number of digits Telegram expects (0 if unknown).
	CodeLength int `json:"codeLength,omitempty"`
	// CodeTimeout is the number of seconds Telegram asks the client to wait
	// before requesting another code.
	CodeTimeout int `json:"codeTimeout,omitempty"`
	// Resent reports that this code event is the result of ResendCode.
	Resent bool `json:"resent,omitempty"`
	// PasswordHint is the hint configured for the cloud password.
	PasswordHint string `json:"passwordHint,omitempty"`
	// NextCodeType reports how Telegram will resend the code next.
	NextCodeType string `json:"nextCodeType,omitempty"`
	// ErrorCode is the stable machine-readable Telegram error, for example
	// PHONE_CODE_INVALID or FLOOD_WAIT.
	ErrorCode string `json:"errorCode,omitempty"`
	// RetryAfter is set for FLOOD_WAIT errors (seconds).
	RetryAfter int `json:"retryAfter,omitempty"`
	// TData describes the Telegram Desktop files written after login.
	TData      *TDataExport `json:"tData,omitempty"`
	TDataError string       `json:"tDataError,omitempty"`
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

func (s *Service) authChannels() (string, chan string, chan string, chan struct{}) {
	s.authMu.Lock()
	defer s.authMu.Unlock()
	return s.authState, s.codeCh, s.passCh, s.resendCh
}

// StartQR begins a real Telegram QR login. It returns immediately; progress
// arrives through AuthEvent.
func (s *Service) StartQR(proxy, ntp string) error {
	s.stopAuth()
	s.resetAuthUser()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	codeCh := make(chan string, 1)
	passCh := make(chan string, 1)
	resendCh := make(chan struct{}, 1)

	s.authMu.Lock()
	s.authCancel = cancel
	s.authDone = done
	s.codeCh = codeCh
	s.passCh = passCh
	s.resendCh = resendCh
	s.authState = authStateStarting
	s.authMu.Unlock()

	s.emitAuth(AuthEvent{State: authStateStarting})
	go s.runQR(ctx, cancel, done, codeCh, passCh, proxy, ntp)
	return nil
}

// StartPhone begins the phone -> code -> optional 2FA flow.
func (s *Service) StartPhone(phone, proxy, ntp string) error {
	phone = normalizePhone(phone)
	if len(phone) < 7 || len(phone) > 20 {
		return errors.New("invalid phone number")
	}
	if !strings.HasPrefix(phone, "+") {
		phone = "+" + phone
	}

	s.stopAuth()
	s.resetAuthUser()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	codeCh := make(chan string, 1)
	passCh := make(chan string, 1)
	resendCh := make(chan struct{}, 1)

	s.authMu.Lock()
	s.authCancel = cancel
	s.authDone = done
	s.codeCh = codeCh
	s.passCh = passCh
	s.resendCh = resendCh
	s.authState = authStateStarting
	s.authMu.Unlock()

	s.emitAuth(AuthEvent{State: authStateStarting, Phone: phone})
	go s.runPhone(ctx, cancel, done, codeCh, passCh, resendCh, phone, proxy, ntp)
	return nil
}

func (s *Service) resetAuthUser() {
	s.authMu.Lock()
	s.authUser = nil
	s.authMu.Unlock()
}

// SubmitCode delivers the login code shown by Telegram.
func (s *Service) SubmitCode(code string) error {
	state, ch, _, _ := s.authChannels()
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

// ResendCode asks Telegram for a new login code. Only valid while waiting for
// a phone code; the run goroutine performs the RPC and emits a fresh "code"
// event.
func (s *Service) ResendCode() error {
	state, _, _, ch := s.authChannels()
	if state != authStateWaitingCode || ch == nil {
		return errors.New("not waiting for a login code")
	}
	select {
	case ch <- struct{}{}:
		return nil
	default:
		return errors.New("code resend already in progress")
	}
}

func (s *Service) SubmitPassword(password string) error {
	state, _, ch, _ := s.authChannels()
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
	s.resendCh = nil
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
		s.resendCh = nil
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
	watchdog := time.AfterFunc(connectionTimeout, func() {
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
				s.emitAuth(AuthEvent{
					State:       "qr",
					QRURL:       token.URL(),
					QRExpiresIn: qrExpiresIn(token),
				})
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

func qrExpiresIn(token qrlogin.Token) int {
	expires := token.Expires()
	if expires.IsZero() {
		return 0
	}
	seconds := int(time.Until(expires).Seconds())
	if seconds < 0 {
		return 0
	}
	return seconds
}

func (s *Service) askPassword(
	ctx context.Context,
	client *gotdtelegram.Client,
	passCh chan string,
) error {
	hint := ""
	if password, err := client.API().AccountGetPassword(ctx); err == nil {
		if password.HasPassword {
			hint = password.Hint
		}
	}

	for attempt := 0; attempt < loginPasswordAttempts; attempt++ {
		s.setAuthState(authStateWaitingPassword)
		s.emitAuth(AuthEvent{State: "password", PasswordHint: hint})
		password, err := waitAuthValue(ctx, passCh)
		if err != nil {
			return err
		}
		s.setAuthState(authStateVerifying)
		if _, err := client.Auth().Password(ctx, password); err == nil {
			return nil
		} else if errors.Is(err, auth.ErrPasswordInvalid) || tgerr.Is(err, "PASSWORD_HASH_INVALID") {
			s.setAuthState(authStateWaitingPassword)
			s.emitAuth(AuthEvent{
				State:     authStateError,
				ErrorCode: "PASSWORD_HASH_INVALID",
				Error:     "The two-step verification password is incorrect.",
			})
			continue
		} else {
			return err
		}
	}
	return errors.New("too many incorrect two-step verification passwords")
}

func (s *Service) runPhone(
	ctx context.Context,
	cancel context.CancelFunc,
	done chan struct{},
	codeCh, passCh chan string,
	resendCh chan struct{},
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
	watchdog := time.AfterFunc(connectionTimeout, func() {
		select {
		case <-codeReady:
			return
		default:
			s.failAuth(errors.New("Telegram connection timed out; configure a proxy in the login screen"))
			cancel()
		}
	})
	defer watchdog.Stop()

	runErr := client.Run(ctx, func(ctx context.Context) error {
		if err := client.Ping(ctx); err != nil {
			return err
		}
		if err := s.phoneAuth(ctx, client, phone, codeCh, passCh, resendCh, func() {
			codeOnce.Do(func() { close(codeReady) })
		}); err != nil {
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

// phoneAuth drives auth.sendCode -> auth.signIn -> auth.checkPassword itself
// instead of auth.Flow, because the login UI needs the code type/length,
// resend support and the cloud-password hint.
func (s *Service) phoneAuth(
	ctx context.Context,
	client *gotdtelegram.Client,
	phone string,
	codeCh, passCh chan string,
	resendCh chan struct{},
	ready func(),
) error {
	sent, err := client.Auth().SendCode(ctx, phone, auth.SendCodeOptions{})
	if err != nil {
		return fmt.Errorf("send login code: %w", err)
	}
	if ready != nil {
		ready()
	}

	authSent, ok := sent.(*tg.AuthSentCode)
	if !ok {
		if _, success := sent.(*tg.AuthSentCodeSuccess); success {
			// The session is already authorized.
			return nil
		}
		return fmt.Errorf("unexpected send-code result %T", sent)
	}

	hash := authSent.PhoneCodeHash
	s.emitSentCode(authSent, phone, false)
	s.setAuthState(authStateWaitingCode)

	for attempt := 0; attempt < loginCodeAttempts; attempt++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-resendCh:
			resent, err := client.Auth().ResendCode(ctx, phone, hash)
			if err != nil {
				s.emitAuthError(err)
				continue
			}
			if next, ok := resent.(*tg.AuthSentCode); ok {
				hash = next.PhoneCodeHash
				s.emitSentCode(next, phone, true)
				continue
			}
			if _, ok := resent.(*tg.AuthSentCodeSuccess); ok {
				return nil
			}
			s.emitAuth(AuthEvent{
				State:     authStateError,
				ErrorCode: "RESEND_FAILED",
				Error:     "Telegram did not return a new login code.",
			})
		case code := <-codeCh:
			s.setAuthState(authStateVerifying)
			_, err := client.Auth().SignIn(ctx, phone, code, hash)
			if err == nil {
				return nil
			}
			if errors.Is(err, auth.ErrPasswordAuthNeeded) || tgerr.Is(err, "SESSION_PASSWORD_NEEDED") {
				return s.askPassword(ctx, client, passCh)
			}
			if isLoginCodeError(err) {
				s.setAuthState(authStateWaitingCode)
				s.emitAuth(AuthEvent{
					State:     authStateError,
					ErrorCode: "PHONE_CODE_INVALID",
					Error:     "The login code is invalid or expired.",
				})
				continue
			}
			return err
		}
	}
	return errors.New("too many incorrect login codes")
}

func (s *Service) emitSentCode(sent *tg.AuthSentCode, phone string, resent bool) {
	codeType, length := tdesktopCodeInfo(sent)
	s.emitAuth(AuthEvent{
		State:        "code",
		Phone:        phone,
		CodeType:     codeType,
		CodeLength:   length,
		CodeTimeout:  sent.Timeout,
		NextCodeType: tdesktopNextCodeType(sent.NextType),
		Resent:       resent,
	})
}

func (s *Service) emitAuthError(err error) {
	code, retryAfter, message := classifyAuthError(err)
	s.emitAuth(AuthEvent{
		State:      authStateError,
		ErrorCode:  code,
		RetryAfter: retryAfter,
		Error:      message,
	})
}

// classifyAuthError turns a Telegram/gotd error into a stable code the UI can
// localize, plus a short English fallback and an optional flood-wait delay.
func classifyAuthError(err error) (code string, retryAfter int, message string) {
	if err == nil {
		return "", 0, ""
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "CANCELLED", 0, "Login was cancelled."
	}
	if delay, ok := tgerr.AsFloodWait(err); ok {
		seconds := int(delay.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		return "FLOOD_WAIT", seconds, fmt.Sprintf("Too many attempts. Try again in %d seconds.", seconds)
	}
	if apiErr, ok := tgerr.As(err); ok {
		code = apiErr.Type
		message = apiErr.Error()
		if code == "" {
			code = "TELEGRAM_ERROR"
		}
		return code, 0, message
	}
	message = err.Error()
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "timed out"),
		strings.Contains(lower, "timeout"),
		strings.Contains(lower, "deadline exceeded"),
		strings.Contains(lower, "connection refused"),
		strings.Contains(lower, "no such host"),
		strings.Contains(lower, "connect:"):
		return "NETWORK", 0, "Could not reach Telegram. Check the network or proxy settings."
	case strings.Contains(lower, "database"), strings.Contains(lower, "bbolt"),
		strings.Contains(lower, "bolt"), strings.Contains(lower, "namespace"):
		return "STORAGE", 0, "The local session database is busy."
	case strings.Contains(lower, "tdata"), strings.Contains(lower, "Telegram Desktop"):
		return "TDATA", 0, message
	}
	return "UNKNOWN", 0, message
}

func (s *Service) failAuth(err error) {
	if err == nil {
		return
	}
	code, retryAfter, message := classifyAuthError(err)
	s.setAuthState(authStateError)
	s.emitAuth(AuthEvent{
		State:      authStateError,
		ErrorCode:  code,
		RetryAfter: retryAfter,
		Error:      message,
	})
}

func isLoginCodeError(err error) bool {
	return tgerr.Is(err, "PHONE_CODE_INVALID", "PHONE_CODE_EXPIRED", "PHONE_CODE_EMPTY",
		"PHONE_CODE_HASH_EMPTY", "PHONE_CODE_HASH_EXPIRED")
}

func tdesktopCodeInfo(sent *tg.AuthSentCode) (string, int) {
	switch value := sent.Type.(type) {
	case *tg.AuthSentCodeTypeApp:
		return "app", value.Length
	case *tg.AuthSentCodeTypeSMS:
		return "sms", value.Length
	case *tg.AuthSentCodeTypeCall:
		return "call", value.Length
	case *tg.AuthSentCodeTypeFlashCall:
		return "flash_call", 0
	case *tg.AuthSentCodeTypeMissedCall:
		return "missed_call", value.Length
	case *tg.AuthSentCodeTypeEmailCode:
		return "email", value.Length
	case *tg.AuthSentCodeTypeFragmentSMS:
		return "fragment_sms", value.Length
	default:
		return "unknown", 0
	}
}

func tdesktopNextCodeType(next tg.AuthCodeTypeClass) string {
	switch next.(type) {
	case *tg.AuthCodeTypeSMS:
		return "sms"
	case *tg.AuthCodeTypeCall:
		return "call"
	case *tg.AuthCodeTypeFlashCall:
		return "flash_call"
	case *tg.AuthCodeTypeMissedCall:
		return "missed_call"
	case *tg.AuthCodeTypeFragmentSMS:
		return "fragment_sms"
	default:
		return ""
	}
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

	export, exportErr := exportTelegramDesktopTData(ns, dto)
	exportError := ""
	if exportErr != nil {
		exportError = exportErr.Error()
		log.Printf("export Telegram Desktop tdata: %v", exportErr)
	}

	s.authMu.Lock()
	s.authUser = &dto
	s.tdataEnsured = exportErr == nil
	s.authMu.Unlock()

	s.setAuthState(authStateSuccess)
	s.emitAuth(AuthEvent{
		State:      authStateSuccess,
		User:       &dto,
		TData:      export,
		TDataError: exportError,
	})
	cancel()
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
		return AuthStatus{Authorized: true, User: cached, TData: s.currentTData(cached)}
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
		TData:       s.currentTData(user),
	}
}

// currentTData returns the recorded export when it still describes this user.
func (s *Service) currentTData(user *AuthUser) *TDataExport {
	if user == nil {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(paths.Data(), "tdata-export.json"))
	if err != nil {
		return nil
	}
	var record TDataExport
	if json.Unmarshal(data, &record) != nil {
		return nil
	}
	if record.UserID != user.ID {
		return nil
	}
	if _, err := os.Stat(filepath.Join(paths.TData(), "key_datas")); err != nil {
		return nil
	}
	export := TDataExport(record)
	return &export
}

// Logout removes the tdl session and cached identity. Telegram Desktop files
// are kept: they are a portable artifact the user may still want.
func (s *Service) Logout() error {
	s.stopAuth()
	s.cancelAllDownloads()
	s.stopSession()
	s.authMu.Lock()
	s.authUser = nil
	s.tdataImportAttempted = false
	s.tdataImportErr = nil
	s.tdataEnsured = false
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
			"HTTP_PROXY", "http_proxy",
			"ALL_PROXY", "all_proxy",
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
// portable data directory once. The old file is only read, never rewritten.
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

// normalizePhone keeps an optional leading "+" and digits, dropping spaces,
// dashes, parentheses and other separators. The login screen submits
// "+<country> <national number>", so "+86 13800138000" becomes
// "+8613800138000" before it reaches Telegram.
func normalizePhone(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
			continue
		}
		if r == '+' && b.Len() == 0 {
			b.WriteRune('+')
		}
	}
	return b.String()
}

// ExportTData rewrites the portable tdata folder from the current authorized
// session. The UI exposes it as a recovery action when the automatic export
// failed or the folder was deleted.
func (s *Service) ExportTData() (*TDataExport, error) {
	s.authMu.Lock()
	user := s.authUser
	s.authMu.Unlock()

	stg, ns, err := openTDStorage()
	if err != nil {
		return nil, err
	}
	defer stg.Close()
	if user == nil {
		user = loadAuthUser(ns)
	}
	if user == nil {
		return nil, errors.New("not signed in")
	}
	export, err := exportTelegramDesktopTData(ns, *user)
	if err != nil {
		return nil, err
	}
	s.authMu.Lock()
	s.tdataEnsured = true
	s.authMu.Unlock()
	return export, nil
}

// EnsureTData exports the current session to tdata when it is missing or when
// the recorded export belongs to a different account. Foreign tdata copied by
// the user is left untouched.
func (s *Service) ensureTData(ns storage.Storage, user AuthUser) {
	s.authMu.Lock()
	if s.tdataEnsured {
		s.authMu.Unlock()
		return
	}
	s.authMu.Unlock()

	loaded, err := (&session.Loader{Storage: storage.NewSession(ns, false)}).Load(context.Background())
	if err != nil {
		return
	}
	if telegramDesktopTDataPresent() && tdataMatchesSession(loaded, user.ID) {
		s.authMu.Lock()
		s.tdataEnsured = true
		s.authMu.Unlock()
		return
	}

	if _, err := exportTelegramDesktopTData(ns, user); err != nil {
		log.Printf("ensure Telegram Desktop tdata: %v", err)
		return
	}
	s.authMu.Lock()
	s.tdataEnsured = true
	s.authMu.Unlock()
}
