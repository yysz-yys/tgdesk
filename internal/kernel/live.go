package kernel

import (
	"context"
	"strconv"

	"github.com/gotd/td/tg"
)

// ChatEvent is the live-update stream the kernel pushes to the frontend. The
// frontend applies it to the loaded history and chat list; a "resync" event asks
// it to reload because the update could not be mapped to a known chat.
type ChatEvent struct {
	Kind       string        `json:"kind"`
	ChatID     string        `json:"chatId,omitempty"`
	Message    *MessageDTO   `json:"message,omitempty"`
	MessageIDs []int         `json:"messageIds,omitempty"`
	MessageID  int           `json:"messageId,omitempty"`
	Reactions  []ReactionDTO `json:"reactions,omitempty"`
	Unread     int           `json:"unread,omitempty"`
	MaxID      int           `json:"maxId,omitempty"`
}

// UploadEvent reports attachment upload progress to the composer.
type UploadEvent struct {
	ID       string  `json:"id"`
	ChatID   string  `json:"chatId"`
	Name     string  `json:"name"`
	Uploaded int64   `json:"uploaded"`
	Total    int64   `json:"total"`
	Progress float64 `json:"progress"`
	Done     bool    `json:"done,omitempty"`
	Failed   bool    `json:"failed,omitempty"`
	Error    string  `json:"error,omitempty"`
}

func (s *Service) SetChatEventSink(sink func(ChatEvent)) {
	s.chatEventMu.Lock()
	s.chatEventSink = sink
	s.chatEventMu.Unlock()
}

func (s *Service) SetUploadEventSink(sink func(UploadEvent)) {
	s.uploadEventMu.Lock()
	s.uploadEventSink = sink
	s.uploadEventMu.Unlock()
}

func (s *Service) emitChat(event ChatEvent) {
	s.chatEventMu.RLock()
	sink := s.chatEventSink
	s.chatEventMu.RUnlock()
	if sink != nil {
		sink(event)
	}
}

func (s *Service) emitUpload(event UploadEvent) {
	s.uploadEventMu.RLock()
	sink := s.uploadEventSink
	s.uploadEventMu.RUnlock()
	if sink != nil {
		sink(event)
	}
}

// ---------------------------------------------------------------- peer index

func peerIndexKey(kind string, id int64) string {
	return kind + ":" + strconv.FormatInt(id, 10)
}

func (s *Service) rememberPeer(peer tg.InputPeerClass) string {
	if peer == nil {
		return ""
	}
	var (
		key, value string
	)
	switch p := peer.(type) {
	case *tg.InputPeerUser:
		key = peerIndexKey("user", p.UserID)
		value = encodePeerID("user", p.UserID, p.AccessHash)
	case *tg.InputPeerChat:
		key = peerIndexKey("chat", p.ChatID)
		value = encodePeerID("chat", p.ChatID, 0)
	case *tg.InputPeerChannel:
		key = peerIndexKey("channel", p.ChannelID)
		value = encodePeerID("channel", p.ChannelID, p.AccessHash)
	default:
		return ""
	}
	s.peerIndexMu.Lock()
	s.peerIndex[key] = value
	s.peerIndexMu.Unlock()
	return value
}

func (s *Service) lookupPeer(kind string, id int64) string {
	s.peerIndexMu.RLock()
	defer s.peerIndexMu.RUnlock()
	return s.peerIndex[peerIndexKey(kind, id)]
}

func inputPeerOf(kind string, id, accessHash int64) tg.InputPeerClass {
	switch kind {
	case "user":
		return &tg.InputPeerUser{UserID: id, AccessHash: accessHash}
	case "chat":
		return &tg.InputPeerChat{ChatID: id}
	case "channel":
		return &tg.InputPeerChannel{ChannelID: id, AccessHash: accessHash}
	default:
		return nil
	}
}

