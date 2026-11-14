package kernel

import (
	"context"
	"time"

	"github.com/gotd/td/telegram"
)

// GetActiveSessionCount returns the number of devices currently logged into this
// account, as reported by account.getAuthorizations. The Settings "Devices" row
// shows it.
func (s *Service) GetActiveSessionCount(proxy, ntp string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	count := 0
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		authorizations, err := client.API().AccountGetAuthorizations(ctx)
		if err != nil {
			return readableRPCError("get active sessions", err)
		}
		if authorizations == nil {
			return nil
		}
		count = len(authorizations.Authorizations)
		return nil
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}
