package kernel

import (
	"context"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/query"
	"github.com/gotd/td/telegram/query/dialogs"
	"github.com/gotd/td/tg"
)

// ChatDTO is the stable chat-list shape used by the React UI. The ID is opaque:
// it encodes the peer type, raw ID and access hash for the message call.
type ChatDTO struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Kind            string `json:"kind"`
	Username        string `json:"username,omitempty"`
	Preview         string `json:"preview"`
	AvatarURL       string `json:"avatarUrl,omitempty"`
	LastMessageDate int64  `json:"lastMessageDate,omitempty"`
	Unread          int    `json:"unread,omitempty"`
	Pinned          bool   `json:"pinned,omitempty"`
	Muted           bool   `json:"muted,omitempty"`
	Archived        bool   `json:"archived,omitempty"`
	Verified        bool   `json:"verified,omitempty"`
	Bot             bool   `json:"bot,omitempty"`
	Contact         bool   `json:"contact,omitempty"`
	Members         int    `json:"members,omitempty"`
}

type ChatFolderDTO struct {
	ID              int      `json:"id"`
	Title           string   `json:"title"`
	Emoticon        string   `json:"emoticon,omitempty"`
	ChatKeys        []string `json:"chatKeys,omitempty"`
	ExcludeKeys     []string `json:"excludeKeys,omitempty"`
	Groups          bool     `json:"groups,omitempty"`
	Broadcasts      bool     `json:"broadcasts,omitempty"`
	Contacts        bool     `json:"contacts,omitempty"`
	NonContacts     bool     `json:"nonContacts,omitempty"`
	Bots            bool     `json:"bots,omitempty"`
	ExcludeMuted    bool     `json:"excludeMuted,omitempty"`
	ExcludeRead     bool     `json:"excludeRead,omitempty"`
	ExcludeArchived bool     `json:"excludeArchived,omitempty"`
}

type MessageMediaDTO struct {
	Kind        string   `json:"kind"`
	Name        string   `json:"name"`
	ThumbURL    string   `json:"thumbUrl,omitempty"`
	PhotoURL    string   `json:"photoUrl,omitempty"`
	StreamURL   string   `json:"streamUrl,omitempty"`
	Size        string   `json:"size,omitempty"`
	Ext         string   `json:"ext,omitempty"`
	Color       string   `json:"color,omitempty"`
	SizeBytes   int64    `json:"sizeBytes,omitempty"`
	Duration    int      `json:"duration,omitempty"`
	Width       int      `json:"width,omitempty"`
	Height      int      `json:"height,omitempty"`
	Mime        string   `json:"mime,omitempty"`
	Title       string   `json:"title,omitempty"`
	Performer   string   `json:"performer,omitempty"`
	Waveform    []int    `json:"waveform,omitempty"`
	Options     []string `json:"options,omitempty"`
	VoteCounts  []int    `json:"voteCounts,omitempty"`
	Chosen      []bool   `json:"chosen,omitempty"`
	TotalVoters int      `json:"totalVoters,omitempty"`
	PollClosed  bool     `json:"pollClosed,omitempty"`
	Quiz        bool     `json:"quiz,omitempty"`
	Correct     int      `json:"correctOption"`
	Explanation string   `json:"explanation,omitempty"`
	Multiple    bool     `json:"multipleChoice,omitempty"`
	PublicPoll  bool     `json:"publicVoters,omitempty"`
	Latitude    float64  `json:"latitude,omitempty"`
	Longitude   float64  `json:"longitude,omitempty"`
	Live        bool     `json:"live,omitempty"`
	Phone       string   `json:"phone,omitempty"`
	ContactName string   `json:"contactName,omitempty"`
	URL         string   `json:"url,omitempty"`
	SiteName    string   `json:"siteName,omitempty"`
	Description string   `json:"description,omitempty"`
	Emoji       string   `json:"emoji,omitempty"`
	Value       int      `json:"value,omitempty"`
	// Rich attachment metadata.
	Checklist  []ChecklistItemDTO `json:"checklist,omitempty"`
	Amount     int64              `json:"amount,omitempty"`
	Currency   string             `json:"currency,omitempty"`
	Quantity   int                `json:"quantity,omitempty"`
	Months     int                `json:"months,omitempty"`
	UntilDate  int64              `json:"untilDate,omitempty"`
	PaidCount  int                `json:"paidCount,omitempty"`
	StoryID    int                `json:"storyId,omitempty"`
	Spoiler    bool               `json:"spoiler,omitempty"`
	Round      bool               `json:"round,omitempty"`
	ExternalID string             `json:"externalId,omitempty"`
}

type ChecklistItemDTO struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type MessageEntityDTO struct {
	Type     string `json:"type"`
	Offset   int    `json:"offset"`
	Length   int    `json:"length"`
	URL      string `json:"url,omitempty"`
	Language string `json:"language,omitempty"`
	UserID   string `json:"userId,omitempty"`
}

type MessageButtonDTO struct {
	Text string `json:"text"`
	URL  string `json:"url,omitempty"`
	Data string `json:"data,omitempty"`
	Kind string `json:"kind,omitempty"`
}

type ReactionDTO struct {
	Emoji         string `json:"emoji"`
	Count         int    `json:"count"`
	Chosen        bool   `json:"chosen,omitempty"`
	CustomEmojiID string `json:"customEmojiId,omitempty"`
	URL           string `json:"url,omitempty"`
}

type MessageDTO struct {
	ID              int                `json:"id"`
	ChatID          string             `json:"chatId"`
	Out             bool               `json:"out"`
	Sender          string             `json:"sender,omitempty"`
	SenderID        string             `json:"senderId,omitempty"`
	SenderAvatarURL string             `json:"senderAvatarUrl,omitempty"`
	SenderStatusURL string             `json:"senderEmojiStatusUrl,omitempty"`
	Text            string             `json:"text,omitempty"`
	Date            int64              `json:"date"`
	Checks          string             `json:"checks,omitempty"`
	Forwarded       bool               `json:"forwarded,omitempty"`
	ForwardedFrom   string             `json:"forwardedFrom,omitempty"`
	ForwardedDate   int64              `json:"forwardedDate,omitempty"`
	ReplyToID       int                `json:"replyToId,omitempty"`
	ReplyToText     string             `json:"replyToText,omitempty"`
	Service         string             `json:"service,omitempty"`
	ServiceKind     string             `json:"serviceKind,omitempty"`
	ServiceActor    string             `json:"serviceActor,omitempty"`
	ServiceValue    string             `json:"serviceValue,omitempty"`
	GroupedID       string             `json:"groupedId,omitempty"`
	Reactions       []ReactionDTO      `json:"reactions,omitempty"`
	Media           *MessageMediaDTO   `json:"media,omitempty"`
	Entities        []MessageEntityDTO `json:"entities,omitempty"`
	Buttons         []MessageButtonDTO `json:"buttons,omitempty"`
	Pinned          bool               `json:"pinned,omitempty"`
	PostAuthor      string             `json:"postAuthor,omitempty"`
	Views           int                `json:"views,omitempty"`
	Forwards        int                `json:"forwards,omitempty"`
	EditDate        int64              `json:"editDate,omitempty"`
	TTL             int                `json:"ttl,omitempty"`
	NoForwards      bool               `json:"noForwards,omitempty"`
	Via             string             `json:"via,omitempty"`
	Signature       string             `json:"signature,omitempty"`
}

