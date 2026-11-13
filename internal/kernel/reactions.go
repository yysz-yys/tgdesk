package kernel

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// SendReaction sets or clears the current user's reaction on a message. An empty
// emoji removes the reaction, matching the Telegram clients' toggle behaviour.
func (s *Service) SendReaction(
	chatID string,
	messageID int,
	emoji string,
	customEmojiID string,
	proxy, ntp string,
) error {
	if messageID <= 0 {
		return fmt.Errorf("invalid message")
	}
	emoji = strings.TrimSpace(emoji)
	if len([]rune(emoji)) > 8 {
		return fmt.Errorf("reaction is too long")
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	s.rememberPeer(peer)

	request := &tg.MessagesSendReactionRequest{
		Peer:  peer,
		MsgID: messageID,
	}
	documentID, _ := strconv.ParseInt(strings.TrimSpace(customEmojiID), 10, 64)
	if documentID != 0 {
		request.Reaction = []tg.ReactionClass{
			&tg.ReactionCustomEmoji{DocumentID: documentID},
		}
	} else if emoji != "" {
		request.Reaction = []tg.ReactionClass{
			&tg.ReactionEmoji{Emoticon: emoji},
		}
	} else {
		// An explicitly empty reaction vector removes the current reaction.
		request.SetReaction([]tg.ReactionClass{})
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		if _, err := client.API().MessagesSendReaction(ctx, request); err != nil {
			return fmt.Errorf("send reaction: %w", err)
		}
		return nil
	})
}
