package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// StartBot starts a conversation with a private bot through messages.startBot,
// the RPC Telegram Web K calls from the composer's START plate
// (appMessagesManager.startBot -> input.ts:2478-2498). The same call also lifts
// a block the current account placed on the bot, which is why Web K shows the
// START plate for blocked bots as well.
//
// startParam is the bot deep-link payload ("start" parameter); an empty string
// is the plain START button. The bot's /start answer arrives over the normal
// chat event stream, so nothing is returned to the UI.
func (s *Service) StartBot(chatID, startParam, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	userPeer, ok := peer.(*tg.InputPeerUser)
	if !ok {
		return fmt.Errorf("start bot: the chat is not a private bot chat")
	}

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	randomID := time.Now().UnixNano()
	if randomID < 0 {
		randomID = -randomID
	}
	request := &tg.MessagesStartBotRequest{
		Bot: &tg.InputUser{
			UserID:     userPeer.UserID,
			AccessHash: userPeer.AccessHash,
		},
		Peer:       peer,
		RandomID:   randomID,
		StartParam: startParam,
	}
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		if _, err := client.API().MessagesStartBot(ctx, request); err != nil {
			return readableRPCError("start bot", err)
		}
		return nil
	})
}
