package kernel

import (
	"context"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

// webAppPlatform is the platform string sent with messages.requestWebView. The
// web client uses "web"; Telegram Desktop uses "tdesktop". Bots may branch on
// it, so keep the web value the reference web client sends.
const webAppPlatform = "web"

// BotCallbackResultDTO is the answer of messages.getBotCallbackAnswer: an alert
// to show modally, a URL to open, or a message state to refresh. The bot's
// actual edit/new message arrives as an update; the kernel also fetches the
// pressed message afterwards and returns it here so the open chat updates even
// when the callback RPC was the only carrier (the same message is emitted on the
// live bridge as an "edit" event).
type BotCallbackResultDTO struct {
	Alert     string      `json:"alert,omitempty"`
	URL       string      `json:"url,omitempty"`
	Message   *MessageDTO `json:"message,omitempty"`
	CacheTime int         `json:"cacheTime,omitempty"`
}

// BotWebViewDTO is the authenticated mini-app launch data returned by
// messages.requestWebView. URL already carries the signed tgWebAppData query
// parameters, so the wrapper page can load it as-is; QueryID is only present for
// inline-button/menu-button apps and can be used for prolongWebView.
type BotWebViewDTO struct {
	URL     string `json:"url"`
	QueryID int64  `json:"queryId,omitempty"`
}

// SendBotCallback presses an inline-keyboard callback button. dataHex is the
// hex-encoded KeyboardButtonCallback.Data exactly as exposed by
// MessageButtonDTO.Data. FLOOD_WAIT and BOT_RESPONSE_TIMEOUT become readable
// errors, and the post-click state of the message is returned/emitted so the
// keyboard and bubble can update.
func (s *Service) SendBotCallback(
	chatID string,
	messageID int,
	dataHex, proxy, ntp string,
) (*BotCallbackResultDTO, error) {
	if messageID <= 0 {
		return nil, fmt.Errorf("invalid message id")
	}
	data, err := hex.DecodeString(strings.TrimSpace(dataHex))
	if err != nil {
		return nil, fmt.Errorf("invalid callback data: %w", err)
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	ctx, cancel := context.WithTimeout(context.Background(), 65*time.Second)
	defer cancel()

	s.chatMu.Lock()
	var result *BotCallbackResultDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		answer, err := client.API().MessagesGetBotCallbackAnswer(ctx, &tg.MessagesGetBotCallbackAnswerRequest{
			Peer:  peer,
			MsgID: messageID,
			Data:  data,
		})
		if err != nil {
			return readableRPCError("bot callback", err)
		}
		result = &BotCallbackResultDTO{CacheTime: answer.CacheTime}
		if answer.Alert {
			result.Alert = answer.Message
		}
		if answer.HasURL {
			result.URL = answer.URL
		}
		result.Message = s.callbackMessageState(ctx, client, peer, chatID, messageID, proxy, ntp)
		return nil
	})
	s.chatMu.Unlock()
	if err != nil {
		return nil, err
	}
	if result == nil {
		return &BotCallbackResultDTO{}, nil
	}
	// Emit outside chatMu so the UI can immediately issue follow-up writes.
	if result.Message != nil {
		s.emitChat(ChatEvent{Kind: "edit", ChatID: chatID, Message: result.Message})
	}
	return result, nil
}

// callbackMessageState re-reads the pressed message after the callback. Bots
// usually edit the message (text and/or keyboard) instead of answering with
// content, so this fetch is what makes the bubble update reliably.
func (s *Service) callbackMessageState(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
	chatID string,
	messageID int,
	proxy, ntp string,
) *MessageDTO {
	fetchCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	ids := []tg.InputMessageClass{&tg.InputMessageID{ID: messageID}}
	var (
		response tg.MessagesMessagesClass
		err      error
	)
	switch value := peer.(type) {
	case *tg.InputPeerChannel:
		response, err = client.API().ChannelsGetMessages(fetchCtx, &tg.ChannelsGetMessagesRequest{
			Channel: &tg.InputChannel{
				ChannelID:  value.ChannelID,
				AccessHash: value.AccessHash,
			},
			ID: ids,
		})
	default:
		response, err = client.API().MessagesGetMessages(fetchCtx, ids)
	}
	if err != nil || response == nil {
		return nil
	}
	messages, users, chats, ok := messagesList(response)
	if !ok {
		return nil
	}
	mapped := s.mapHistoryMessages(fetchCtx, client, peer, chatID, messages, users, chats, proxy, ntp)
	for index := range mapped {
		if mapped[index].ID == messageID {
			return &mapped[index]
		}
	}
	return nil
}