type dialogsCacheEntry struct {
	chats []ChatDTO
	proxy string
	ntp   string
	at    time.Time
}

const dialogsCacheTTL = 20 * time.Second

// GetChats loads the first dialogs with a short-lived client. A one-shot client
// keeps the bolt DB ownership simple: no long-running session is held between
// Wails calls, and logout never has to race a background client.
func (s *Service) GetChats(proxy, ntp string, limit int, force bool) ([]ChatDTO, error) {
	return s.getDialogs(proxy, ntp, limit, 0, force)
}

// GetArchivedChats loads the Telegram archive (folder id 1).
func (s *Service) GetArchivedChats(proxy, ntp string, limit int, force bool) ([]ChatDTO, error) {
	return s.getDialogs(proxy, ntp, limit, 1, force)
}

func (s *Service) getDialogs(proxy, ntp string, limit, folderID int, force bool) ([]ChatDTO, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}

	cacheKey := fmt.Sprintf("%d:%d", folderID, limit)
	if !force {
		s.dialogsCacheMu.Lock()
		if entry, ok := s.dialogsCache[cacheKey]; ok &&
			entry.proxy == proxy &&
			entry.ntp == ntp &&
			time.Since(entry.at) < dialogsCacheTTL {
			chats := append([]ChatDTO(nil), entry.chats...)
			s.dialogsCacheMu.Unlock()
			return chats, nil
		}
		s.dialogsCacheMu.Unlock()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	var result []ChatDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		iter := query.GetDialogs(client.API()).FolderID(folderID).BatchSize(100).Iter()
		for iter.Next(ctx) {
			elem := iter.Value()
			dialog, ok := elem.Dialog.(*tg.Dialog)
			if !ok {
				continue
			}
			item, ok := mapDialog(elem, dialog)
			if !ok {
				continue
			}
			item.Archived = item.Archived || folderID == 1
			s.rememberPeer(elem.Peer)
			switch p := elem.Peer.(type) {
			case *tg.InputPeerUser:
				item.AvatarURL = s.userAvatarURL(p, elem.Entities.Users()[p.UserID], proxy, ntp)
			case *tg.InputPeerChat:
				item.AvatarURL = s.chatAvatarURL(p, elem.Entities.Chats()[p.ChatID], proxy, ntp)
			case *tg.InputPeerChannel:
				item.AvatarURL = s.channelAvatarURL(p, elem.Entities.Channels()[p.ChannelID], proxy, ntp)
			}
			result = append(result, item)
			if len(result) >= limit {
				break
			}
		}
		if err := iter.Err(); err != nil {
			return fmt.Errorf("iterate dialogs: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.dialogsCacheMu.Lock()
	s.dialogsCache[cacheKey] = dialogsCacheEntry{
		chats: append([]ChatDTO(nil), result...),
		proxy: proxy,
		ntp:   ntp,
		at:    time.Now(),
	}
	s.dialogsCacheMu.Unlock()
	if folderID == 0 {
		s.saveCachedChats(result)
	}
	return result, nil
}

// SetChatArchived moves a peer into or out of Telegram's archive folder.
func (s *Service) SetChatArchived(chatID string, archived bool, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	folderID := 0
	if archived {
		folderID = 1
	}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().FoldersEditPeerFolders(ctx, []tg.InputFolderPeer{
			{Peer: peer, FolderID: folderID},
		})
		if err != nil {
			return fmt.Errorf("update archive: %w", err)
		}
		return nil
	})
	if err == nil {
		s.dialogsCacheMu.Lock()
		s.dialogsCache = make(map[string]dialogsCacheEntry)
		s.dialogsCacheMu.Unlock()
	}
	return err
}

// GetFolders exposes Telegram's official dialog filters. Explicit peer lists
// and the common category flags are preserved; the frontend applies them to the
// loaded dialog list.
func (s *Service) GetFolders(proxy, ntp string) ([]ChatFolderDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result []ChatFolderDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		filters, err := client.API().MessagesGetDialogFilters(ctx)
		if err != nil {
			return fmt.Errorf("get dialog filters: %w", err)
		}
		for _, raw := range filters.Filters {
			switch f := raw.(type) {
			case *tg.DialogFilter:
				result = append(result, ChatFolderDTO{
					ID:              f.ID,
					Title:           f.Title.Text,
					Emoticon:        f.Emoticon,
					ChatKeys:        peerKeys(f.PinnedPeers, f.IncludePeers),
					ExcludeKeys:     peerKeys(f.ExcludePeers),
					Groups:          f.Groups,
					Broadcasts:      f.Broadcasts,
					Contacts:        f.Contacts,
					NonContacts:     f.NonContacts,
					Bots:            f.Bots,
					ExcludeMuted:    f.ExcludeMuted,
					ExcludeRead:     f.ExcludeRead,
					ExcludeArchived: f.ExcludeArchived,
				})
			case *tg.DialogFilterChatlist:
				result = append(result, ChatFolderDTO{
					ID:       f.ID,
					Title:    f.Title.Text,
					Emoticon: f.Emoticon,
					ChatKeys: peerKeys(f.PinnedPeers, f.IncludePeers),
				})
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func peerKeys(groups ...[]tg.InputPeerClass) []string {
	seen := make(map[string]struct{})
	var result []string
	for _, peers := range groups {
		for _, peer := range peers {
			if key := inputPeerKey(peer); key != "" {
				if _, exists := seen[key]; exists {
					continue
				}
				seen[key] = struct{}{}
				result = append(result, key)
			}
		}
	}
	return result
}

func inputPeerKey(peer tg.InputPeerClass) string {
	switch p := peer.(type) {
	case *tg.InputPeerUser:
		return fmt.Sprintf("user:%d", p.UserID)
	case *tg.InputPeerChat:
		return fmt.Sprintf("chat:%d", p.ChatID)
	case *tg.InputPeerChannel:
		return fmt.Sprintf("channel:%d", p.ChannelID)
	default:
		return ""
	}
}

// SendMessage sends a plain text message through the shared session. A
// positive replyToID quotes that message, matching Telegram Web's reply action.
func (s *Service) SendMessage(chatID, text string, replyToID int, proxy, ntp string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("message is empty")
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	randomID := time.Now().UnixNano()
	if randomID < 0 {
		randomID = -randomID
	}
	request := &tg.MessagesSendMessageRequest{
		Peer:     peer,
		Message:  text,
		RandomID: randomID,
	}
	if replyToID > 0 {
		request.ReplyTo = &tg.InputReplyToMessage{ReplyToMsgID: replyToID}
	}
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesSendMessage(ctx, request)
		if err != nil {
			return fmt.Errorf("send message: %w", err)
		}
		return nil
	})
}

// EditMessage replaces the text of an outgoing message.
func (s *Service) EditMessage(chatID string, messageID int, text, proxy, ntp string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("message is empty")
	}
	if messageID <= 0 {
		return fmt.Errorf("invalid message")
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesEditMessage(ctx, &tg.MessagesEditMessageRequest{
			Peer:    peer,
			ID:      messageID,
			Message: text,
		})
		if err != nil {
			return fmt.Errorf("edit message: %w", err)
		}
		return nil
	})
}

