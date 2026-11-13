package kernel

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// Shared media sections follow Telegram Web K's chat-info tabs: the messages
// tab merges photos and videos, while files, links, music, voice and GIFs each
// have their own server-side filter. Members is handled separately because it
// is a participant list rather than a message search.
const (
	SectionMembers = "members"
	SectionMedia   = "media"
	SectionFiles   = "files"
	SectionLinks   = "links"
	SectionMusic   = "music"
	SectionVoice   = "voice"
	SectionGifs    = "gifs"
)

// ChatInfoSectionCountDTO is the server-side number of messages in one shared
// media tab. Telegram Web uses these counters to hide empty tabs instead of
// showing every possible category for every chat.
type ChatInfoSectionCountDTO struct {
	Section string `json:"section"`
	Count   int    `json:"count"`
}

// ChatInfoDTO tells the chat-info pane which tabs a peer actually has.
type ChatInfoDTO struct {
	Members        int                       `json:"members"`
	CanViewMembers bool                      `json:"canViewMembers"`
	CountsKnown    bool                      `json:"countsKnown"`
	Counts         []ChatInfoSectionCountDTO `json:"counts"`
}

// SharedMediaPageDTO is one page of a shared media tab. NextBeforeID is the
// cursor for the older page (0 means the end has been reached).
type SharedMediaPageDTO struct {
	Messages     []MessageDTO `json:"messages"`
	NextBeforeID int          `json:"nextBeforeId"`
	HasMore      bool         `json:"hasMore"`
}

// ChatMembersPageDTO is one page of the member list.
type ChatMembersPageDTO struct {
	Members    []ChatMemberDTO `json:"members"`
	NextOffset int             `json:"nextOffset"`
	Total      int             `json:"total"`
}

// chatInfoCacheEntry keeps the counters the chat-info pane opens with. Telegram
// Web caches messages.getSearchCounters for a minute as well: reopening the
// profile or receiving updates must not hammer the method into a flood wait.
type chatInfoCacheEntry struct {
	info ChatInfoDTO
	at   time.Time
}

const chatInfoCacheTTL = 60 * time.Second

