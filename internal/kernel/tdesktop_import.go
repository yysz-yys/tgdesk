package kernel

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gotd/td/session"
	"github.com/gotd/td/session/tdesktop"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/storage"

	"tgdesk/internal/paths"
)

// Telegram Desktop stores its files under hashed names inside tdata. These are
// the names gotd's tdesktop reader looks for.
var tdesktopKeyFiles = []string{"key_data0", "key_data1", "key_datas"}

var telegramProductionDCs = map[int]string{
	1: "149.154.175.53:443",
	2: "149.154.167.51:443",
	3: "149.154.175.100:443",
	4: "149.154.167.91:443",
	5: "91.108.56.130:443",
}

func telegramDesktopTDataPresent() bool {
	for _, name := range tdesktopKeyFiles {
		if info, err := os.Stat(filepath.Join(paths.TData(), name)); err == nil && info.Mode().IsRegular() {
			return true
		}
	}
	return false
}

func (s *Service) tryImportDesktopTData(ns storage.Storage) error {
	s.authMu.Lock()
	if s.tdataImportAttempted {
		err := s.tdataImportErr
		s.authMu.Unlock()
		return err
	}
	s.tdataImportAttempted = true
	s.authMu.Unlock()

	err := importDesktopTData(ns, nil)

	s.authMu.Lock()
	s.tdataImportErr = err
	s.authMu.Unlock()
	return err
}

func importDesktopTData(ns storage.Storage, passcode []byte) error {
	if !telegramDesktopTDataPresent() {
		return nil
	}
	fingerprint := tdataFingerprint()
	marker := filepath.Join(paths.Data(), ".telegram-desktop-import")
	if data, err := os.ReadFile(marker); err == nil && string(data) == fingerprint {
		return nil
	}

	sessionStorage := storage.NewSession(ns, false)
	current, _ := sessionStorage.LoadSession(context.Background())
	if len(current) > 0 {
		// The user copied a new Telegram Desktop tdata over an existing
		// portable login. Keep a rollback copy before replacing it.
		sessionFile := filepath.Join(paths.Data(), tdlNamespace)
		if data, err := os.ReadFile(sessionFile); err == nil {
			_ = os.WriteFile(sessionFile+".bak", data, 0o600)
		}
	}

	accounts, err := tdesktop.Read(paths.TData(), passcode)
	if err != nil {
		return fmt.Errorf("read Telegram Desktop tdata: %w", err)
	}
	if len(accounts) == 0 {
		return fmt.Errorf("Telegram Desktop tdata contains no accounts")
	}

	var lastErr error
	for _, account := range accounts {
		data, err := desktopSessionData(account)
		if err != nil {
			lastErr = err
			continue
		}
		loader := session.Loader{Storage: sessionStorage}
		if err := loader.Save(context.Background(), data); err != nil {
			return fmt.Errorf("store imported Telegram Desktop session: %w", err)
		}

		user := makeAuthUser(&tg.User{
			ID:        int64(account.Authorization.UserID),
			FirstName: "Telegram Desktop",
		})
		if err := saveAuthUser(context.Background(), ns, user); err != nil {
			return fmt.Errorf("store imported Telegram Desktop user: %w", err)
		}
		_ = os.MkdirAll(paths.Data(), 0o700)
		_ = os.WriteFile(marker, []byte(fingerprint), 0o600)
		return nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("Telegram Desktop tdata has no usable account")
	}
	return fmt.Errorf("import Telegram Desktop tdata: %w", lastErr)
}

func tdataFingerprint() string {
	entries, err := os.ReadDir(paths.TData())
	if err != nil {
		return ""
	}
	hash := sha256.New()
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !isTDataAuthFile(name) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		_, _ = fmt.Fprintf(hash, "%s:%d:%d\n", name, info.Size(), info.ModTime().UnixNano())
	}
	return hex.EncodeToString(hash.Sum(nil))
}

// Only authorization/key files affect the imported session. Telegram Desktop
// constantly rewrites caches and settings; including those would re-import the
// same login on every launch.
func isTDataAuthFile(name string) bool {
	if len(name) >= len("key_data") && name[:len("key_data")] == "key_data" {
		return true
	}
	if len(name) != 17 {
		return false
	}
	for i := 0; i < 16; i++ {
		c := name[i]
		if (c < '0' || c > '9') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return name[16] == '0' || name[16] == '1' || name[16] == 's'
}

func desktopSessionData(account tdesktop.Account) (*session.Data, error) {
	authorization := account.Authorization
	if authorization.UserID == 0 {
		return nil, fmt.Errorf("Telegram Desktop account has no user id")
	}
	if authorization.MainDC <= 0 {
		return nil, fmt.Errorf("Telegram Desktop account has invalid main DC %d", authorization.MainDC)
	}
	key, ok := authorization.Keys[authorization.MainDC]
	if !ok || key.Zero() {
		return nil, fmt.Errorf("Telegram Desktop account has no key for DC %d", authorization.MainDC)
	}

	addr, options := desktopDCOptions(account, authorization.MainDC)
	if addr == "" {
		return nil, fmt.Errorf("Telegram Desktop account has no address for DC %d", authorization.MainDC)
	}

	authKey := make([]byte, len(key))
	copy(authKey, key[:])
	keyID := key.ID()

	return &session.Data{
		Config: session.Config{
			ThisDC:    authorization.MainDC,
			TestMode:  account.Config.Environment.Test(),
			DCOptions: options,
		},
		DC:        authorization.MainDC,
		Addr:      addr,
		AuthKey:   authKey,
		AuthKeyID: keyID[:],
	}, nil
}

func desktopDCOptions(account tdesktop.Account, mainDC int) (string, []tg.DCOption) {
	var (
		addr    string
		options []tg.DCOption
	)
	for _, item := range account.Config.DCOptions.Options {
		if item.CDN() || item.IP == "" || item.Port <= 0 {
			continue
		}
		option := tg.DCOption{
			ID:                int(item.ID),
			IPAddress:         item.IP,
			Port:              int(item.Port),
			Ipv6:              item.IPv6(),
			MediaOnly:         item.MediaOnly(),
			TCPObfuscatedOnly: item.TCPOOnly(),
			Static:            item.Static(),
			Secret:            item.Secret,
		}
		options = append(options, option)
		if int(item.ID) == mainDC && addr == "" {
			addr = net.JoinHostPort(item.IP, strconv.Itoa(int(item.Port)))
		}
	}
	if addr == "" {
		addr = telegramProductionDCs[mainDC]
	}
	return addr, options
}