// DeleteMessages removes messages. revoke=true deletes for everyone (Telegram
// only allows that for your own messages or as a chat admin).
func (s *Service) DeleteMessages(
	chatID string,
	messageIDs []int,
	revoke bool,
	proxy, ntp string,
) error {
	if len(messageIDs) == 0 {
		return fmt.Errorf("no messages selected")
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		// Channel/supergroup messages can only be revoked with
		// channels.deleteMessages; "delete for me" still uses the universal
		// messages.deleteMessages call without revoke.
		if revoke {
			if channel, ok := peer.(*tg.InputPeerChannel); ok {
				_, deleteErr := client.API().ChannelsDeleteMessages(
					ctx,
					&tg.ChannelsDeleteMessagesRequest{
						Channel: &tg.InputChannel{
							ChannelID:  channel.ChannelID,
							AccessHash: channel.AccessHash,
						},
						ID: messageIDs,
					},
				)
				if deleteErr != nil {
					return fmt.Errorf("delete channel messages: %w", deleteErr)
				}
				return nil
			}
		}
		_, err := client.API().MessagesDeleteMessages(ctx, &tg.MessagesDeleteMessagesRequest{
			Revoke: revoke,
			ID:     messageIDs,
		})
		if err != nil {
			return fmt.Errorf("delete messages: %w", err)
		}
		return nil
	})
}

// ForwardMessages forwards one message into another chat.
func (s *Service) ForwardMessages(
	fromChatID, toChatID string,
	messageIDs []int,
	proxy, ntp string,
) error {
	if len(messageIDs) == 0 {
		return fmt.Errorf("no messages selected")
	}
	from, err := parsePeerID(fromChatID)
	if err != nil {
		return err
	}
	to, err := parsePeerID(toChatID)
	if err != nil {
		return err
	}

	randomIDs := make([]int64, len(messageIDs))
	for index := range randomIDs {
		randomID := time.Now().UnixNano() + int64(index)
		if randomID < 0 {
			randomID = -randomID
		}
		randomIDs[index] = randomID
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesForwardMessages(ctx, &tg.MessagesForwardMessagesRequest{
			FromPeer: from,
			ID:       messageIDs,
			RandomID: randomIDs,
			ToPeer:   to,
		})
		if err != nil {
			return fmt.Errorf("forward message: %w", err)
		}
		return nil
	})
}

// GetMessages loads the latest messages for an opaque chat ID. Telegram returns
// newest first; the UI wants oldest-to-newest, so the slice is reversed.
func (s *Service) GetMessages(chatID, proxy, ntp string, limit int) ([]MessageDTO, error) {
	return s.getMessages(chatID, 0, 0, proxy, ntp, limit)
}

// GetNewMessages returns only messages newer than afterID. The frontend polls
// this lightweight delta as a safety net for transient update-stream gaps; it
// never re-registers the whole visible history or re-downloads existing media.
func (s *Service) GetNewMessages(
	chatID string,
	afterID int,
	proxy, ntp string,
) ([]MessageDTO, error) {
	if afterID <= 0 {
		return s.GetMessages(chatID, proxy, ntp, 50)
	}
	return s.getMessages(chatID, 0, afterID, proxy, ntp, 50)
}

