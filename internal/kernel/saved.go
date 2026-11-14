package kernel

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// SavedChatsDTO is the source-chat list of Saved Messages ("我的收藏"): every
// peer Telegram stores saved messages for. Pinned source chats come first,
// each with the preview/date of its last saved message. It backs the "Chats"
// tab of the Saved Messages info panel (Telegram Web K's Saved Messages 2.0
// saved-dialog list).
type SavedChatsDTO struct {
	Chats []ChatDTO `json:"chats"`
	Count int       `json:"count"`
}

// savedChatsLimit is the page size Telegram Web K requests for the saved-dialog
// list; the callers only need the first screen of source chats.
const savedChatsLimit = 100

// savedMessagePreview is the compact list preview of one saved last message.
type savedMessagePreview struct {
	preview string
	date    int64
}

// GetSavedChats loads the peers that own a saved message for the current
// account. Pinned saved dialogs are fetched first (messages.getPinnedSavedDialogs,
// which has no request parameters); the regular list follows with a
// messages.getSavedDialogs page, pinned entries excluded so the 100-item page is
// not spent on duplicates. A failing pinned call degrades to the regular list.
func (s *Service) GetSavedChats(proxy, ntp string) (*SavedChatsDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)

	var (
		pinnedResp tg.MessagesSavedDialogsClass
		savedResp  tg.MessagesSavedDialogsClass
	)
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		if resp, pinnedErr := client.API().MessagesGetPinnedSavedDialogs(ctx); pinnedErr == nil {
			pinnedResp = resp
		}
		resp, err := client.API().MessagesGetSavedDialogs(
			ctx,
			&tg.MessagesGetSavedDialogsRequest{
				ExcludePinned: true,
				OffsetPeer:    &tg.InputPeerEmpty{},
				Limit:         savedChatsLimit,
			},
		)
		if err != nil {
			return fmt.Errorf("get saved dialogs: %w", err)
		}
		savedResp = resp
		return nil
	})
	if err != nil {
		return nil, err
	}

	pinned := s.mapSavedDialogsFromResponse(pinnedResp, proxy, ntp)
	saved := s.mapSavedDialogsFromResponse(savedResp, proxy, ntp)
	chats := mergeSavedChats(pinned, saved)
	if chats == nil {
		chats = []ChatDTO{}
	}
	return &SavedChatsDTO{
		Chats: chats,
		Count: len(pinned) + savedDialogsCount(savedResp),
	}, nil
}

// mapSavedDialogsFromResponse maps one messages.savedDialogs-family answer into
// chat-list rows. The response carries the peer entities and the last message of
// each dialog, so preview text, date, avatar and presence all resolve without
// extra RPCs. MonoForumDialog entries (channel direct messages) are mapped
// through the same interface; only savedDialog carries the pinned flag.
func (s *Service) mapSavedDialogsFromResponse(
	resp tg.MessagesSavedDialogsClass,
	proxy, ntp string,
) []ChatDTO {
	dialogs, messages, users, chats, ok := savedDialogsList(resp)
	if !ok || len(dialogs) == 0 {
		return nil
	}
	previews := savedMessagePreviews(messages)

	result := make([]ChatDTO, 0, len(dialogs))
	for _, dialog := range dialogs {
		if dialog == nil {
			continue
		}
		peer := dialog.GetPeer()
		item, mapped := s.chatDTOFromPeerEntities(peer, users, chats, proxy, ntp)
		if !mapped || item == nil {
			continue
		}
		if saved, ok := dialog.(*tg.SavedDialog); ok && saved.Pinned {
			item.Pinned = true
		}
		// Presence is part of the chat-list row but chatDTOFromPeerEntities
		// (shared with link resolution) does not know the dialog context; fill
		// it here from the peer entity.
		item.Online, item.LastSeen, item.Status = userPresence(
			findUserEntity(users, peerUserID(peer)),
			s.selfUserID(),
		)
		if top := dialog.GetTopMessage(); top > 0 {
			if preview, found := lookupSavedPreview(previews, peer, top); found {
				item.Preview = preview.preview
				item.LastMessageDate = preview.date
			}
		}
		result = append(result, *item)
	}
	return result
}

