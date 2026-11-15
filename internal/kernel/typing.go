package kernel

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// Web K typing indicators (tweb `appProfileManager.onUpdateUserTyping`,
// `appMessagesManager.setTyping`, `appImManager.getPeerTyping`).
//
// Receive: every update*UserTyping becomes ChatEvent{Kind:"typing"} with the
// action mapped to the compact names the frontend typing store understands
// (typing|cancel|upload_photo|upload_document|upload_video|record_voice|
// record_video|choose_sticker), the opaque chat id resolved like
// `onUserStatus` does and the sender's display name from the update entities.
// The UI expires each typist 6 s after the last event, exactly like tweb's
// `ctx.setTimeout(cancelAction, 6000)`.
//
// Send: SendTyping maps the same action names back to messages.setTyping.

// typingActionName maps a TL SendMessageAction to the compact action name the
// frontend uses. Unknown actions return "" and are not forwarded. The upload/
// record variants collapse the way tweb's activity wording does: an uploaded
// audio is "sending a file" (like a document), a round video/voice is a video.
func typingActionName(action tg.SendMessageActionClass) string {
	switch action.(type) {
	case *tg.SendMessageTypingAction, *tg.SendMessageChooseContactAction,
		*tg.SendMessageGeoLocationAction, *tg.SendMessageGamePlayAction,
		*tg.SendMessageEmojiInteraction, *tg.SendMessageEmojiInteractionSeen:
		// tweb renders the typing dots for choosing a contact/location and the
		// P2 activity wordings for the rest; the v1 UI shows "typing" for all.
		return "typing"
	case *tg.SendMessageCancelAction:
		return "cancel"
	case *tg.SendMessageUploadPhotoAction:
		return "upload_photo"
	case *tg.SendMessageUploadDocumentAction, *tg.SendMessageUploadAudioAction:
		return "upload_document"
	case *tg.SendMessageUploadVideoAction, *tg.SendMessageUploadRoundAction:
		return "upload_video"
	case *tg.SendMessageRecordAudioAction:
		return "record_voice"
	case *tg.SendMessageRecordVideoAction, *tg.SendMessageRecordRoundAction:
		return "record_video"
	case *tg.SendMessageChooseStickerAction:
		return "choose_sticker"
	default:
		return ""
	}
}

// typingActionClass is the send-side counterpart of typingActionName. An empty
// action means "typing"; a nil result means the action is not supported.
func typingActionClass(action string) tg.SendMessageActionClass {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "", "typing":
		return &tg.SendMessageTypingAction{}
	case "cancel":
		return &tg.SendMessageCancelAction{}
	case "upload_photo":
		return &tg.SendMessageUploadPhotoAction{}
	case "upload_document":
		return &tg.SendMessageUploadDocumentAction{}
	case "upload_video":
		return &tg.SendMessageUploadVideoAction{}
	case "record_voice":
		return &tg.SendMessageRecordAudioAction{}
	case "record_video":
		return &tg.SendMessageRecordVideoAction{}
	case "choose_sticker":
		return &tg.SendMessageChooseStickerAction{}
	default:
		return nil
	}
}

// isSelfUser reports whether id is the logged-in account. A nil authUser (the
// kernel before login, and in unit tests) answers false.
func (s *Service) isSelfUser(id int64) bool {
	if id == 0 {
		return false
	}
	self := s.selfUserID()
	return self != 0 && self == id
}

// typingUserEntity resolves a typing user's display name from the entities
// Telegram attached to the update. bot reports the known-bot flag: Web K never
// shows a bot typing.
func typingUserEntity(userID int64, entities tg.Entities) (name string, bot bool) {
	user, ok := entities.Users[userID]
	if !ok {
		return "", false
	}
	if user.Bot {
		return "", true
	}
	name = displayName(user.FirstName, user.LastName)
	if name == "" {
		name = user.Username
	}
	return name, false
}

// typingPeerSender resolves the from_id of a chat/channel typing update: a user
// (the usual case), or a chat/channel for an anonymous admin (tweb shows that
// peer's title instead of a name).
func typingPeerSender(peer tg.PeerClass, entities tg.Entities) (userID int64, name string, bot bool) {
	switch p := peer.(type) {
	case *tg.PeerUser:
		name, bot = typingUserEntity(p.UserID, entities)
		return p.UserID, name, bot
	case *tg.PeerChat:
		if chat, ok := entities.Chats[p.ChatID]; ok {
			return 0, chat.Title, false
		}
	case *tg.PeerChannel:
		if channel, ok := entities.Channels[p.ChannelID]; ok {
			return 0, channel.Title, false
		}
	}
	return 0, "", false
}

