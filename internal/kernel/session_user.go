package kernel

import (
	"context"
	"fmt"
	"time"
)

// RefreshUser fetches the authoritative profile from Telegram and updates the
// cached identity. It is especially useful after importing a Telegram Desktop
// tdata, where only the user id is available locally until the first RPC.
func (s *Service) RefreshUser(proxy, ntp string) (*AuthUser, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	self, err := client.Self(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetch Telegram profile: %w", err)
	}

	s.sessionMu.Lock()
	session := s.session
	s.sessionMu.Unlock()
	if session == nil {
		return nil, fmt.Errorf("Telegram session is not running")
	}

	user := makeAuthUser(self)
	if err := saveAuthUser(ctx, session.ns, user); err != nil {
		return nil, err
	}

	s.authMu.Lock()
	s.authUser = &user
	s.authMu.Unlock()
	// Keep the portable Telegram Desktop folder in sync for restored logins
	// too, but never overwrite a tdata the user copied for a different account.
	s.ensureTData(session.ns, user)
	return &user, nil
}