// savedDialogsList unwraps a messages.savedDialogs-family response into its
// dialog/message/user/chat slices. The not-modified answer means the hash cache
// matched, so there is nothing new to map.
func savedDialogsList(resp tg.MessagesSavedDialogsClass) (
	dialogs []tg.SavedDialogClass,
	messages []tg.MessageClass,
	users []tg.UserClass,
	chats []tg.ChatClass,
	ok bool,
) {
	switch value := resp.(type) {
	case *tg.MessagesSavedDialogs:
		return value.Dialogs, value.Messages, value.Users, value.Chats, true
	case *tg.MessagesSavedDialogsSlice:
		return value.Dialogs, value.Messages, value.Users, value.Chats, true
	case *tg.MessagesSavedDialogsNotModified:
		return nil, nil, nil, nil, true
	default:
		return nil, nil, nil, nil, false
	}
}

// savedDialogsCount reports how many saved dialogs the server knows for the
// page, so the UI can render "<n> 个聊天" like Telegram Web.
func savedDialogsCount(resp tg.MessagesSavedDialogsClass) int {
	switch value := resp.(type) {
	case *tg.MessagesSavedDialogs:
		return len(value.Dialogs)
	case *tg.MessagesSavedDialogsSlice:
		return value.Count
	case *tg.MessagesSavedDialogsNotModified:
		return value.Count
	default:
		return 0
	}
}

// mergeSavedChats concatenates the pinned-then-regular dialog rows, dropping
// any peer the server returned twice. The order of each group is preserved
// exactly as the server sent it.
func mergeSavedChats(groups ...[]ChatDTO) []ChatDTO {
	var result []ChatDTO
	seen := make(map[string]struct{})
	for _, group := range groups {
		for _, chat := range group {
			if _, exists := seen[chat.ID]; exists {
				continue
			}
			seen[chat.ID] = struct{}{}
			result = append(result, chat)
		}
	}
	return result
}

// savedMessagePreviews indexes the last saved messages by peer and message id,
// so a dialog's top_message resolves to its own message even when two chats
// share numeric ids.
func savedMessagePreviews(messages []tg.MessageClass) map[string]savedMessagePreview {
	result := make(map[string]savedMessagePreview, len(messages))
	for _, raw := range messages {
		var (
			peer tg.PeerClass
			id   int
		)
		switch message := raw.(type) {
		case *tg.Message:
			peer, id = message.PeerID, message.ID
			preview, date := lastPreview(message)
			result[savedPreviewKey(peer, id)] = savedMessagePreview{preview: preview, date: date}
		case *tg.MessageService:
			peer, id = message.PeerID, message.ID
			preview, date := lastPreview(message)
			result[savedPreviewKey(peer, id)] = savedMessagePreview{preview: preview, date: date}
		}
	}
	return result
}

func lookupSavedPreview(
	previews map[string]savedMessagePreview,
	peer tg.PeerClass,
	messageID int,
) (savedMessagePreview, bool) {
	if messageID <= 0 || len(previews) == 0 {
		return savedMessagePreview{}, false
	}
	preview, ok := previews[savedPreviewKey(peer, messageID)]
	return preview, ok
}

// savedPreviewKey identifies a message list preview by the owning peer and the
// message id (message ids are only unique per chat).
func savedPreviewKey(peer tg.PeerClass, messageID int) string {
	if messageID <= 0 {
		return ""
	}
	return peerClassKey(peer) + ":" + strconv.Itoa(messageID)
}

// peerClassKey is the "kind:id" form of a raw update/peer reference, used only
// as a join key inside the kernel.
func peerClassKey(peer tg.PeerClass) string {
	switch value := peer.(type) {
	case *tg.PeerUser:
		return "user:" + strconv.FormatInt(value.UserID, 10)
	case *tg.PeerChat:
		return "chat:" + strconv.FormatInt(value.ChatID, 10)
	case *tg.PeerChannel:
		return "channel:" + strconv.FormatInt(value.ChannelID, 10)
	default:
		return ""
	}
}