// GetChatInfo resolves the tabs for a peer, mirroring Telegram Web: one
// messages.getSearchCounters call decides which shared-media tabs exist, and
// the member tab is only offered for groups whose participant list is visible.
// kind is the dialog kind already known by the UI ("private", "group" or
// "channel"); it is only a hint that avoids an extra full-channel lookup for
// broadcasts, the server answer still decides whether members are visible.
func (s *Service) GetChatInfo(chatID, kind, proxy, ntp string) (*ChatInfoDTO, error) {
	cacheKey := chatID + "|" + kind
	s.chatInfoCacheMu.Lock()
	if entry, ok := s.chatInfoCache[cacheKey]; ok && time.Since(entry.at) < chatInfoCacheTTL {
		info := entry.info
		info.Counts = append([]ChatInfoSectionCountDTO(nil), entry.info.Counts...)
		s.chatInfoCacheMu.Unlock()
		return &info, nil
	}
	s.chatInfoCacheMu.Unlock()

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	info := &ChatInfoDTO{}
	// Telegram Web shows the member tab for every non-broadcast chat: a basic
	// group or a supergroup (both surface as "group" here) always exposes its
	// participant list entry point, even when the list itself is hidden from
	// ordinary members. Broadcast channels never have it.
	info.CanViewMembers = kind == "group"
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		counts, countsErr := searchSectionCounts(ctx, client, peer)
		if countsErr == nil {
			info.CountsKnown = true
			info.Counts = counts
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if info.CountsKnown {
		s.chatInfoCacheMu.Lock()
		if len(s.chatInfoCache) > 256 {
			for key, entry := range s.chatInfoCache {
				if time.Since(entry.at) >= chatInfoCacheTTL {
					delete(s.chatInfoCache, key)
				}
			}
		}
		s.chatInfoCache[cacheKey] = chatInfoCacheEntry{info: *info, at: time.Now()}
		s.chatInfoCacheMu.Unlock()
	}
	return info, nil
}

// searchSectionCounts asks messages.getSearchCounters for every shared media
// filter at once. A peer that refuses the query simply reports no counts, and
// the UI falls back to lazy tabs that discover their content on open.
func searchSectionCounts(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
) ([]ChatInfoSectionCountDTO, error) {
	sections := []string{
		SectionMedia,
		SectionFiles,
		SectionLinks,
		SectionMusic,
		SectionVoice,
		SectionGifs,
	}
	filters := make([]tg.MessagesFilterClass, 0, len(sections))
	for _, section := range sections {
		filter, ok := sharedMediaFilter(section)
		if ok {
			filters = append(filters, filter)
		}
	}

	callCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	counters, err := client.API().MessagesGetSearchCounters(
		callCtx,
		&tg.MessagesGetSearchCountersRequest{Peer: peer, Filters: filters},
	)
	if err != nil {
		return nil, fmt.Errorf("get search counters: %w", err)
	}

	bySection := make(map[string]int, len(counters))
	for _, counter := range counters {
		if section, ok := sectionForFilter(counter.Filter); ok {
			count := counter.Count
			if count < 0 {
				count = 0
			}
			bySection[section] = count
		}
	}

	result := make([]ChatInfoSectionCountDTO, 0, len(sections))
	for _, section := range sections {
		if count, ok := bySection[section]; ok {
			result = append(result, ChatInfoSectionCountDTO{Section: section, Count: count})
		}
	}
	return result, nil
}

// GetSharedMedia loads one page of a shared media tab with messages.search,
// newest first. beforeID is the cursor returned by the previous page.
func (s *Service) GetSharedMedia(
	chatID, section, proxy, ntp string,
	beforeID, limit int,
) (*SharedMediaPageDTO, error) {
	filter, ok := sharedMediaFilter(section)
	if !ok {
		return nil, fmt.Errorf("unknown shared media section %q", section)
	}
	if beforeID < 0 {
		beforeID = 0
	}
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	page := &SharedMediaPageDTO{Messages: []MessageDTO{}}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		cursor := beforeID
		// The server's filters can include documents that the section does not
		// show (a document filter also returns music and voice). Fetch a few
		// pages at most so the tab can still fill a screen and cannot loop.
		for attempt := 0; attempt < 3; attempt++ {
			response, err := client.API().MessagesSearch(ctx, &tg.MessagesSearchRequest{
				Peer:     peer,
				Filter:   filter,
				Q:        "",
				OffsetID: cursor,
				Limit:    limit,
			})
			if err != nil {
				if attempt == 0 {
					return fmt.Errorf("search shared media: %w", err)
				}
				break
			}

			messages, users, chats, ok := messagesList(response)
			if !ok {
				break
			}
			mapped := s.mapHistoryMessages(ctx, client, peer, chatID, messages, users, chats, proxy, ntp)
			for index := range mapped {
				if matchesSharedMediaSection(section, &mapped[index]) {
					page.Messages = append(page.Messages, mapped[index])
				}
			}

			if len(messages) < limit {
				page.HasMore = false
				page.NextBeforeID = 0
				break
			}

			cursor = messageListLastID(messages, cursor)
			page.NextBeforeID = cursor
			page.HasMore = true
			if len(page.Messages) >= limit || cursor <= 0 {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if page.NextBeforeID <= 0 {
		page.HasMore = false
	}
	return page, nil
}

// GetChatMembersPage loads one page of a group's participant list. Telegram
// Web requests 50 rows first and 200 per following page; the caller can pick
// its own limit within that range.
func (s *Service) GetChatMembersPage(
	chatID, proxy, ntp string,
	offset, limit int,
) (*ChatMembersPageDTO, error) {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}
	switch peer.(type) {
	case *tg.InputPeerChannel, *tg.InputPeerChat:
	default:
		return &ChatMembersPageDTO{Members: []ChatMemberDTO{}}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	page := &ChatMembersPageDTO{Members: []ChatMemberDTO{}}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		switch value := peer.(type) {
		case *tg.InputPeerChannel:
			response, err := client.API().ChannelsGetParticipants(
				ctx,
				&tg.ChannelsGetParticipantsRequest{
					Channel: &tg.InputChannel{
						ChannelID:  value.ChannelID,
						AccessHash: value.AccessHash,
					},
					Filter: &tg.ChannelParticipantsRecent{},
					Offset: offset,
					Limit:  limit,
				},
			)
			if err != nil {
				return fmt.Errorf("get participants: %w", err)
			}
			data, ok := response.(*tg.ChannelsChannelParticipants)
			if !ok {
				return nil
			}
			page.Members = s.mapChannelParticipants(data.Users, data.Participants, proxy, ntp)
			page.Total = data.Count
			next := offset + len(data.Participants)
			if len(data.Participants) > 0 && next < data.Count {
				page.NextOffset = next
			}
		case *tg.InputPeerChat:
			full, err := client.API().MessagesGetFullChat(ctx, value.ChatID)
			if err != nil {
				return fmt.Errorf("get full chat: %w", err)
			}
			chat, ok := full.FullChat.(*tg.ChatFull)
			if !ok {
				return nil
			}
			participants, ok := chat.Participants.(*tg.ChatParticipants)
			if !ok {
				return nil
			}
			rows := s.mapChatParticipants(full.Users, participants.Participants, proxy, ntp)
			page.Total = len(rows)
			if offset < len(rows) {
				end := offset + limit
				if end > len(rows) {
					end = len(rows)
				}
				page.Members = rows[offset:end]
				if end < len(rows) {
					page.NextOffset = end
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if page.Members == nil {
		page.Members = []ChatMemberDTO{}
	}
	return page, nil
}

// GetChatMembers keeps the pre-pagination API for callers that want the first
// screen sorted admins-first. The chat-info pane uses GetChatMembersPage.
func (s *Service) GetChatMembers(
	chatID, proxy, ntp string,
	limit int,
) ([]ChatMemberDTO, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	page, err := s.GetChatMembersPage(chatID, proxy, ntp, 0, limit)
	if err != nil {
		return nil, err
	}
	result := page.Members
	sort.SliceStable(result, func(left, right int) bool {
		if result[left].Admin != result[right].Admin {
			return result[left].Admin
		}
		return strings.ToLower(result[left].Name) < strings.ToLower(result[right].Name)
	})
	return result, nil
}

// sharedMediaFilter maps a tab id to the message filter Telegram Web uses.
func sharedMediaFilter(section string) (tg.MessagesFilterClass, bool) {
	switch section {
	case SectionMedia:
		return &tg.InputMessagesFilterPhotoVideo{}, true
	case SectionFiles:
		return &tg.InputMessagesFilterDocument{}, true
	case SectionLinks:
		return &tg.InputMessagesFilterURL{}, true
	case SectionMusic:
		return &tg.InputMessagesFilterMusic{}, true
	case SectionVoice:
		return &tg.InputMessagesFilterRoundVoice{}, true
	case SectionGifs:
		return &tg.InputMessagesFilterGif{}, true
	default:
		return nil, false
	}
}

func sectionForFilter(filter tg.MessagesFilterClass) (string, bool) {
	switch filter.(type) {
	case *tg.InputMessagesFilterPhotoVideo:
		return SectionMedia, true
	case *tg.InputMessagesFilterDocument:
		return SectionFiles, true
	case *tg.InputMessagesFilterURL:
		return SectionLinks, true
	case *tg.InputMessagesFilterMusic:
		return SectionMusic, true
	case *tg.InputMessagesFilterRoundVoice:
		return SectionVoice, true
	case *tg.InputMessagesFilterGif:
		return SectionGifs, true
	default:
		return "", false
	}
}

// matchesSharedMediaSection filters a mapped message against the tab that
// requested it. Telegram's document filter is broader than the "Files" tab on
// the web, which drops music, voice, video, GIFs and stickers.
func matchesSharedMediaSection(section string, message *MessageDTO) bool {
	if message == nil {
		return false
	}
	kind := ""
	if message.Media != nil {
		kind = message.Media.Kind
	}
	switch section {
	case SectionMedia:
		return kind == "photo" || kind == "video"
	case SectionFiles:
		return kind == "file"
	case SectionLinks:
		if kind == "webpage" {
			return true
		}
		return messageHasURL(message)
	case SectionMusic:
		return kind == "audio"
	case SectionVoice:
		return kind == "voice" || kind == "video_note"
	case SectionGifs:
		return kind == "animation"
	default:
		return false
	}
}

// domainURLPattern catches links Telegram users type without a scheme
// ("t.me/name", "example.com/file"). The URL search filter already returns
// those messages; this keeps the local section filter from dropping them.
var domainURLPattern = regexp.MustCompile(`(?i)\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:/\S*)?`)

func messageHasURL(message *MessageDTO) bool {
	for _, entity := range message.Entities {
		switch entity.Type {
		case "link":
			if entity.URL != "" {
				return true
			}
		case "url":
			// messageEntityUrl points at a URL inside the text; the URL itself
			// is the entity slice, so no separate field is set.
			return true
		}
	}
	lower := strings.ToLower(message.Text)
	return strings.Contains(lower, "http://") ||
		strings.Contains(lower, "https://") ||
		domainURLPattern.MatchString(message.Text)
}

// messageListLastID returns the smallest message id of a search page, which is
// the offset cursor for the next page.
func messageListLastID(messages []tg.MessageClass, fallback int) int {
	last := 0
	for _, raw := range messages {
		if msg, ok := raw.(*tg.Message); ok {
			last = msg.ID
		}
	}
	if last <= 0 {
		return 0
	}
	return last
}

// mapChannelParticipants converts channels.getParticipants rows into member
// rows. Kicked/left participants are not members and are skipped.
func (s *Service) mapChannelParticipants(
	users []tg.UserClass,
	participants []tg.ChannelParticipantClass,
	proxy, ntp string,
) []ChatMemberDTO {
	usersByID := make(map[int64]*tg.User, len(users))
	for _, item := range users {
		if user, ok := item.(*tg.User); ok {
			usersByID[user.ID] = user
		}
	}

	result := make([]ChatMemberDTO, 0, len(participants))
	for _, raw := range participants {
		var (
			userID int64
			admin  bool
		)
		switch participant := raw.(type) {
		case *tg.ChannelParticipantCreator:
			userID, admin = participant.UserID, true
		case *tg.ChannelParticipantAdmin:
			userID, admin = participant.UserID, true
		case *tg.ChannelParticipantSelf:
			userID = participant.UserID
		case *tg.ChannelParticipant:
			userID = participant.UserID
		case *tg.ChannelParticipantBanned:
			if participant.Left {
				continue
			}
			if peerUser, ok := participant.Peer.(*tg.PeerUser); ok {
				userID = peerUser.UserID
			}
		default:
			continue
		}
		if userID == 0 {
			continue
		}
		user, ok := usersByID[userID]
		if !ok {
			continue
		}
		if row, ok := s.mapMemberUser(user, admin, proxy, ntp); ok {
			result = append(result, row)
		}
	}
	return result
}

// mapChatParticipants converts basic-group participants from messages.getFullChat.
func (s *Service) mapChatParticipants(
	users []tg.UserClass,
	participants []tg.ChatParticipantClass,
	proxy, ntp string,
) []ChatMemberDTO {
	usersByID := make(map[int64]*tg.User, len(users))
	for _, item := range users {
		if user, ok := item.(*tg.User); ok {
			usersByID[user.ID] = user
		}
	}

	result := make([]ChatMemberDTO, 0, len(participants))
	for _, raw := range participants {
		var (
			userID int64
			admin  bool
		)
		switch participant := raw.(type) {
		case *tg.ChatParticipantCreator:
			userID, admin = participant.UserID, true
		case *tg.ChatParticipantAdmin:
			userID, admin = participant.UserID, true
		case *tg.ChatParticipant:
			userID = participant.UserID
		default:
			continue
		}
		if userID == 0 {
			continue
		}
		user, ok := usersByID[userID]
		if !ok {
			continue
		}
		if row, ok := s.mapMemberUser(user, admin, proxy, ntp); ok {
			result = append(result, row)
		}
	}
	return result
}

func (s *Service) mapMemberUser(
	user *tg.User,
	admin bool,
	proxy, ntp string,
) (ChatMemberDTO, bool) {
	name := displayName(user.FirstName, user.LastName)
	if name == "" {
		name = user.Username
	}
	if name == "" {
		return ChatMemberDTO{}, false
	}
	return ChatMemberDTO{
		ID:       encodePeerID("user", user.ID, user.AccessHash),
		Name:     name,
		Username: user.Username,
		AvatarURL: s.userAvatarURL(
			&tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash},
			user,
			proxy,
			ntp,
		),
		Admin: admin,
		Bot:   user.Bot,
	}, true
}
