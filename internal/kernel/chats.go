package kernel

import (
	"context"
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
	LastMessageDate int64  `json:"lastMessageDate,omitempty"`
	Unread          int    `json:"unread,omitempty"`
	Pinned          bool   `json:"pinned,omitempty"`
	Muted           bool   `json:"muted,omitempty"`
	Verified        bool   `json:"verified,omitempty"`
	Members         int    `json:"members,omitempty"`
}

type MessageMediaDTO struct {
	Kind        string   `json:"kind"`
	Name        string   `json:"name"`
	Size        string   `json:"size,omitempty"`
	Ext         string   `json:"ext,omitempty"`
	Color       string   `json:"color,omitempty"`
	SizeBytes   int64    `json:"sizeBytes,omitempty"`
	Duration    int      `json:"duration,omitempty"`
	Width       int      `json:"width,omitempty"`
	Height      int      `json:"height,omitempty"`
	Mime        string   `json:"mime,omitempty"`
	Options     []string `json:"options,omitempty"`
	VoteCounts  []int    `json:"voteCounts,omitempty"`
	Chosen      []bool   `json:"chosen,omitempty"`
	TotalVoters int      `json:"totalVoters,omitempty"`
	PollClosed  bool     `json:"pollClosed,omitempty"`
	Latitude    float64  `json:"latitude,omitempty"`
	Longitude   float64  `json:"longitude,omitempty"`
	Phone       string   `json:"phone,omitempty"`
	ContactName string   `json:"contactName,omitempty"`
}

type MessageDTO struct {
	ID            int              `json:"id"`
	ChatID        string           `json:"chatId"`
	Out           bool             `json:"out"`
	Sender        string           `json:"sender,omitempty"`
	Text          string           `json:"text,omitempty"`
	Date          int64            `json:"date"`
	Checks        string           `json:"checks,omitempty"`
	Forwarded     bool             `json:"forwarded,omitempty"`
	ForwardedFrom string           `json:"forwardedFrom,omitempty"`
	ForwardedDate int64            `json:"forwardedDate,omitempty"`
	Service       string           `json:"service,omitempty"`
	Media         *MessageMediaDTO `json:"media,omitempty"`
}

// GetChats loads the first dialogs with a short-lived client. A one-shot client
// keeps the bolt DB ownership simple: no long-running session is held between
// Wails calls, and logout never has to race a background client.
func (s *Service) GetChats(proxy, ntp string, limit int) ([]ChatDTO, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var result []ChatDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		iter := query.GetDialogs(client.API()).BatchSize(100).Iter()
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
	return result, nil
}

// SendMessage sends a plain text message through the shared session.
func (s *Service) SendMessage(chatID, text, proxy, ntp string) error {
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
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, err := client.API().MessagesSendMessage(ctx, &tg.MessagesSendMessageRequest{
			Peer:     peer,
			Message:  text,
			RandomID: randomID,
		})
		if err != nil {
			return fmt.Errorf("send message: %w", err)
		}
		return nil
	})
}