// emitTyping forwards one typing action to the UI. An empty chat id (peer not
// in the local index yet) or an unmapped action is dropped.
func (h *liveUpdateHandler) emitTyping(
	chatID string,
	userID int64,
	name string,
	action tg.SendMessageActionClass,
	threadID int,
) {
	actionName := typingActionName(action)
	if chatID == "" || actionName == "" {
		return
	}
	h.service.emitChat(ChatEvent{
		Kind:         "typing",
		ChatID:       chatID,
		TypingAction: actionName,
		TypingName:   name,
		TypingUserID: userID,
		ThreadID:     threadID,
	})
}

// onUserTyping is the private-chat typing update: the peer is a user and the
// chat id comes from the live peer index (or the update entities).
func (h *liveUpdateHandler) onUserTyping(
	_ context.Context,
	entities tg.Entities,
	update *tg.UpdateUserTyping,
) error {
	if h.service.isSelfUser(update.UserID) {
		return nil
	}
	name, bot := typingUserEntity(update.UserID, entities)
	if bot {
		return nil
	}
	chatID := h.service.lookupPeer("user", update.UserID)
	if chatID == "" {
		if user, ok := entities.Users[update.UserID]; ok {
			chatID = h.service.rememberPeer(&tg.InputPeerUser{
				UserID:     user.ID,
				AccessHash: user.AccessHash,
			})
		}
	}
	threadID, _ := update.GetTopMsgID()
	h.emitTyping(chatID, update.UserID, name, update.Action, threadID)
	return nil
}

// onChatUserTyping is the basic-group typing update; from_id is the member or
// the group itself for an anonymous admin.
func (h *liveUpdateHandler) onChatUserTyping(
	_ context.Context,
	entities tg.Entities,
	update *tg.UpdateChatUserTyping,
) error {
	userID, name, bot := typingPeerSender(update.FromID, entities)
	if bot || h.service.isSelfUser(userID) {
		return nil
	}
	chatID := h.service.lookupPeer("chat", update.ChatID)
	if chatID == "" {
		chatID = h.service.rememberPeer(&tg.InputPeerChat{ChatID: update.ChatID})
	}
	h.emitTyping(chatID, userID, name, update.Action, 0)
	return nil
}

// onChannelUserTyping is the supergroup/topic typing update; from_id can be a
// user or the channel itself (anonymous admin). Broadcast channels have no
// chat typing state, so a known broadcast channel is skipped.
func (h *liveUpdateHandler) onChannelUserTyping(
	_ context.Context,
	entities tg.Entities,
	update *tg.UpdateChannelUserTyping,
) error {
	channel, channelKnown := entities.Channels[update.ChannelID]
	if channelKnown && channel.Broadcast {
		return nil
	}
	userID, name, bot := typingPeerSender(update.FromID, entities)
	if bot || h.service.isSelfUser(userID) {
		return nil
	}
	chatID := h.service.lookupPeer("channel", update.ChannelID)
	if chatID == "" && channelKnown {
		chatID = h.service.rememberPeer(&tg.InputPeerChannel{
			ChannelID:  channel.ID,
			AccessHash: channel.AccessHash,
		})
	}
	threadID, _ := update.GetTopMsgID()
	h.emitTyping(chatID, userID, name, update.Action, threadID)
	return nil
}

// SendTyping broadcasts the current user's typing state for a chat
// (messages.setTyping, tweb `appMessagesManager.setTyping`). The frontend
// throttles it to one event per 6 s and sends "cancel" when the field empties.
//
// It uses the persistent session client and deliberately does not take chatMu:
// a typing event is best-effort UI sugar and must never queue behind a send or
// a history load. Errors are returned for the caller to ignore/log.
func (s *Service) SendTyping(chatID, action, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	// Typing to yourself is a no-op (tweb guards `peerId === myId`).
	if user, ok := peer.(*tg.InputPeerUser); ok && s.isSelfUser(user.UserID) {
		return nil
	}
	sendAction := typingActionClass(action)
	if sendAction == nil {
		return fmt.Errorf("send typing: unsupported action %q", action)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		s.rememberPeer(peer)
		if _, err := client.API().MessagesSetTyping(ctx, &tg.MessagesSetTypingRequest{
			Peer:   peer,
			Action: sendAction,
		}); err != nil {
			return readableRPCError("send typing", err)
		}
		return nil
	})
}