// inputPeerFromUpdatePeer resolves an update peer using the entities Telegram
// attached to the update, refreshing the local index as a side effect.
func (s *Service) inputPeerFromUpdatePeer(peer tg.PeerClass, entities tg.Entities) tg.InputPeerClass {
	switch p := peer.(type) {
	case *tg.PeerUser:
		if user, ok := entities.Users[p.UserID]; ok {
			input := &tg.InputPeerUser{UserID: p.UserID, AccessHash: user.AccessHash}
			s.rememberPeer(input)
			return input
		}
		if key := s.lookupPeer("user", p.UserID); key != "" {
			parsed, _ := parsePeerID(key)
			return parsed
		}
	case *tg.PeerChat:
		input := &tg.InputPeerChat{ChatID: p.ChatID}
		s.rememberPeer(input)
		return input
	case *tg.PeerChannel:
		if channel, ok := entities.Channels[p.ChannelID]; ok {
			input := &tg.InputPeerChannel{ChannelID: p.ChannelID, AccessHash: channel.AccessHash}
			s.rememberPeer(input)
			return input
		}
		if key := s.lookupPeer("channel", p.ChannelID); key != "" {
			parsed, _ := parsePeerID(key)
			return parsed
		}
	}
	return nil
}

func (s *Service) chatIDFromUpdatePeer(peer tg.PeerClass, entities tg.Entities) string {
	input := s.inputPeerFromUpdatePeer(peer, entities)
	if input == nil {
		return ""
	}
	return s.rememberPeer(input)
}

// ------------------------------------------------------------- live updates

type liveUpdateHandler struct {
	service    *Service
	dispatcher tg.UpdateDispatcher
	proxy      string
	ntp        string
}

func newLiveUpdateHandler(service *Service, proxy, ntp string) *liveUpdateHandler {
	h := &liveUpdateHandler{
		service:    service,
		dispatcher: tg.NewUpdateDispatcher(),
		proxy:      proxy,
		ntp:        ntp,
	}
	h.dispatcher.OnNewMessage(h.onNewMessage)
	h.dispatcher.OnNewChannelMessage(h.onNewChannelMessage)
	h.dispatcher.OnEditMessage(h.onEditMessage)
	h.dispatcher.OnEditChannelMessage(h.onEditChannelMessage)
	h.dispatcher.OnDeleteMessages(h.onDeleteMessages)
	h.dispatcher.OnDeleteChannelMessages(h.onDeleteChannelMessages)
	h.dispatcher.OnMessageReactions(h.onMessageReactions)
	h.dispatcher.OnReadHistoryInbox(h.onReadHistoryInbox)
	h.dispatcher.OnReadHistoryOutbox(h.onReadHistoryOutbox)
	h.dispatcher.OnChannelTooLong(h.onChannelTooLong)
	// Sticker/GIF picker caches: the installed set list, recent row and saved
	// GIF list are invalidated by their matching update family.
	onStickerSetsChanged := func(context.Context, tg.Entities, *tg.UpdateStickerSets) error {
		h.service.invalidateStickerSetsCache()
		return nil
	}
	h.dispatcher.OnStickerSets(onStickerSetsChanged)
	h.dispatcher.OnStickerSetsOrder(func(context.Context, tg.Entities, *tg.UpdateStickerSetsOrder) error {
		h.service.invalidateStickerSetsCache()
		return nil
	})
	h.dispatcher.OnMoveStickerSetToTop(func(context.Context, tg.Entities, *tg.UpdateMoveStickerSetToTop) error {
		h.service.invalidateStickerSetsCache()
		return nil
	})
	h.dispatcher.OnNewStickerSet(func(context.Context, tg.Entities, *tg.UpdateNewStickerSet) error {
		h.service.invalidateStickerSetsCache()
		return nil
	})
	h.dispatcher.OnRecentStickers(func(context.Context, tg.Entities, *tg.UpdateRecentStickers) error {
		h.service.invalidateRecentStickersCache()
		return nil
	})
	h.dispatcher.OnSavedGifs(func(context.Context, tg.Entities, *tg.UpdateSavedGifs) error {
		h.service.invalidateSavedGifsCache()
		return nil
	})
	return h
}

