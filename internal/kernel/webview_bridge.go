package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// Mini-app bridge backend. Telegram Web K and the official clients keep an open
// mini app alive on the server side with messages.prolongWebView and relay the
// app's `web_app_data_send` payload with messages.sendWebViewData. Both requests
// are bot-scoped in layer 222:
//   - messages.sendWebViewData{bot, random_id, button_text, data}: no peer and no
//     query id, so the dialog/query arguments are frontend context only;
//   - messages.prolongWebView{peer, bot, query_id, ...}: extends the interaction
//     opened by messages.requestWebView (the BotWebViewDTO.QueryID).
// The kernel stays UI-agnostic: it merely forwards the bridge calls.

// maxWebViewDataBytes is the documented size limit of a web_app_data_send
// payload (4 KB). Rejecting it locally gives the overlay a readable error instead
// of a raw RPC failure.
const maxWebViewDataBytes = 4096

// SendWebViewData relays one `web_app_data_send` payload to the owning bot
// (messages.sendWebViewData). chatID/queryID mirror the frontend bridge context
// and are validated for caller errors, but the TL request itself carries only the
// bot, a random id, the button text and the payload.
func (s *Service) SendWebViewData(
	chatID, botPeerID string,
	queryID int64,
	data string,
	proxy, ntp string,
) error {
	if _, err := parsePeerID(chatID); err != nil {
		return err
	}
	if queryID < 0 {
		return fmt.Errorf("send web app data: invalid session")
	}
	if len(data) > maxWebViewDataBytes {
		return fmt.Errorf("send web app data: payload is too large (max %d bytes)", maxWebViewDataBytes)
	}
	bot, err := webViewBotInputUser(botPeerID)
	if err != nil {
		return err
	}

	randomID := time.Now().UnixNano()
	if randomID < 0 {
		randomID = -randomID
	}
	request := &tg.MessagesSendWebViewDataRequest{
		Bot:        bot,
		RandomID:   randomID,
		ButtonText: "", // regular bot mini apps have no simple-web-view button text
		Data:       data,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		if _, err := client.API().MessagesSendWebViewData(ctx, request); err != nil {
			return readableRPCError("send web app data", err)
		}
		return nil
	})
}

// ProlongWebView extends the server-side lifetime of an open mini app
// (messages.prolongWebView). The overlay calls it every ~50 s while the app is
// open; an expired query id is reported as a readable session error.
func (s *Service) ProlongWebView(
	chatID, botPeerID string,
	queryID int64,
	proxy, ntp string,
) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	bot, err := webViewBotInputUser(botPeerID)
	if err != nil {
		return err
	}
	if queryID <= 0 {
		return fmt.Errorf("prolong web app: invalid session")
	}
	s.rememberPeer(peer)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	request := &tg.MessagesProlongWebViewRequest{
		Peer:    peer,
		Bot:     bot,
		QueryID: queryID,
	}
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		if _, err := client.API().MessagesProlongWebView(ctx, request); err != nil {
			return readableRPCError("prolong web app", err)
		}
		return nil
	})
}

// webViewBotInputUser decodes the encoded bot peer id ("user:<id>:<hash>") into
// the TL input user the web-view bridge RPCs take.
func webViewBotInputUser(botPeerID string) (*tg.InputUser, error) {
	peer, err := parsePeerID(botPeerID)
	if err != nil {
		return nil, fmt.Errorf("invalid bot: %w", err)
	}
	user, ok := peer.(*tg.InputPeerUser)
	if !ok || user.UserID == 0 {
		return nil, fmt.Errorf("web app owner is not a bot")
	}
	return &tg.InputUser{UserID: user.UserID, AccessHash: user.AccessHash}, nil
}