// RequestBotWebView opens a bot mini app through messages.requestWebView and
// returns the authenticated URL. It covers both flows:
//   - inline keyboard webview buttons: messageID > 0, fromBotMenu=false, the
//     keyboard message is passed as reply_to_msg_id so the bot knows the context;
//   - bot menu button / main mini app: fromBotMenu=true, no reply target.
//
// Theme params are intentionally not sent by the kernel: the local mini-app
// wrapper page injects the app's current theme colors into tgWebAppThemeParams,
// which keeps the kernel UI-agnostic and honors light/dark switching.
func (s *Service) RequestBotWebView(
	chatID, botPeerID string,
	messageID int,
	url string,
	fromBotMenu bool,
	proxy, ntp string,
) (*BotWebViewDTO, error) {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}
	botPeer, err := parsePeerID(botPeerID)
	if err != nil {
		return nil, fmt.Errorf("invalid bot: %w", err)
	}
	botUser, ok := botPeer.(*tg.InputPeerUser)
	if !ok {
		return nil, fmt.Errorf("web app owner is not a bot")
	}
	url = strings.TrimSpace(url)
	if url != "" {
		if err := validateWebAppURL(url); err != nil {
			return nil, err
		}
	}

	s.rememberPeer(peer)
	s.rememberPeer(botPeer)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	var result *BotWebViewDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		request := &tg.MessagesRequestWebViewRequest{
			Peer:        peer,
			Bot:         &tg.InputUser{UserID: botUser.UserID, AccessHash: botUser.AccessHash},
			Platform:    webAppPlatform,
			FromBotMenu: fromBotMenu,
		}
		if url != "" {
			request.SetURL(url)
		}
		if !fromBotMenu && messageID > 0 {
			request.SetReplyTo(&tg.InputReplyToMessage{ReplyToMsgID: messageID})
		}
		view, err := client.API().MessagesRequestWebView(ctx, request)
		if err != nil {
			return readableRPCError("open bot web app", err)
		}
		if view == nil || view.URL == "" {
			return fmt.Errorf("open bot web app: bot returned no url")
		}
		result = &BotWebViewDTO{URL: view.URL}
		if queryID, ok := view.GetQueryID(); ok {
			result.QueryID = queryID
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, fmt.Errorf("open bot web app: empty result")
	}
	return result, nil
}

// validateWebAppURL keeps non-http mini-app URLs out of the WebView2 window.
func validateWebAppURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid web app url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("web app url must use http or https")
	}
	if parsed.Host == "" {
		return fmt.Errorf("web app url is missing a host")
	}
	return nil
}

// readableRPCError turns the common Telegram API failures into single-line
// messages the UI can show without leaking raw TL error strings.
func readableRPCError(action string, err error) error {
	if delay, ok := tgerr.AsFloodWait(err); ok {
		seconds := int(delay.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Errorf("%s: too many requests, retry in %d seconds", action, seconds)
	}
	switch {
	case tgerr.Is(err, tg.ErrBotResponseTimeout):
		return fmt.Errorf("%s: the bot is not responding", action)
	case tgerr.Is(err, tg.ErrButtonDataInvalid), tgerr.Is(err, tg.ErrDataInvalid):
		return fmt.Errorf("%s: this button is no longer valid", action)
	case tgerr.Is(err, tg.ErrBotInvalid):
		return fmt.Errorf("%s: this bot is not available", action)
	case tgerr.Is(err, tg.ErrURLInvalid):
		return fmt.Errorf("%s: invalid web app url", action)
	case tgerr.Is(err, tg.ErrQueryIDInvalid):
		return fmt.Errorf("%s: the web app session has expired", action)
	case tgerr.Is(err, tg.ErrUserPrivacyRestricted):
		return fmt.Errorf("%s: the privacy settings do not allow this action", action)
	case tgerr.Is(err, tg.ErrPeerIDInvalid), tgerr.Is(err, tg.ErrChannelPrivate):
		return fmt.Errorf("%s: this chat is not available", action)
	case tgerr.Is(err, tg.ErrChatAdminRequired), tgerr.Is(err, tg.ErrChatWriteForbidden):
		return fmt.Errorf("%s: you are not allowed to do this in this chat", action)
	}
	return fmt.Errorf("%s: %w", action, err)
}