func (h *liveUpdateHandler) Handle(ctx context.Context, updates tg.UpdatesClass) error {
	switch update := updates.(type) {
	case *tg.UpdateShortMessage:
		return h.onShortMessage(update)
	case *tg.UpdateShortChatMessage:
		// Short chat updates do not carry the sender name/avatar, so reload the
		// chat instead of rendering a sender-less bubble.
		if chatID := h.service.lookupPeer("chat", update.ChatID); chatID != "" {
			h.service.emitChat(ChatEvent{Kind: "resync", ChatID: chatID})
		} else {
			h.service.emitChat(ChatEvent{Kind: "resync"})
		}
		return nil
	case *tg.UpdateShortSentMessage:
		return nil
	case *tg.UpdatesTooLong:
		h.service.emitChat(ChatEvent{Kind: "resync"})
		return nil
	default:
		return h.dispatcher.Handle(ctx, updates)
	}
}

func (h *liveUpdateHandler) onNewMessage(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateNewMessage,
) error {
	h.handleMessageUpdate(update.Message, entities, "message")
	return nil
}

func (h *liveUpdateHandler) onNewChannelMessage(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateNewChannelMessage,
) error {
	h.handleMessageUpdate(update.Message, entities, "message")
	return nil
}

func (h *liveUpdateHandler) onEditMessage(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateEditMessage,
) error {
	h.handleMessageUpdate(update.Message, entities, "edit")
	return nil
}

func (h *liveUpdateHandler) onEditChannelMessage(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateEditChannelMessage,
) error {
	h.handleMessageUpdate(update.Message, entities, "edit")
	return nil
}

func (h *liveUpdateHandler) onDeleteMessages(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateDeleteMessages,
) error {
	h.service.emitChat(ChatEvent{Kind: "delete", MessageIDs: update.Messages})
	return nil
}

func (h *liveUpdateHandler) onDeleteChannelMessages(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateDeleteChannelMessages,
) error {
	chatID := h.service.chatIDFromUpdatePeer(&tg.PeerChannel{ChannelID: update.ChannelID}, entities)
	h.service.emitChat(ChatEvent{
		Kind:       "delete",
		ChatID:     chatID,
		MessageIDs: update.Messages,
	})
	return nil
}

func (h *liveUpdateHandler) onMessageReactions(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateMessageReactions,
) error {
	chatID := h.service.chatIDFromUpdatePeer(update.Peer, entities)
	reactions := mapReactions(update.Reactions)
	h.service.fillReactionURLs(reactions)
	h.service.emitChat(ChatEvent{
		Kind:      "reaction",
		ChatID:    chatID,
		MessageID: update.MsgID,
		Reactions: reactions,
	})
	return nil
}

func (h *liveUpdateHandler) onReadHistoryInbox(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateReadHistoryInbox,
) error {
	chatID := h.service.chatIDFromUpdatePeer(update.Peer, entities)
	h.service.emitChat(ChatEvent{
		Kind:   "read",
		ChatID: chatID,
		Unread: update.StillUnreadCount,
		MaxID:  update.MaxID,
	})
	return nil
}

func (h *liveUpdateHandler) onReadHistoryOutbox(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateReadHistoryOutbox,
) error {
	chatID := h.service.chatIDFromUpdatePeer(update.Peer, entities)
	h.service.emitChat(ChatEvent{Kind: "readOutbox", ChatID: chatID, MaxID: update.MaxID})
	return nil
}

func (h *liveUpdateHandler) onChannelTooLong(
	ctx context.Context,
	entities tg.Entities,
	update *tg.UpdateChannelTooLong,
) error {
	chatID := h.service.lookupPeer("channel", update.ChannelID)
	h.service.emitChat(ChatEvent{Kind: "resync", ChatID: chatID})
	return nil
}