// ChatMemberDTO is a compact participant row for the chat-info pane.
type ChatMemberDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Username  string `json:"username,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Admin     bool   `json:"admin,omitempty"`
	Bot       bool   `json:"bot,omitempty"`
}

// GetOlderMessages loads the page immediately before beforeID. The frontend
// uses this to paginate beyond the latest screen instead of only showing today.
func (s *Service) GetOlderMessages(
	chatID string,
	beforeID int,
	proxy, ntp string,
	limit int,
) ([]MessageDTO, error) {
	if beforeID <= 0 {
		return s.GetMessages(chatID, proxy, ntp, limit)
	}
	return s.getMessages(chatID, beforeID, 0, proxy, ntp, limit)
}

func (s *Service) getMessages(
	chatID string,
	beforeID int,
	afterID int,
	proxy, ntp string,
	limit int,
) ([]MessageDTO, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)
	var result []MessageDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		resp, err := client.API().MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
			Peer:     peer,
			Limit:    limit,
			OffsetID: beforeID,
			MinID:    afterID,
		})
		if err != nil {
			return fmt.Errorf("get history: %w", err)
		}
		if _, ok := resp.(*tg.MessagesMessagesNotModified); ok {
			return nil
		}

		messages, users, chats, ok := messagesList(resp)
		if !ok {
			return fmt.Errorf("unexpected history result %T", resp)
		}
		result = s.mapHistoryMessages(ctx, client, peer, chatID, messages, users, chats, proxy, ntp)
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Telegram is newest-first.
	for left, right := 0, len(result)-1; left < right; left, right = left+1, right-1 {
		result[left], result[right] = result[right], result[left]
	}
	if beforeID == 0 {
		s.saveCachedMessages(chatID, result)
	}
	return result, nil
}

// messagesList unwraps any of the messages.* response wrappers into the
// message/user/chat slices they carry.
func messagesList(resp tg.MessagesMessagesClass) (
	messages []tg.MessageClass,
	users []tg.UserClass,
	chats []tg.ChatClass,
	ok bool,
) {
	switch r := resp.(type) {
	case *tg.MessagesMessages:
		return r.Messages, r.Users, r.Chats, true
	case *tg.MessagesMessagesSlice:
		return r.Messages, r.Users, r.Chats, true
	case *tg.MessagesChannelMessages:
		return r.Messages, r.Users, r.Chats, true
	default:
		return nil, nil, nil, false
	}
}

// mapHistoryMessages converts Telegram messages from a history or search
// response into UI DTOs, resolving sender names, avatars and media URLs. The
// order of the input is preserved (Telegram returns newest first).
func (s *Service) mapHistoryMessages(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
	chatID string,
	messages []tg.MessageClass,
	users []tg.UserClass,
	chats []tg.ChatClass,
	proxy, ntp string,
) []MessageDTO {
	senders := make(map[int64]string, len(users)+len(chats))
	senderPeers := make(map[int64]string, len(users)+len(chats))
	usersByID := make(map[int64]*tg.User, len(users))
	chatsByID := make(map[int64]*tg.Chat, len(chats))
	channelsByID := make(map[int64]*tg.Channel, len(chats))
	for _, user := range users {
		if value, ok := user.(*tg.User); ok {
			name := displayName(value.FirstName, value.LastName)
			if name == "" {
				name = value.Username
			}
			senders[value.ID] = name
			senderPeers[value.ID] = encodePeerID("user", value.ID, value.AccessHash)
			usersByID[value.ID] = value
		}
	}
	for _, chat := range chats {
		switch value := chat.(type) {
		case *tg.Chat:
			senders[value.ID] = value.Title
			senderPeers[value.ID] = encodePeerID("chat", value.ID, 0)
			chatsByID[value.ID] = value
		case *tg.Channel:
			senders[value.ID] = value.Title
			senderPeers[value.ID] = encodePeerID("channel", value.ID, value.AccessHash)
			channelsByID[value.ID] = value
		}
	}
	chatAvatar := s.peerAvatarURL(peer, usersByID, chatsByID, channelsByID, proxy, ntp)
	statusURLs := s.senderEmojiStatusURLs(ctx, client, usersByID, proxy, ntp)
	s.ensureCustomEmojiURLs(ctx, client, reactionDocumentIDs(messages), proxy, ntp)

	result := make([]MessageDTO, 0, len(messages))
	for _, raw := range messages {
		switch msg := raw.(type) {
		case *tg.Message:
			item := mapMessage(chatID, msg, senders, senderPeers)
			item.SenderStatusURL = statusURLs[peerUserID(msg.FromID)]
			s.fillReactionURLs(item.Reactions)
			avatar := s.senderAvatarURL(
				msg.FromID,
				usersByID,
				chatsByID,
				channelsByID,
				proxy,
				ntp,
			)
			if avatar == "" {
				avatar = chatAvatar
			}
			item.SenderAvatarURL = avatar
			if item.Media != nil {
				thumbURL, fullURL := s.messageImageURLs(msg, proxy, ntp)
				item.Media.ThumbURL = thumbURL
				switch item.Media.Kind {
				case "photo", "webpage":
					item.Media.PhotoURL = fullURL
				case "audio", "voice", "animation", "sticker":
					item.Media.StreamURL = fullURL
				}
			}
			result = append(result, item)
		case *tg.MessageService:
			result = append(result, mapService(chatID, msg, senders))
		}
	}
	enrichReplyPreviews(ctx, client, peer, result)
	return result
}

func (s *Service) withChatClient(
	ctx context.Context,
	proxy, ntp string,
	fn func(context.Context, *telegram.Client) error,
) error {
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}
	return fn(ctx, client)
}

// enrichReplyPreviews resolves the text of messages quoted by the current page.
// Telegram only returns the reply id in the history header; without this batch
// lookup every quote would render as a generic "replied message" label.
func enrichReplyPreviews(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
	items []MessageDTO,
) {
	known := make(map[int]struct{}, len(items))
	for _, item := range items {
		known[item.ID] = struct{}{}
	}
	needed := make(map[int]struct{})
	for _, item := range items {
		if item.ReplyToID <= 0 || item.ReplyToText != "" {
			continue
		}
		if _, ok := known[item.ReplyToID]; ok {
			continue
		}
		needed[item.ReplyToID] = struct{}{}
	}
	if len(needed) == 0 {
		return
	}
	ids := make([]tg.InputMessageClass, 0, len(needed))
	for id := range needed {
		ids = append(ids, &tg.InputMessageID{ID: id})
	}

	lookupCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	var (
		response tg.MessagesMessagesClass
		err      error
	)
	switch p := peer.(type) {
	case *tg.InputPeerChannel:
		response, err = client.API().ChannelsGetMessages(
			lookupCtx,
			&tg.ChannelsGetMessagesRequest{
				Channel: &tg.InputChannel{
					ChannelID:  p.ChannelID,
					AccessHash: p.AccessHash,
				},
				ID: ids,
			},
		)
	default:
		response, err = client.API().MessagesGetMessages(lookupCtx, ids)
	}
	if err != nil || response == nil {
		return
	}

	previews := make(map[int]string, len(needed))
	collect := func(messages []tg.MessageClass) {
		for _, raw := range messages {
			msg, ok := raw.(*tg.Message)
			if !ok {
				continue
			}
			if text := replyPreviewText(msg); text != "" {
				previews[msg.ID] = text
			}
		}
	}
	switch r := response.(type) {
	case *tg.MessagesMessages:
		collect(r.Messages)
	case *tg.MessagesChannelMessages:
		collect(r.Messages)
	case *tg.MessagesMessagesSlice:
		collect(r.Messages)
	}
	for index := range items {
		if items[index].ReplyToText != "" {
			continue
		}
		if text, ok := previews[items[index].ReplyToID]; ok {
			items[index].ReplyToText = text
		}
	}
}

func replyPreviewText(msg *tg.Message) string {
	text := strings.TrimSpace(msg.Message)
	if text != "" {
		runes := []rune(text)
		if len(runes) > 120 {
			return string(runes[:120]) + "…"
		}
		return text
	}
	if media := mapMedia(msg.Media); media != nil && media.Name != "" {
		return media.Name
	}
	return ""
}

func mapDialog(elem dialogs.Elem, dialog *tg.Dialog) (ChatDTO, bool) {
	peer := elem.Peer
	entities := elem.Entities

	var (
		title    string
		username string
		kind     string
		verified bool
		bot      bool
		contact  bool
		members  int
		id       string
		ok       bool
	)

	switch p := peer.(type) {
	case *tg.InputPeerUser:
		user, found := entities.Users()[p.UserID]
		if !found {
			return ChatDTO{}, false
		}
		title = displayName(user.FirstName, user.LastName)
		if title == "" {
			title = user.Username
		}
		if title == "" {
			title = "Telegram user"
		}
		username = user.Username
		kind = "private"
		verified = user.Verified
		bot = user.Bot
		contact = user.Contact || user.MutualContact
		id = encodePeerID("user", p.UserID, p.AccessHash)
		ok = true
	case *tg.InputPeerChat:
		chat, found := entities.Chats()[p.ChatID]
		if !found {
			return ChatDTO{}, false
		}
		title = chat.Title
		kind = "group"
		members = chat.ParticipantsCount
		id = encodePeerID("chat", p.ChatID, 0)
		ok = true
	case *tg.InputPeerChannel:
		channel, found := entities.Channels()[p.ChannelID]
		if !found {
			return ChatDTO{}, false
		}
		title = channel.Title
		username = channel.Username
		verified = channel.Verified
		members = channel.ParticipantsCount
		if channel.Megagroup {
			kind = "group"
		} else {
			kind = "channel"
		}
		id = encodePeerID("channel", p.ChannelID, p.AccessHash)
		ok = true
	}
	if !ok {
		return ChatDTO{}, false
	}

	preview, lastDate := lastPreview(elem.Last)
	archived := false
	if folderID, ok := dialog.GetFolderID(); ok && folderID == 1 {
		archived = true
	}
	return ChatDTO{
		ID:              id,
		Title:           title,
		Kind:            kind,
		Username:        username,
		Preview:         preview,
		LastMessageDate: lastDate,
		Unread:          dialog.UnreadCount,
		Pinned:          dialog.Pinned,
		Muted:           mutedUntil(dialog.NotifySettings),
		Archived:        archived,
		Verified:        verified,
		Bot:             bot,
		Contact:         contact,
		Members:         members,
	}, true
}

func mapMessage(chatID string, msg *tg.Message, senders, senderPeers map[int64]string) MessageDTO {
	item := MessageDTO{
		ID:       msg.ID,
		ChatID:   chatID,
		Out:      msg.Out,
		Sender:   senderName(msg.FromID, senders),
		SenderID: senderPeer(msg.FromID, senderPeers),
		Text:     msg.Message,
		Date:     int64(msg.Date),
	}
	if msg.Out {
		item.Checks = "sent"
	}
	item.Entities = mapEntities(msg.Entities)
	item.Buttons = mapButtons(msg.ReplyMarkup)
	item.Pinned = msg.Pinned
	item.NoForwards = msg.Noforwards
	if views, ok := msg.GetViews(); ok {
		item.Views = views
	}
	if forwards, ok := msg.GetForwards(); ok {
		item.Forwards = forwards
	}
	if edited, ok := msg.GetEditDate(); ok {
		item.EditDate = int64(edited)
	}
	if ttl, ok := msg.GetTTLPeriod(); ok {
		item.TTL = ttl
	}
	if author, ok := msg.GetPostAuthor(); ok {
		item.PostAuthor = author
	}
	if fwd, ok := msg.GetFwdFrom(); ok {
		item.Forwarded = true
		item.ForwardedDate = int64(fwd.Date)
		item.ForwardedFrom = fwd.FromName
		if item.ForwardedFrom == "" {
			item.ForwardedFrom = senderName(fwd.FromID, senders)
		}
		if item.ForwardedFrom == "" {
			item.ForwardedFrom = fwd.PostAuthor
		}
	}
	if reply, ok := msg.GetReplyTo(); ok {
		if header, ok := reply.(*tg.MessageReplyHeader); ok {
			if id, ok := header.GetReplyToMsgID(); ok {
				item.ReplyToID = id
			}
			if quote, ok := header.GetQuoteText(); ok {
				item.ReplyToText = quote
			}
		}
	}
	item.Media = mapMedia(msg.Media)
	if groupedID, ok := msg.GetGroupedID(); ok && groupedID != 0 {
		item.GroupedID = strconv.FormatInt(groupedID, 10)
	}
	if reactions, ok := msg.GetReactions(); ok {
		item.Reactions = mapReactions(reactions)
	}
	return item
}

func mapService(chatID string, msg *tg.MessageService, senders map[int64]string) MessageDTO {
	actor := senderName(msg.FromID, senders)
	item := MessageDTO{
		ID:      msg.ID,
		ChatID:  chatID,
		Date:    int64(msg.Date),
		Service: "Service message",
	}
	switch action := msg.Action.(type) {
	case *tg.MessageActionChatAddUser:
		names := make([]string, 0, len(action.Users))
		for _, id := range action.Users {
			if name := senders[id]; name != "" {
				names = append(names, name)
			}
		}
		item.ServiceKind = "join"
		item.ServiceActor = strings.Join(names, ", ")
		if item.ServiceActor == "" {
			item.ServiceActor = actor
		}
		item.Service = item.ServiceActor + " joined the group"
	case *tg.MessageActionChatJoinedByLink:
		item.ServiceKind = "invite"
		item.ServiceActor = actor
		item.Service = actor + " joined via invite link"
	case *tg.MessageActionChatDeleteUser:
		item.ServiceKind = "leave"
		item.ServiceActor = senders[action.UserID]
		if item.ServiceActor == "" {
			item.ServiceActor = actor
		}
		item.Service = item.ServiceActor + " left the group"
	case *tg.MessageActionChatEditTitle:
		item.ServiceKind = "title"
		item.ServiceValue = action.Title
		item.Service = "Group name changed to " + action.Title
	case *tg.MessageActionPinMessage:
		item.ServiceKind = "pin"
		item.Service = "Message pinned"
	case *tg.MessageActionChannelCreate:
		item.ServiceKind = "channelCreated"
		item.Service = "Channel created"
	case *tg.MessageActionChatCreate:
		item.ServiceKind = "groupCreated"
		item.Service = "Group created"
	case *tg.MessageActionSetMessagesTTL:
		item.ServiceKind = "ttl"
		item.ServiceValue = fmt.Sprintf("%d", action.Period)
		if action.Period > 0 {
			item.Service = fmt.Sprintf("Auto-delete timer set to %s", humanDuration(action.Period))
		} else {
			item.Service = "Auto-delete timer disabled"
		}
	}
	return item
}

func humanDuration(seconds int) string {
	switch {
	case seconds >= 86400 && seconds%86400 == 0:
		return fmt.Sprintf("%d days", seconds/86400)
	case seconds >= 3600 && seconds%3600 == 0:
		return fmt.Sprintf("%d hours", seconds/3600)
	case seconds >= 60 && seconds%60 == 0:
		return fmt.Sprintf("%d minutes", seconds/60)
	default:
		return fmt.Sprintf("%d seconds", seconds)
	}
}

func senderName(from tg.PeerClass, senders map[int64]string) string {
	switch peer := from.(type) {
	case *tg.PeerUser:
		return senders[peer.UserID]
	case *tg.PeerChat:
		return senders[peer.ChatID]
	case *tg.PeerChannel:
		return senders[peer.ChannelID]
	default:
		return ""
	}
}

func senderPeer(from tg.PeerClass, peers map[int64]string) string {
	switch peer := from.(type) {
	case *tg.PeerUser:
		return peers[peer.UserID]
	case *tg.PeerChat:
		return peers[peer.ChatID]
	case *tg.PeerChannel:
		return peers[peer.ChannelID]
	default:
		return ""
	}
}

func mapEntities(entities []tg.MessageEntityClass) []MessageEntityDTO {
	if len(entities) == 0 {
		return nil
	}
	items := make([]MessageEntityDTO, 0, len(entities))
	for _, entity := range entities {
		item := MessageEntityDTO{}
		switch value := entity.(type) {
		case *tg.MessageEntityBold:
			item = MessageEntityDTO{Type: "bold"}
		case *tg.MessageEntityItalic:
			item = MessageEntityDTO{Type: "italic"}
		case *tg.MessageEntityUnderline:
			item = MessageEntityDTO{Type: "underline"}
		case *tg.MessageEntityStrike:
			item = MessageEntityDTO{Type: "strike"}
		case *tg.MessageEntityCode:
			item = MessageEntityDTO{Type: "code"}
		case *tg.MessageEntityPre:
			item = MessageEntityDTO{Type: "pre", Language: value.Language}
		case *tg.MessageEntityTextURL:
			item = MessageEntityDTO{Type: "link", URL: value.URL}
		case *tg.MessageEntityURL:
			item = MessageEntityDTO{Type: "url"}
		case *tg.MessageEntityMention:
			item = MessageEntityDTO{Type: "mention"}
		case *tg.MessageEntityHashtag:
			item = MessageEntityDTO{Type: "hashtag"}
		case *tg.MessageEntityCashtag:
			item = MessageEntityDTO{Type: "cashtag"}
		case *tg.MessageEntityBotCommand:
			item = MessageEntityDTO{Type: "bot_command"}
		case *tg.MessageEntityEmail:
			item = MessageEntityDTO{Type: "email"}
		case *tg.MessageEntityPhone:
			item = MessageEntityDTO{Type: "phone"}
		case *tg.MessageEntitySpoiler:
			item = MessageEntityDTO{Type: "spoiler"}
		case *tg.MessageEntityBlockquote:
			item = MessageEntityDTO{Type: "blockquote"}
		case *tg.MessageEntityMentionName:
			item = MessageEntityDTO{Type: "text_mention", UserID: strconv.FormatInt(value.UserID, 10)}
		case *tg.MessageEntityCustomEmoji:
			item = MessageEntityDTO{Type: "custom_emoji"}
		default:
			continue
		}
		offset, length := entity.GetOffset(), entity.GetLength()
		if offset < 0 || length <= 0 {
			continue
		}
		item.Offset, item.Length = offset, length
		items = append(items, item)
	}
	if len(items) == 0 {
		return nil
	}
	return items
}

func mapButtons(markup tg.ReplyMarkupClass) []MessageButtonDTO {
	inline, ok := markup.(*tg.ReplyInlineMarkup)
	if !ok {
		return nil
	}
	var buttons []MessageButtonDTO
	for _, row := range inline.Rows {
		for _, button := range row.Buttons {
			switch value := button.(type) {
			case *tg.KeyboardButtonURL:
				buttons = append(buttons, MessageButtonDTO{Kind: "url", Text: value.Text, URL: value.URL})
			case *tg.KeyboardButtonCallback:
				buttons = append(buttons, MessageButtonDTO{Kind: "callback", Text: value.Text, Data: hex.EncodeToString(value.Data)})
			case *tg.KeyboardButtonWebView:
				buttons = append(buttons, MessageButtonDTO{Kind: "webview", Text: value.Text, URL: value.URL})
			case *tg.KeyboardButtonSimpleWebView:
				buttons = append(buttons, MessageButtonDTO{Kind: "webview", Text: value.Text, URL: value.URL})
			case *tg.KeyboardButtonCopy:
				buttons = append(buttons, MessageButtonDTO{Kind: "copy", Text: value.Text, Data: value.CopyText})
			}
		}
	}
	return buttons
}

func decodeWaveform(data []byte) []int {
	if len(data) == 0 {
		return nil
	}
	const fiveBits = 5
	bits := 0
	var value uint32
	result := make([]int, 0, len(data)*8/fiveBits)
	for _, item := range data {
		value |= uint32(item) << bits
		bits += 8
		for bits >= fiveBits {
			result = append(result, int(value&((1<<fiveBits)-1)))
			value >>= fiveBits
			bits -= fiveBits
			if len(result) >= 100 {
				return result
			}
		}
	}
	return result
}

func mapMedia(media tg.MessageMediaClass) *MessageMediaDTO {
	switch m := media.(type) {
	case *tg.MessageMediaPhoto:
		photo, ok := m.Photo.(*tg.Photo)
		if !ok {
			return nil
		}
		width, height := photoDimensions(photo)
		return &MessageMediaDTO{
			Kind:      "photo",
			Name:      "Photo",
			Ext:       "JPG",
			Color:     "#65aadd",
			SizeBytes: int64(photoSizeBytes(photo)),
			Width:     width,
			Height:    height,
			Mime:      "image/jpeg",
			Spoiler:   m.Spoiler,
		}
	case *tg.MessageMediaDocument:
		return mapDocumentMedia(m)
	case *tg.MessageMediaGeo:
		return mapGeo(m.Geo, false)
	case *tg.MessageMediaGeoLive:
		return mapGeo(m.Geo, true)
	case *tg.MessageMediaVenue:
		item := mapGeo(m.Geo, false)
		if item == nil {
			item = &MessageMediaDTO{Color: "#5fb3a1"}
		}
		item.Kind = "venue"
		item.Name = m.Title
		item.Description = m.Address
		item.Title = m.Title
		return item
	case *tg.MessageMediaContact:
		return &MessageMediaDTO{
			Kind:        "contact",
			Name:        displayName(m.FirstName, m.LastName),
			Color:       "#8774e1",
			Phone:       m.PhoneNumber,
			ContactName: displayName(m.FirstName, m.LastName),
		}
	case *tg.MessageMediaPoll:
		options := make([]string, 0, len(m.Poll.Answers))
		for _, answer := range m.Poll.Answers {
			options = append(options, answer.Text.Text)
		}
		item := &MessageMediaDTO{
			Kind:       "poll",
			Name:       m.Poll.Question.Text,
			Color:      "#f08a3c",
			Options:    options,
			PollClosed: m.Poll.Closed,
			Quiz:       m.Poll.Quiz,
			Multiple:   m.Poll.MultipleChoice,
			PublicPoll: m.Poll.PublicVoters,
			Correct:    -1,
			VoteCounts: make([]int, len(options)),
			Chosen:     make([]bool, len(options)),
		}
		if solution, ok := m.Results.GetSolution(); ok {
			item.Explanation = solution
		}
		for _, result := range m.Results.Results {
			for index, answer := range m.Poll.Answers {
				if string(result.Option) == string(answer.Option) {
					item.VoteCounts[index] = result.Voters
					item.Chosen[index] = result.Chosen
					if result.Correct {
						item.Correct = index
					}
					break
				}
			}
		}
		item.TotalVoters = m.Results.TotalVoters
		return item
	case *tg.MessageMediaWebPage:
		return mapWebPageMedia(m.Webpage)
	case *tg.MessageMediaDice:
		return &MessageMediaDTO{
			Kind:  "dice",
			Name:  m.Emoticon,
			Emoji: m.Emoticon,
			Value: m.Value,
			Color: "#f2a54a",
		}
	case *tg.MessageMediaGame:
		return &MessageMediaDTO{
			Kind:        "game",
			Name:        m.Game.Title,
			Title:       m.Game.Title,
			Description: m.Game.Description,
			Color:       "#7cacf8",
		}
	case *tg.MessageMediaInvoice:
		return &MessageMediaDTO{
			Kind:        "invoice",
			Name:        m.Title,
			Title:       m.Title,
			Description: m.Description,
			Color:       "#7bc862",
			Amount:      m.TotalAmount,
			Currency:    m.Currency,
			ExternalID:  m.StartParam,
		}
	case *tg.MessageMediaStory:
		item := &MessageMediaDTO{Kind: "story", Name: "Story", Color: "#d18ee2", StoryID: m.ID}
		if story, ok := m.Story.(*tg.StoryItem); ok {
			item.Description = story.Caption
		}
		return item
	case *tg.MessageMediaGiveaway:
		item := &MessageMediaDTO{
			Kind:        "giveaway",
			Name:        "Giveaway",
			Color:       "#f2a54a",
			Quantity:    m.Quantity,
			Months:      m.Months,
			UntilDate:   int64(m.UntilDate),
			Description: m.PrizeDescription,
		}
		if m.Stars > 0 {
			item.Amount = m.Stars
			item.Currency = "XTR"
		}
		return item
	case *tg.MessageMediaGiveawayResults:
		return &MessageMediaDTO{
			Kind:        "giveaway",
			Name:        "Giveaway results",
			Color:       "#f2a54a",
			Quantity:    m.WinnersCount,
			Months:      m.Months,
			UntilDate:   int64(m.UntilDate),
			PaidCount:   m.UnclaimedCount,
			Description: "Giveaway results",
		}
	case *tg.MessageMediaPaidMedia:
		return &MessageMediaDTO{
			Kind:      "paid",
			Name:      "Paid media",
			Color:     "#d18ee2",
			Amount:    m.StarsAmount,
			Currency:  "XTR",
			PaidCount: len(m.ExtendedMedia),
		}
	case *tg.MessageMediaToDo:
		item := &MessageMediaDTO{
			Kind:  "checklist",
			Name:  m.Todo.Title.Text,
			Title: m.Todo.Title.Text,
			Color: "#7bc862",
		}
		completed := make(map[int]bool, len(m.Completions))
		for _, completion := range m.Completions {
			completed[completion.ID] = true
		}
		for _, todo := range m.Todo.List {
			item.Checklist = append(item.Checklist, ChecklistItemDTO{
				Text: todo.Title.Text,
				Done: completed[todo.ID],
			})
		}
		return item
	case *tg.MessageMediaVideoStream:
		return &MessageMediaDTO{Kind: "video", Name: "Video", Color: "#e05a8a"}
	case *tg.MessageMediaUnsupported:
		return &MessageMediaDTO{Kind: "unsupported", Name: "Unsupported message", Color: "#9aa0a6"}
	case *tg.MessageMediaEmpty:
		return nil
	default:
		if media == nil {
			return nil
		}
		return &MessageMediaDTO{Kind: "unsupported", Name: "Unsupported message", Color: "#9aa0a6"}
	}
}

func mapDocumentMedia(m *tg.MessageMediaDocument) *MessageMediaDTO {
	doc, ok := m.Document.(*tg.Document)
	if !ok {
		return nil
	}

	kind, ext, color := classifyDocument(doc)
	name := fileNameOf(doc)
	title, performer := "", ""
	item := &MessageMediaDTO{
		Kind:      kind,
		Size:      humanSize(doc.Size),
		Ext:       ext,
		Color:     color,
		SizeBytes: doc.Size,
		Mime:      doc.MimeType,
		Spoiler:   m.Spoiler,
		Round:     m.Round,
	}

	for _, attr := range doc.Attributes {
		switch value := attr.(type) {
		case *tg.DocumentAttributeVideo:
			item.Duration = int(value.Duration)
			item.Width = value.W
			item.Height = value.H
			if value.RoundMessage {
				item.Kind = "video_note"
				item.Round = true
				item.Ext = "MP4"
				item.Color = "#e05a8a"
			}
		case *tg.DocumentAttributeAudio:
			item.Duration = value.Duration
			title, performer = value.Title, value.Performer
			if value.Voice {
				item.Kind = "voice"
				item.Ext = "OGG"
				item.Color = "#7bc862"
			}
			if len(value.Waveform) > 0 {
				item.Waveform = decodeWaveform(value.Waveform)
			}
		case *tg.DocumentAttributeSticker:
			item.Kind = "sticker"
			item.Name = "Sticker"
			item.Emoji = value.Alt
			item.Ext = strings.ToUpper(strings.TrimPrefix(filepath.Ext(fileNameOf(doc)), "."))
			if item.Ext == "" {
				item.Ext = "WEBP"
			}
			item.Color = "#d18ee2"
		case *tg.DocumentAttributeAnimated:
			item.Kind = "animation"
			item.Name = "GIF"
			item.Ext = "GIF"
			item.Color = "#e58e26"
		}
	}
	item.Title = title
	item.Performer = performer

	switch item.Kind {
	case "sticker", "animation":
		// Use a localizable generic label; the emoji is shown separately.
	case "voice":
		item.Name = "Voice message"
	case "video_note":
		item.Name = "Video message"
	case "audio":
		if title != "" || performer != "" {
			item.Name = strings.TrimSpace(strings.TrimSpace(performer) + " - " + strings.TrimSpace(title))
		} else if name == "" {
			item.Name = "Audio"
		}
	case "video":
		if name == "" {
			item.Name = "Video"
		}
	default:
		if name == "" {
			item.Name = "File"
		}
	}
	if item.Name == "" {
		item.Name = name
	}
	if item.Name == "" {
		item.Name = "File"
	}
	return item
}

func mapGeo(geo tg.GeoPointClass, live bool) *MessageMediaDTO {
	name := "Location"
	if live {
		name = "Live location"
	}
	item := &MessageMediaDTO{Kind: "location", Name: name, Color: "#5fb3a1", Live: live}
	if point, ok := geo.(*tg.GeoPoint); ok {
		item.Latitude = point.Lat
		item.Longitude = point.Long
	}
	return item
}

func mapWebPageMedia(page tg.WebPageClass) *MessageMediaDTO {
	value, ok := page.(*tg.WebPage)
	if !ok || (value.URL == "" && value.DisplayURL == "") {
		return nil
	}
	title, _ := value.GetTitle()
	siteName, _ := value.GetSiteName()
	description, _ := value.GetDescription()
	name := title
	if name == "" {
		name = siteName
	}
	if name == "" {
		name = value.DisplayURL
	}
	return &MessageMediaDTO{
		Kind:        "webpage",
		Name:        name,
		Title:       title,
		Description: description,
		URL:         value.DisplayURL,
		SiteName:    siteName,
		Color:       "#5f9ea0",
	}
}

func photoDimensions(photo *tg.Photo) (int, int) {
	width, height := 0, 0
	for _, size := range photo.Sizes {
		switch value := size.(type) {
		case *tg.PhotoSize:
			if value.W*value.H > width*height {
				width, height = value.W, value.H
			}
		case *tg.PhotoSizeProgressive:
			if value.W*value.H > width*height {
				width, height = value.W, value.H
			}
		}
	}
	return width, height
}

func photoSizeBytes(photo *tg.Photo) int {
	size := 0
	for _, item := range photo.Sizes {
		switch value := item.(type) {
		case *tg.PhotoSize:
			if value.Size > size {
				size = value.Size
			}
		case *tg.PhotoSizeProgressive:
			if len(value.Sizes) > 0 && value.Sizes[len(value.Sizes)-1] > size {
				size = value.Sizes[len(value.Sizes)-1]
			}
		}
	}
	return size
}

func classifyDocument(doc *tg.Document) (kind, ext, color string) {
	kind = "file"
	color = "#f0a04b"
	switch {
	case strings.HasPrefix(doc.MimeType, "video/"):
		kind, ext, color = "video", "MP4", "#e05a8a"
	case strings.HasPrefix(doc.MimeType, "audio/"):
		kind, ext, color = "audio", "MP3", "#7bc862"
	default:
		ext = extensionOf(fileNameOf(doc))
		if ext == "" {
			ext = strings.ToUpper(subtypeOf(doc.MimeType))
		}
	}
	return kind, ext, color
}

func fileNameOf(doc *tg.Document) string {
	for _, attr := range doc.Attributes {
		if filename, ok := attr.(*tg.DocumentAttributeFilename); ok {
			return filename.FileName
		}
	}
	return ""
}

func extensionOf(name string) string {
	ext := filepath.Ext(name)
	if ext == "" {
		return ""
	}
	return strings.ToUpper(strings.TrimPrefix(ext, "."))
}

func subtypeOf(mime string) string {
	_, sub, ok := strings.Cut(mime, "/")
	if !ok {
		return ""
	}
	if i := strings.IndexByte(sub, ';'); i >= 0 {
		sub = sub[:i]
	}
	return sub
}

func lastPreview(last tg.NotEmptyMessage) (string, int64) {
	if last == nil {
		return "", 0
	}
	if msg, ok := last.(*tg.Message); ok {
		date := int64(msg.Date)
		if text := strings.TrimSpace(msg.Message); text != "" {
			return truncatePreview(text), date
		}
		if media := mediaPreview(msg.Media); media != "" {
			return media, date
		}
		return "", date
	}
	if service, ok := last.(*tg.MessageService); ok {
		return "Service message", int64(service.Date)
	}
	return "", 0
}

func mediaPreview(media tg.MessageMediaClass) string {
	if dto := mapMedia(media); dto != nil {
		switch dto.Kind {
		case "photo":
			return "Photo"
		case "poll":
			return "Poll"
		case "location":
			return "Location"
		case "contact":
			return "Contact"
		default:
			return dto.Name
		}
	}
	return ""
}

func truncatePreview(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > 120 {
		return string(runes[:120]) + "…"
	}
	return text
}

func mutedUntil(settings tg.PeerNotifySettings) bool {
	return settings.MuteUntil > int(time.Now().Unix())
}

func displayName(first, last string) string {
	return strings.TrimSpace(strings.TrimSpace(first) + " " + strings.TrimSpace(last))
}

func encodePeerID(kind string, id, accessHash int64) string {
	return fmt.Sprintf("%s:%d:%d", kind, id, accessHash)
}

func parsePeerID(value string) (tg.InputPeerClass, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid chat id")
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid chat id: %w", err)
	}
	hash, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid chat id: %w", err)
	}

	switch parts[0] {
	case "user":
		return &tg.InputPeerUser{UserID: id, AccessHash: hash}, nil
	case "chat":
		return &tg.InputPeerChat{ChatID: id}, nil
	case "channel":
		return &tg.InputPeerChannel{ChannelID: id, AccessHash: hash}, nil
	default:
		return nil, fmt.Errorf("invalid chat type")
	}
}

func humanSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit && exp < 3; n /= unit {
		div *= unit
		exp++
	}
	units := []string{"KB", "MB", "GB", "TB"}
	return fmt.Sprintf("%.1f %s", float64(size)/float64(div), units[exp])
}
