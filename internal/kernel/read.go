package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// MarkChatsRead clears the server-side unread counter for every supplied peer.
// max_id=0 means "everything up to the latest message" for both channels and
// ordinary chats, which is what Telegram's "Mark all as read" uses.
func (s *Service) MarkChatsRead(chatIDs []string, proxy, ntp string) error {
	if len(chatIDs) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var firstErr error
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		for _, chatID := range chatIDs {
			peer, err := parsePeerID(chatID)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			s.rememberPeer(peer)
			if channel, ok := peer.(*tg.InputPeerChannel); ok {
				if _, err := client.API().ChannelsReadHistory(ctx, &tg.ChannelsReadHistoryRequest{
					Channel: &tg.InputChannel{
						ChannelID:  channel.ChannelID,
						AccessHash: channel.AccessHash,
					},
					MaxID: 0,
				}); err != nil && firstErr == nil {
					firstErr = fmt.Errorf("mark channel read: %w", err)
				}
				continue
			}
			if _, err := client.API().MessagesReadHistory(ctx, &tg.MessagesReadHistoryRequest{
				Peer:  peer,
				MaxID: 0,
			}); err != nil && firstErr == nil {
				firstErr = fmt.Errorf("mark chat read: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if firstErr != nil {
		return firstErr
	}
	s.dialogsCacheMu.Lock()
	s.dialogsCache = make(map[string]dialogsCacheEntry)
	s.dialogsCacheMu.Unlock()
	return nil
}