func (h *liveUpdateHandler) onShortMessage(update *tg.UpdateShortMessage) error {
	chatID := h.service.lookupPeer("user", update.UserID)
	if chatID == "" {
		h.service.emitChat(ChatEvent{Kind: "resync"})
		return nil
	}
	item := MessageDTO{
		ID:     update.ID,
		ChatID: chatID,
		Out:    update.Out,
		Text:   update.Message,
		Date:   int64(update.Date),
	}
	if item.Out {
		item.Checks = "sent"
	}
	h.service.emitChat(ChatEvent{Kind: "message", ChatID: chatID, Message: &item})
	return nil
}

func (h *liveUpdateHandler) handleMessageUpdate(
	raw tg.MessageClass,
	entities tg.Entities,
	kind string,
) {
	users := entities.Users
	chats := entities.Chats
	channels := entities.Channels

	senders := make(map[int64]string, len(users)+len(chats)+len(channels))
	senderPeers := make(map[int64]string, len(users)+len(chats)+len(channels))
	for id, user := range users {
		name := displayName(user.FirstName, user.LastName)
		if name == "" {
			name = user.Username
		}
		senders[id] = name
		senderPeers[id] = encodePeerID("user", id, user.AccessHash)
	}
	for id, chat := range chats {
		senders[id] = chat.Title
		senderPeers[id] = encodePeerID("chat", id, 0)
	}
	for id, channel := range channels {
		senders[id] = channel.Title
		senderPeers[id] = encodePeerID("channel", id, channel.AccessHash)
	}

	switch msg := raw.(type) {
	case *tg.Message:
		chatID := h.service.chatIDFromUpdatePeer(msg.PeerID, entities)
		if chatID == "" {
			h.service.emitChat(ChatEvent{Kind: "resync"})
			return
		}
		item := mapMessage(chatID, msg, senders, senderPeers)
		h.service.fillReactionURLs(item.Reactions)
		avatar := h.service.senderAvatarURL(
			msg.FromID,
			users,
			chats,
			channels,
			h.proxy,
			h.ntp,
		)
		if avatar == "" {
			if input := h.service.inputPeerFromUpdatePeer(msg.PeerID, entities); input != nil {
				avatar = h.service.peerAvatarURL(
					input,
					users,
					chats,
					channels,
					h.proxy,
					h.ntp,
				)
			}
		}
		item.SenderAvatarURL = avatar
		if item.Media != nil {
			thumbURL, photoURL := h.service.messageImageURLs(msg, h.proxy, h.ntp)
			item.Media.ThumbURL = thumbURL
			if item.Media.Kind == "photo" {
				item.Media.PhotoURL = photoURL
			}
		}
		h.service.emitChat(ChatEvent{Kind: kind, ChatID: chatID, Message: &item})
	case *tg.MessageService:
		chatID := h.service.chatIDFromUpdatePeer(msg.PeerID, entities)
		if chatID == "" {
			h.service.emitChat(ChatEvent{Kind: "resync"})
			return
		}
		item := mapService(chatID, msg, senders)
		h.service.emitChat(ChatEvent{Kind: kind, ChatID: chatID, Message: &item})
	}
}

// mapReactions converts Telegram reaction counters into the compact UI shape.
func mapReactions(reactions tg.MessageReactions) []ReactionDTO {
	result := make([]ReactionDTO, 0, len(reactions.Results))
	for _, count := range reactions.Results {
		emoji := ""
		customEmojiID := ""
		switch reaction := count.Reaction.(type) {
		case *tg.ReactionEmoji:
			emoji = reaction.Emoticon
		case *tg.ReactionCustomEmoji:
			emoji = "✨"
			customEmojiID = strconv.FormatInt(reaction.DocumentID, 10)
		}
		if emoji == "" || count.Count == 0 {
			continue
		}
		chosen := false
		if _, ok := count.GetChosenOrder(); ok {
			chosen = true
		}
		result = append(result, ReactionDTO{
			Emoji:         emoji,
			Count:         count.Count,
			Chosen:        chosen,
			CustomEmojiID: customEmojiID,
		})
	}
	return result
}
