package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// GetPinnedMessage returns the chat's current pinned message, or nil when the
// chat has none. Telegram Web renders the pinned bar from exactly this query:
// messages.search with inputMessagesFilterPinned, newest pinned message first.
// The message is mapped through the regular history path, so media/thumbnails,
// sender avatars and reactions are identical to the chat bubbles.
func (s *Service) GetPinnedMessage(chatID, proxy, ntp string) (*MessageDTO, error) {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	var result *MessageDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().MessagesSearch(ctx, &tg.MessagesSearchRequest{
			Peer:   peer,
			Q:      "",
			Filter: &tg.InputMessagesFilterPinned{},
			Limit:  1,
		})
		if err != nil {
			return fmt.Errorf("get pinned message: %w", err)
		}
		messages, users, chats, ok := messagesList(response)
		if !ok || len(messages) == 0 {
			return nil
		}
		mapped := s.mapHistoryMessages(ctx, client, peer, chatID, messages, users, chats, proxy, ntp)
		if len(mapped) > 0 {
			message := mapped[0]
			result = &message
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// UpdatePinnedMessage pins or unpins one message (messages.updatePinnedMessage).
// It is the action behind the pinned bar's X / "Unpin" item: Web K unpins the
// message the plate shows, not the whole pinned list (tweb
// `showPinMessagePopup(peerId, mid, true)`). The caller keeps UnpinAllMessages
// for "Unpin all messages".
func (s *Service) UpdatePinnedMessage(
	chatID string,
	messageID int,
	unpin, silent bool,
	proxy, ntp string,
) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	if messageID <= 0 {
		return fmt.Errorf("invalid message id")
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesUpdatePinnedMessage(ctx, &tg.MessagesUpdatePinnedMessageRequest{
			Peer:   peer,
			ID:     messageID,
			Unpin:  unpin,
			Silent: silent,
		})
		if err != nil {
			if unpin {
				return fmt.Errorf("unpin message: %w", err)
			}
			return fmt.Errorf("pin message: %w", err)
		}
		return nil
	})
}

// UnpinAllMessages removes every pinned message from the chat
// (messages.unpinAllMessages). It is the action behind Telegram Web's
// "Unpin all messages" in the pinned bar.
func (s *Service) UnpinAllMessages(chatID, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesUnpinAllMessages(ctx, &tg.MessagesUnpinAllMessagesRequest{
			Peer: peer,
		})
		if err != nil {
			return fmt.Errorf("unpin all messages: %w", err)
		}
		return nil
	})
}