// GetMessages loads the latest messages for an opaque chat ID. Telegram returns
// newest first; the UI wants oldest-to-newest, so the slice is reversed.
func (s *Service) GetMessages(chatID, proxy, ntp string, limit int) ([]MessageDTO, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var result []MessageDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		resp, err := client.API().MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
			Peer:  peer,
			Limit: limit,
		})
		if err != nil {
			return fmt.Errorf("get history: %w", err)
		}

		var (
			messages []tg.MessageClass
			users    []tg.UserClass
			chats    []tg.ChatClass
		)
		switch r := resp.(type) {
		case *tg.MessagesMessages:
			messages, users, chats = r.Messages, r.Users, r.Chats
		case *tg.MessagesMessagesSlice:
			messages, users, chats = r.Messages, r.Users, r.Chats
		case *tg.MessagesChannelMessages:
			messages, users, chats = r.Messages, r.Users, r.Chats
		case *tg.MessagesMessagesNotModified:
			return nil
		default:
			return fmt.Errorf("unexpected history result %T", resp)
		}

		senders := make(map[int64]string, len(users)+len(chats))
		for _, user := range users {
			if value, ok := user.(*tg.User); ok {
				name := displayName(value.FirstName, value.LastName)
				if name == "" {
					name = value.Username
				}
				senders[value.ID] = name
			}
		}
		for _, chat := range chats {
			switch value := chat.(type) {
			case *tg.Chat:
				senders[value.ID] = value.Title
			case *tg.Channel:
				senders[value.ID] = value.Title
			}
		}

		for _, raw := range messages {
			switch msg := raw.(type) {
			case *tg.Message:
				result = append(result, mapMessage(chatID, msg, senders))
			case *tg.MessageService:
				result = append(result, mapService(chatID, msg, senders))
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Telegram is newest-first.
	for left, right := 0, len(result)-1; left < right; left, right = left+1, right-1 {
		result[left], result[right] = result[right], result[left]
	}
	return result, nil
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

func mapDialog(elem dialogs.Elem, dialog *tg.Dialog) (ChatDTO, bool) {
	peer := elem.Peer
	entities := elem.Entities

	var (
		title    string
		username string
		kind     string
		verified bool
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
		Verified:        verified,
		Members:         members,
	}, true
}

func mapMessage(chatID string, msg *tg.Message, senders map[int64]string) MessageDTO {
	item := MessageDTO{
		ID:     msg.ID,
		ChatID: chatID,
		Out:    msg.Out,
		Sender: senderName(msg.FromID, senders),
		Text:   msg.Message,
		Date:   int64(msg.Date),
	}
	if msg.Out {
		item.Checks = "sent"
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
	item.Media = mapMedia(msg.Media)
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
		if len(names) > 0 {
			item.Service = strings.Join(names, ", ") + " joined the group"
		} else if actor != "" {
			item.Service = actor + " joined the group"
		}
	case *tg.MessageActionChatJoinedByLink:
		if actor != "" {
			item.Service = actor + " joined via invite link"
		} else {
			item.Service = "Joined via invite link"
		}
	case *tg.MessageActionChatDeleteUser:
		name := senders[action.UserID]
		if name == "" {
			name = actor
		}
		if name != "" {
			item.Service = name + " left the group"
		}
	case *tg.MessageActionChatEditTitle:
		item.Service = "Group name changed to " + action.Title
	case *tg.MessageActionPinMessage:
		item.Service = "Message pinned"
	case *tg.MessageActionChannelCreate:
		item.Service = "Channel created"
	case *tg.MessageActionChatCreate:
		item.Service = "Group created"
	case *tg.MessageActionSetMessagesTTL:
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
		}
	case *tg.MessageMediaDocument:
		doc, ok := m.Document.(*tg.Document)
		if !ok {
			return nil
		}
		name := "File"
		for _, attr := range doc.Attributes {
			if filename, ok := attr.(*tg.DocumentAttributeFilename); ok && filename.FileName != "" {
				name = filename.FileName
				break
			}
		}
		kind, ext, color := classifyDocument(doc)
		item := &MessageMediaDTO{
			Kind:      kind,
			Name:      name,
			Size:      humanSize(doc.Size),
			Ext:       ext,
			Color:     color,
			SizeBytes: doc.Size,
			Mime:      doc.MimeType,
		}
		for _, attr := range doc.Attributes {
			switch value := attr.(type) {
			case *tg.DocumentAttributeVideo:
				item.Duration = int(value.Duration)
				item.Width = value.W
				item.Height = value.H
			case *tg.DocumentAttributeAudio:
				item.Duration = value.Duration
			}
		}
		return item
	case *tg.MessageMediaGeo:
		item := &MessageMediaDTO{Kind: "location", Name: "Location", Color: "#5fb3a1"}
		if point, ok := m.Geo.(*tg.GeoPoint); ok {
			item.Latitude = point.Lat
			item.Longitude = point.Long
		}
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
			VoteCounts: make([]int, len(options)),
			Chosen:     make([]bool, len(options)),
		}
		for _, result := range m.Results.Results {
			for index, answer := range m.Poll.Answers {
				if string(result.Option) == string(answer.Option) {
					item.VoteCounts[index] = result.Voters
					item.Chosen[index] = result.Chosen
					break
				}
			}
		}
		item.TotalVoters = m.Results.TotalVoters
		return item
	default:
		return nil
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
