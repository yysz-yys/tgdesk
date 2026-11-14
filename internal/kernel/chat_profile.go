package kernel

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// ChatProfileDTO is one peer's full profile for the right-hand info panel and
// the composer capability switch. It is the mapped result of
// users.getFullUser / messages.getFullChat / channels.getFullChannel, shaped
// like the data Telegram Web K renders: type-specific header info, detail rows,
// bot metadata and the send rights the composer needs.
type ChatProfileDTO struct {
	// Type is "user", "bot", "saved", "group" or "channel". It is resolved from
	// the peer itself (the kind argument is only a cache/lookup hint), so Saved
	// Messages and bots are detected even when the dialog list guessed wrong.
	Type string `json:"type"`
	// About is the bio (private peers) or description (groups/channels). Bots
	// fall back to their BotInfo description when the bio is empty.
	About string `json:"about,omitempty"`
	// Username is the main active username without the leading "@".
	Username string `json:"username,omitempty"`
	// Usernames lists every active username of the peer, main/preferred first
	// (channels can own several collectible usernames, Web K shows "also @x").
	Usernames []string `json:"usernames,omitempty"`
	// Phone is only exposed for contacts; Telegram hides it for everyone else.
	Phone string `json:"phone,omitempty"`
	// Members is the participant/subscriber count (0 for private peers).
	Members int `json:"members"`
	// CanViewMembers is true when the participant list is usable (never for
	// broadcast channels, which only show a subscriber count).
	CanViewMembers bool `json:"canViewMembers"`
	// CanSend reports whether the current user may post in the chat at all
	// (rights, not slow mode). Slow mode is described separately by
	// SlowModeSeconds/SlowModeNextSendDate so the composer stays visible.
	CanSend bool `json:"canSend"`
	// CanSendPlain reports whether text messages are allowed. It is false for
	// read-only "media allowed, text not allowed" restrictions.
	CanSendPlain bool `json:"canSendPlain"`
	// CanSendStickers / CanSendGifs report the per-media send rights so the
	// emoji picker can show its blocked states before firing an RPC. They are
	// false whenever CanSend is false.
	CanSendStickers bool `json:"canSendStickers"`
	CanSendGifs     bool `json:"canSendGifs"`
	// GiftsCount is the number of star gifts the peer displays (Telegram Web K
	// decides the Gifts tab from it; optional field in this TL layer).
	GiftsCount int `json:"giftsCount,omitempty"`
	// AdminsCount is the channel administrator count (0 when unknown).
	AdminsCount int `json:"adminsCount,omitempty"`
	// SendRestriction is the machine-readable reason when CanSend is false:
	// "restricted" (rights/banned), "broadcast" (not an admin of a channel) or
	// "not-member" (left the group / pending join).
	SendRestriction string `json:"sendRestriction,omitempty"`
	// SlowModeSeconds is the group's slow-mode interval, 0 when disabled.
	SlowModeSeconds int `json:"slowModeSeconds,omitempty"`
	// SlowModeNextSendDate is the unix time until which the current user has to
	// wait before sending again (0 when it can send right now).
	SlowModeNextSendDate int64 `json:"slowModeNextSendDate,omitempty"`
	IsAdmin              bool  `json:"isAdmin,omitempty"`
	IsOwner              bool  `json:"isOwner,omitempty"`
	IsForum              bool  `json:"isForum,omitempty"`
	// InviteLink is a t.me/+... invite link when one is available (best effort;
	// public peers use Username instead).
	InviteLink string `json:"inviteLink,omitempty"`
	// LinkedChatID is the opaque peer id of the linked discussion group (or of
	// the supergroup a migrated basic group points at), empty when unresolved.
	LinkedChatID string `json:"linkedChatId,omitempty"`
	// LinkedChat is the mapped linked discussion chat when the full-info response
	// carried its entity, so the UI can open the discussion in-app even when it
	// is not in the current dialog list. LinkedChatID is always kept.
	LinkedChat *ChatDTO `json:"linkedChat,omitempty"`
	// MessagesCount is the number of messages in Saved Messages (peer self),
	// read from one messages.getHistory page; 0 for every other peer and on
	// failure. Telegram Web renders it as the Saved Messages header subtitle.
	MessagesCount int `json:"messagesCount,omitempty"`
	// Presence of a human private peer: Online/LastSeen/Status mirror the
	// ChatDTO presence fields (Status is one of the Presence* constants). Bots,
	// groups, channels and Saved Messages keep the zero values so the UI shows
	// the type-specific subtitle instead.
	Online        bool              `json:"online,omitempty"`
	LastSeen      int64             `json:"lastSeen,omitempty"`
	Status        string            `json:"status,omitempty"`
	BotCommands   []BotCommandDTO   `json:"botCommands,omitempty"`
	BotMenuButton *BotMenuButtonDTO `json:"botMenuButton,omitempty"`
	// BotOwnerID is reserved for clients whose TL layer exposes the bot owner;
	// this layer (gotd v0.140.0) does not, so it stays empty.
	BotOwnerID string `json:"botOwnerId,omitempty"`
	// BotPrivacyURL follows the documented fallback: the explicit policy URL,
	// the bot's /privacy command (no URL is returned for it), otherwise the
	// Telegram mini-app privacy policy.
	BotPrivacyURL string `json:"botPrivacyUrl,omitempty"`
}

// BotCommandDTO is one entry of a bot's command list ("command" without the
// leading slash, exactly like Telegram Web renders it).
type BotCommandDTO struct {
	Command     string `json:"command"`
	Description string `json:"description,omitempty"`
}

// BotMenuButtonDTO mirrors the bot menu button that sits in front of the
// composer. "webapp" opens the URL as a mini app, "commands" and "default"
// mean "show the command list".
type BotMenuButtonDTO struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	URL  string `json:"url,omitempty"`
}

// ChatProfileType* are the values of ChatProfileDTO.Type.
const (
	ChatProfileTypeUser    = "user"
	ChatProfileTypeBot     = "bot"
	ChatProfileTypeSaved   = "saved"
	ChatProfileTypeGroup   = "group"
	ChatProfileTypeChannel = "channel"
)

// BotMenuButton* are the values of BotMenuButtonDTO.Type.
const (
	BotMenuButtonTypeDefault  = "default"
	BotMenuButtonTypeCommands = "commands"
	BotMenuButtonTypeWebApp   = "webapp"
)

// ChatSendRestriction* are the values of ChatProfileDTO.SendRestriction.
const (
	ChatSendRestrictionRestricted = "restricted"
	ChatSendRestrictionBroadcast  = "broadcast"
	ChatSendRestrictionNotMember  = "not-member"
)

// chatProfileCacheTTL mirrors Telegram Web's peer-full cache: profiles change
// slowly and the composer re-reads them on every chat open.
const chatProfileCacheTTL = 60 * time.Second

// chatProfileCacheEntry keeps one mapped profile and when it was fetched.
type chatProfileCacheEntry struct {
	profile *ChatProfileDTO
	at      time.Time
}

// GetChatProfile resolves the full profile of a peer. kind is the dialog kind
// the UI already knows ("private", "group", "channel"); the server answer
// decides the authoritative type, so bots and Saved Messages are detected even
// if the dialog list could not. The result is cached for a minute like
// GetChatInfo, so opening the info panel and then the composer is one RPC burst.
func (s *Service) GetChatProfile(chatID, kind, proxy, ntp string) (*ChatProfileDTO, error) {
	cacheKey := chatID + "|" + kind
	if cached := s.cachedChatProfile(cacheKey); cached != nil {
		return cached, nil
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}
	s.rememberPeer(peer)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var profile *ChatProfileDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		switch p := peer.(type) {
		case *tg.InputPeerUser:
			resp, err := client.API().UsersGetFullUser(ctx, &tg.InputUser{
				UserID:     p.UserID,
				AccessHash: p.AccessHash,
			})
			if err != nil {
				return fmt.Errorf("get full user: %w", err)
			}
			user := findUserEntity(resp.Users, p.UserID)
			if user == nil {
				// The full-user response sometimes omits the target entity; the
				// username/bot flags live on tg.User only, so ask once more.
				user = fetchUserEntity(ctx, client, p)
			}
			profile = mapUserProfile(resp.FullUser, user, p.UserID == s.selfUserID())
			if profile.Type == ChatProfileTypeSaved {
				profile.MessagesCount = s.savedMessagesCount(ctx, client, peer)
			}
		case *tg.InputPeerChat:
			resp, err := client.API().MessagesGetFullChat(ctx, p.ChatID)
			if err != nil {
				return fmt.Errorf("get full chat: %w", err)
			}
			full, ok := resp.FullChat.(*tg.ChatFull)
			if !ok {
				return fmt.Errorf("unexpected full chat %T", resp.FullChat)
			}
			chat := findChatEntity(resp.Chats, p.ChatID)
			profile = mapBasicGroupProfile(full, chat)
			profile.LinkedChat = s.linkedChatDTO(resp.Chats, profile.LinkedChatID, proxy, ntp)
			if profile.InviteLink == "" && (chat == nil || !chat.GetLeft()) {
				profile.InviteLink = exportChatInviteLink(ctx, client, peer)
			}
		case *tg.InputPeerChannel:
			input := &tg.InputChannel{ChannelID: p.ChannelID, AccessHash: p.AccessHash}
			resp, err := client.API().ChannelsGetFullChannel(ctx, input)
			if err != nil {
				return fmt.Errorf("get full channel: %w", err)
			}
			full, ok := resp.FullChat.(*tg.ChannelFull)
			if !ok {
				return fmt.Errorf("unexpected full channel %T", resp.FullChat)
			}
			channel := findChannelEntity(resp.Chats, p.ChannelID)
			if channel == nil {
				channel = fetchChannelEntity(ctx, client, input)
			}
			own := channelOwnRightsFromEntity(channel)
			if !own.isOwner && !own.isAdmin && !own.hasBannedRights {
				s.fetchOwnChannelRights(ctx, client, input, &own)
			}
			linked := ""
			if raw, ok := full.GetLinkedChatID(); ok && raw != 0 {
				linked = s.resolveLinkedChatID(resp.Chats, raw)
			}
			profile = mapChannelProfile(full, channel, own, linked)
			profile.LinkedChat = s.linkedChatDTO(resp.Chats, linked, proxy, ntp)
			if profile.InviteLink == "" && profile.Username == "" && profile.IsAdmin {
				profile.InviteLink = exportChatInviteLink(ctx, client, peer)
			}
		default:
			return fmt.Errorf("invalid chat type")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, fmt.Errorf("empty chat profile")
	}
	s.storeChatProfile(cacheKey, profile)
	return profile, nil
}

// selfUserID is the cached id of the logged-in account, used to detect Saved
// Messages (the private chat with yourself).
func (s *Service) selfUserID() int64 {
	s.authMu.Lock()
	defer s.authMu.Unlock()
	if s.authUser == nil {
		return 0
	}
	return s.authUser.ID
}

func (s *Service) cachedChatProfile(key string) *ChatProfileDTO {
	s.chatProfileCacheMu.Lock()
	defer s.chatProfileCacheMu.Unlock()
	entry, ok := s.chatProfileCache[key]
	if !ok || time.Since(entry.at) >= chatProfileCacheTTL {
		return nil
	}
	return cloneChatProfile(entry.profile)
}

func (s *Service) storeChatProfile(key string, profile *ChatProfileDTO) {
	if profile == nil {
		return
	}
	s.chatProfileCacheMu.Lock()
	defer s.chatProfileCacheMu.Unlock()
	if len(s.chatProfileCache) > 256 {
		for cachedKey, entry := range s.chatProfileCache {
			if time.Since(entry.at) >= chatProfileCacheTTL {
				delete(s.chatProfileCache, cachedKey)
			}
		}
	}
	s.chatProfileCache[key] = chatProfileCacheEntry{profile: cloneChatProfile(profile), at: time.Now()}
}

// cloneChatProfile returns a shallow copy with its slices/pointers detached so
// the cache cannot be mutated by a caller.
func cloneChatProfile(profile *ChatProfileDTO) *ChatProfileDTO {
	if profile == nil {
		return nil
	}
	clone := *profile
	clone.BotCommands = append([]BotCommandDTO(nil), profile.BotCommands...)
	clone.Usernames = append([]string(nil), profile.Usernames...)
	if profile.BotMenuButton != nil {
		button := *profile.BotMenuButton
		clone.BotMenuButton = &button
	}
	if profile.LinkedChat != nil {
		linked := *profile.LinkedChat
		clone.LinkedChat = &linked
	}
	return &clone
}

// --------------------------------------------------------------- entity lookup

func findUserEntity(users []tg.UserClass, userID int64) *tg.User {
	for _, raw := range users {
		if user, ok := raw.(*tg.User); ok && user.ID == userID {
			return user
		}
	}
	return nil
}

func findChatEntity(chats []tg.ChatClass, chatID int64) *tg.Chat {
	for _, raw := range chats {
		if chat, ok := raw.(*tg.Chat); ok && chat.ID == chatID {
			return chat
		}
	}
	return nil
}

func findChannelEntity(chats []tg.ChatClass, channelID int64) *tg.Channel {
	for _, raw := range chats {
		if channel, ok := raw.(*tg.Channel); ok && channel.ID == channelID {
			return channel
		}
	}
	return nil
}

// fetchUserEntity is the graceful fallback when users.getFullUser did not carry
// the target entity: without it the bot flag and username would be lost.
func fetchUserEntity(ctx context.Context, client *telegram.Client, peer *tg.InputPeerUser) *tg.User {
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	users, err := client.API().UsersGetUsers(callCtx, []tg.InputUserClass{&tg.InputUser{
		UserID:     peer.UserID,
		AccessHash: peer.AccessHash,
	}})
	if err != nil {
		return nil
	}
	return findUserEntity(users, peer.UserID)
}

// fetchChannelEntity is the same fallback for channels.getFullChannel.
func fetchChannelEntity(ctx context.Context, client *telegram.Client, input *tg.InputChannel) *tg.Channel {
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	chats, err := client.API().ChannelsGetChannels(callCtx, []tg.InputChannelClass{input})
	if err != nil {
		return nil
	}
	for _, raw := range chats.GetChats() {
		if channel, ok := raw.(*tg.Channel); ok && channel.ID == input.ChannelID {
			return channel
		}
	}
	return nil
}

// linkedChatDTO maps the linked discussion chat when the full-info response
// carried its entity (channels.getFullChannel and messages.getFullChat both
// attach the linked/migrated chat to their Chat list in practice). The opaque
// LinkedChatID stays available as the fallback when the entity is absent; the
// peer index is not used here so the UI always gets complete title/members.
func (s *Service) linkedChatDTO(
	entities []tg.ChatClass,
	linkedID string,
	proxy, ntp string,
) *ChatDTO {
	if linkedID == "" {
		return nil
	}
	peer, err := parsePeerID(linkedID)
	if err != nil {
		return nil
	}
	switch value := peer.(type) {
	case *tg.InputPeerChannel:
		if channel := findChannelEntity(entities, value.ChannelID); channel != nil {
			chat, ok := s.chatDTOFromPeerEntities(
				&tg.PeerChannel{ChannelID: channel.ID},
				nil,
				[]tg.ChatClass{channel},
				proxy,
				ntp,
			)
			if ok {
				return chat
			}
		}
	case *tg.InputPeerChat:
		if entity := findChatEntity(entities, value.ChatID); entity != nil {
			chat, ok := s.chatDTOFromPeerEntities(
				&tg.PeerChat{ChatID: entity.ID},
				nil,
				[]tg.ChatClass{entity},
				proxy,
				ntp,
			)
			if ok {
				return chat
			}
		}
	}
	return nil
}

// savedMessagesCount reads the total number of Saved Messages with one
// messages.getHistory page (the server returns the total in the slice Count).
// It is best effort: 0 on any failure so the profile still loads.
func (s *Service) savedMessagesCount(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
) int {
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	resp, err := client.API().MessagesGetHistory(callCtx, &tg.MessagesGetHistoryRequest{
		Peer:  peer,
		Limit: 1,
	})
	if err != nil {
		return 0
	}
	switch value := resp.(type) {
	case *tg.MessagesMessagesSlice:
		return value.Count
	case *tg.MessagesMessages:
		return len(value.Messages)
	case *tg.MessagesChannelMessages:
		return value.Count
	default:
		return 0
	}
}

// resolveLinkedChatID turns a raw linked_chat_id into the opaque peer id the UI
// navigates with. The linked chat is not always part of the response entities,
// so the live peer index is used as a fallback.
func (s *Service) resolveLinkedChatID(entities []tg.ChatClass, linkedID int64) string {
	for _, raw := range entities {
		switch linked := raw.(type) {
		case *tg.Channel:
			if linked.ID == linkedID {
				return encodePeerID("channel", linked.ID, linked.AccessHash)
			}
		case *tg.Chat:
			if linked.ID == linkedID {
				return encodePeerID("chat", linked.ID, 0)
			}
		}
	}
	if key := s.lookupPeer("channel", linkedID); key != "" {
		return key
	}
	return s.lookupPeer("chat", linkedID)
}

// ------------------------------------------------------------ user mapping

// mapUserProfile maps users.getFullUser into the panel shape. saved is true
// when the peer is the private chat with the current account (Saved Messages).
func mapUserProfile(full tg.UserFull, user *tg.User, saved bool) *ChatProfileDTO {
	profile := &ChatProfileDTO{
		Type:            ChatProfileTypeUser,
		CanSend:         true,
		CanSendPlain:    true,
		CanSendStickers: true,
		CanSendGifs:     true,
	}

	botInfo, hasBotInfo := full.GetBotInfo()
	isBot := user != nil && user.Bot
	if hasBotInfo {
		isBot = true
	}
	switch {
	case saved:
		profile.Type = ChatProfileTypeSaved
	case isBot:
		profile.Type = ChatProfileTypeBot
	}

	if about, ok := full.GetAbout(); ok && about != "" {
		profile.About = about
	}
	if gifts, ok := full.GetStargiftsCount(); ok {
		profile.GiftsCount = gifts
	}
	if user != nil {
		profile.Username = user.Username
		if profile.Username == "" {
			if usernames, ok := user.GetUsernames(); ok {
				profile.Username = preferredUsername(usernames)
			}
		}
		usernames, _ := user.GetUsernames()
		profile.Usernames = activeUsernameList(profile.Username, usernames)
		if user.Contact || user.MutualContact {
			if phone, ok := user.GetPhone(); ok {
				profile.Phone = phone
			}
		}
	}
	// Presence is only meaningful for human private peers; Saved Messages and
	// bots keep the zero values (see userPresence).
	if user != nil && !isBot && !saved {
		profile.Online, profile.LastSeen, profile.Status = userPresence(user, 0)
	}

	if profile.Type != ChatProfileTypeBot {
		return profile
	}

	if hasBotInfo {
		if description, ok := botInfo.GetDescription(); ok && profile.About == "" {
			profile.About = description
		}
		if commands, ok := botInfo.GetCommands(); ok {
			profile.BotCommands = mapBotCommands(commands)
		}
		if button, ok := botInfo.GetMenuButton(); ok {
			profile.BotMenuButton = mapBotMenuButton(button)
		} else if len(profile.BotCommands) > 0 {
			// No explicit button means the client shows the command list, which
			// Telegram models as the "default" menu button.
			profile.BotMenuButton = &BotMenuButtonDTO{Type: BotMenuButtonTypeDefault}
		}
		profile.BotPrivacyURL = mapBotPrivacyURL(botInfo, profile.BotCommands)
	}
	return profile
}

func preferredUsername(usernames []tg.Username) string {
	fallback := ""
	for _, username := range usernames {
		if !username.Active || username.Username == "" {
			continue
		}
		if fallback == "" {
			fallback = username.Username
		}
		if !username.Editable {
			return username.Username
		}
	}
	return fallback
}

// activeUsernameList returns every active username with the main/preferred one
// first (Web K renders the extra names as "also @x" under the main link row).
func activeUsernameList(primary string, usernames []tg.Username) []string {
	ordered := make([]string, 0, len(usernames)+1)
	seen := make(map[string]struct{}, len(usernames)+1)
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		ordered = append(ordered, name)
	}
	add(primary)
	add(preferredUsername(usernames))
	for _, username := range usernames {
		if username.Active {
			add(username.Username)
		}
	}
	if len(ordered) == 0 {
		return nil
	}
	return ordered
}

// deriveStickerGifRights applies the chat's default banned rights to the two
// media classes the emoji picker sends. Sending stickers/GIFs still has to be
// allowed at all (canSend), and an admin is not restricted by default bans.
func deriveStickerGifRights(
	canSend bool,
	hasBannedRights bool,
	bannedRights tg.ChatBannedRights,
) (canSendStickers, canSendGifs bool) {
	if !canSend {
		return false, false
	}
	canSendStickers, canSendGifs = true, true
	if hasBannedRights {
		if bannedRights.SendStickers {
			canSendStickers = false
		}
		if bannedRights.SendGifs {
			canSendGifs = false
		}
	}
	return canSendStickers, canSendGifs
}

func mapBotCommands(commands []tg.BotCommand) []BotCommandDTO {
	if len(commands) == 0 {
		return nil
	}
	result := make([]BotCommandDTO, 0, len(commands))
	seen := make(map[string]struct{}, len(commands))
	for _, command := range commands {
		name := strings.TrimPrefix(strings.TrimSpace(command.Command), "/")
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		result = append(result, BotCommandDTO{Command: name, Description: command.Description})
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func mapBotMenuButton(button tg.BotMenuButtonClass) *BotMenuButtonDTO {
	switch value := button.(type) {
	case *tg.BotMenuButton:
		return &BotMenuButtonDTO{Type: BotMenuButtonTypeWebApp, Text: value.Text, URL: value.URL}
	case *tg.BotMenuButtonCommands:
		return &BotMenuButtonDTO{Type: BotMenuButtonTypeCommands}
	case *tg.BotMenuButtonDefault:
		return &BotMenuButtonDTO{Type: BotMenuButtonTypeDefault}
	default:
		return nil
	}
}

// mapBotPrivacyURL follows the documented rules from botInfo.privacy_policy_url:
// the explicit URL wins; a bot exposing a /privacy command must be asked through
// that command (there is no URL to return, so the UI should use the command
// list); otherwise the Telegram mini-app privacy policy applies.
func mapBotPrivacyURL(botInfo tg.BotInfo, commands []BotCommandDTO) string {
	if policyURL, ok := botInfo.GetPrivacyPolicyURL(); ok && policyURL != "" {
		return policyURL
	}
	for _, command := range commands {
		if command.Command == "privacy" {
			return ""
		}
	}
	return "https://telegram.org/privacy-tpa"
}

// -------------------------------------------------------- basic group mapping

// mapBasicGroupProfile maps messages.getFullChat. A basic group has no separate
// subscriber concept and no slow mode; its rights come from the tg.Chat entity
// (creator flag, admin rights, left/deactivated flags and legacy default bans).
func mapBasicGroupProfile(full *tg.ChatFull, chat *tg.Chat) *ChatProfileDTO {
	profile := &ChatProfileDTO{Type: ChatProfileTypeGroup, CanSend: true, CanSendPlain: true}
	if full != nil {
		profile.About = full.GetAbout()
		if invite, ok := full.GetExportedInvite(); ok {
			profile.InviteLink = exportedInviteLink(invite)
		}
		if bots, ok := full.GetBotInfo(); ok {
			profile.BotCommands = flattenBotCommands(bots)
		}
	}

	var (
		isOwner       bool
		left          bool
		deactivated   bool
		hasBanned     bool
		bannedRights  tg.ChatBannedRights
		adminRights   tg.ChatAdminRights
		hasAdminRight bool
	)
	if chat != nil {
		profile.Members = chat.GetParticipantsCount()
		isOwner = chat.GetCreator()
		left = chat.GetLeft()
		deactivated = chat.GetDeactivated()
		if rights, ok := chat.GetAdminRights(); ok {
			adminRights, hasAdminRight = rights, true
		}
		if rights, ok := chat.GetDefaultBannedRights(); ok {
			bannedRights, hasBanned = rights, true
		}
		if migrated, ok := chat.GetMigratedTo(); ok {
			profile.LinkedChatID = encodeInputChannel(migrated)
		}
	}
	_ = hasAdminRight
	profile.IsOwner = isOwner
	profile.IsAdmin = isOwner || hasAnyAdminRight(adminRights)
	profile.CanViewMembers = !left
	profile.CanSend, profile.CanSendPlain, profile.SendRestriction = deriveBasicGroupRights(
		isOwner,
		profile.IsAdmin,
		left,
		deactivated,
		hasBanned,
		bannedRights,
	)
	// Default banned rights apply to members, not to admins/owner.
	profile.CanSendStickers, profile.CanSendGifs = deriveStickerGifRights(
		profile.CanSend,
		hasBanned && !profile.IsAdmin,
		bannedRights,
	)
	return profile
}

// deriveBasicGroupRights ports the send part of tweb hasRights for basic
// groups. Slow mode does not exist there, so it is not modelled.
func deriveBasicGroupRights(
	isOwner, isAdmin, left, deactivated bool,
	hasBannedRights bool,
	bannedRights tg.ChatBannedRights,
) (canSend, canSendPlain bool, restriction string) {
	if isOwner {
		return true, true, ""
	}
	if deactivated {
		return false, false, ChatSendRestrictionRestricted
	}
	if left {
		return false, false, ChatSendRestrictionNotMember
	}
	if hasBannedRights && !isAdmin && bannedRights.SendMessages {
		return false, false, ChatSendRestrictionRestricted
	}
	canSend, canSendPlain = true, true
	if hasBannedRights && bannedRights.SendPlain {
		canSendPlain = false
	}
	return canSend, canSendPlain, ""
}

// flattenBotCommands merges the command lists of every bot that is a member of
// a group, deduplicated by command name.
func flattenBotCommands(bots []tg.BotInfo) []BotCommandDTO {
	var commands []tg.BotCommand
	for _, bot := range bots {
		if list, ok := bot.GetCommands(); ok {
			commands = append(commands, list...)
		}
	}
	return mapBotCommands(commands)
}

func encodeInputChannel(channel tg.InputChannelClass) string {
	switch value := channel.(type) {
	case *tg.InputChannel:
		return encodePeerID("channel", value.ChannelID, value.AccessHash)
	case *tg.InputChannelFromMessage:
		if value.Peer != nil {
			if peer, ok := value.Peer.(*tg.InputPeerChannel); ok {
				return encodePeerID("channel", peer.ChannelID, peer.AccessHash)
			}
		}
		return encodePeerID("channel", value.ChannelID, 0)
	default:
		// An empty channel cannot be navigated to; leave the row out.
		return ""
	}
}

// ------------------------------------------------------- channel/supergroup

// channelOwnRights is the current user's standing in a channel: owner (creator),
// admin rights and self-restrictions. It is merged from the tg.Channel entity
// and, when that entity omitted optional rights, a channels.getParticipant(self)
// fallback.
type channelOwnRights struct {
	isOwner         bool
	isAdmin         bool
	adminRights     tg.ChatAdminRights
	bannedRights    tg.ChatBannedRights
	hasBannedRights bool
}

func channelOwnRightsFromEntity(channel *tg.Channel) channelOwnRights {
	var own channelOwnRights
	if channel == nil {
		return own
	}
	own.isOwner = channel.GetCreator()
	if rights, ok := channel.GetAdminRights(); ok {
		own.adminRights = rights
		own.isAdmin = hasAnyAdminRight(rights)
	}
	if rights, ok := channel.GetBannedRights(); ok {
		own.bannedRights = rights
		own.hasBannedRights = true
	}
	return own
}

// fetchOwnChannelRights covers accounts whose cached entities omit admin/banned
// rights (old sessions, min entities). Errors are ignored: rights stay at their
// zero value, which degrades to "normal member" instead of failing the profile.
func (s *Service) fetchOwnChannelRights(
	ctx context.Context,
	client *telegram.Client,
	input *tg.InputChannel,
	own *channelOwnRights,
) {
	if own == nil {
		return
	}
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	resp, err := client.API().ChannelsGetParticipant(callCtx, &tg.ChannelsGetParticipantRequest{
		Channel:     input,
		Participant: &tg.InputPeerSelf{},
	})
	if err != nil || resp == nil {
		return
	}
	switch participant := resp.Participant.(type) {
	case *tg.ChannelParticipantCreator:
		own.isOwner = true
		own.adminRights = participant.AdminRights
		own.isAdmin = hasAnyAdminRight(participant.AdminRights)
	case *tg.ChannelParticipantAdmin:
		own.isAdmin = true
		own.adminRights = participant.AdminRights
	case *tg.ChannelParticipantBanned:
		if !participant.Left {
			own.bannedRights = participant.BannedRights
			own.hasBannedRights = true
		}
	}
}

// mapChannelProfile maps channels.getFullChannel. Channel rights are derived
// exactly like tweb hasRights: creators and admins with post_messages can post
// in broadcast channels, megagroup members unless banned, slow mode is not part
// of the rights (the composer renders the countdown from the slow-mode fields).
func mapChannelProfile(
	full *tg.ChannelFull,
	channel *tg.Channel,
	own channelOwnRights,
	linkedChatID string,
) *ChatProfileDTO {
	profile := &ChatProfileDTO{
		Type:           ChatProfileTypeChannel,
		CanSend:        true,
		CanSendPlain:   true,
		LinkedChatID:   linkedChatID,
		IsAdmin:        own.isAdmin || own.isOwner,
		IsOwner:        own.isOwner,
		CanViewMembers: false,
	}

	broadcast := true
	megagroup := false
	gigagroup := false
	restricted := false
	left := false
	joinToSend := false
	joinRequest := false
	requestsPending := 0
	if channel != nil {
		broadcast = !channel.GetMegagroup()
		megagroup = channel.GetMegagroup()
		gigagroup = channel.GetGigagroup()
		restricted = channel.GetRestricted()
		left = channel.GetLeft()
		joinToSend = channel.GetJoinToSend()
		joinRequest = channel.GetJoinRequest()
		profile.IsForum = channel.GetForum()
		profile.Username = channel.Username
		if profile.Username == "" {
			if usernames, ok := channel.GetUsernames(); ok {
				profile.Username = preferredUsername(usernames)
			}
		}
		usernames, _ := channel.GetUsernames()
		profile.Usernames = activeUsernameList(profile.Username, usernames)
	}
	if megagroup {
		profile.Type = ChatProfileTypeGroup
	}

	if full != nil {
		profile.About = full.GetAbout()
		if count, ok := full.GetParticipantsCount(); ok {
			profile.Members = count
		} else if channel != nil {
			if count, ok := channel.GetParticipantsCount(); ok {
				profile.Members = count
			}
		}
		if slowmode, ok := full.GetSlowmodeSeconds(); ok {
			profile.SlowModeSeconds = slowmode
		}
		if next, ok := full.GetSlowmodeNextSendDate(); ok {
			profile.SlowModeNextSendDate = int64(next)
		}
		if invite, ok := full.GetExportedInvite(); ok {
			profile.InviteLink = exportedInviteLink(invite)
		}
		profile.BotCommands = flattenBotCommands(full.GetBotInfo())
		if pending, ok := full.GetRequestsPending(); ok {
			requestsPending = pending
		}
		if gifts, ok := full.GetStargiftsCount(); ok {
			profile.GiftsCount = gifts
		}
		if admins, ok := full.GetAdminsCount(); ok {
			profile.AdminsCount = admins
		}
		profile.CanViewMembers = full.GetCanViewParticipants() && !full.GetParticipantsHidden()
	}
	// Broadcast channels never expose a member list, only the subscriber count.
	if broadcast {
		profile.CanViewMembers = false
	}

	profile.CanSend, profile.CanSendPlain, profile.SendRestriction = deriveChannelSendRights(channelSendState{
		isOwner:         own.isOwner,
		isAdmin:         own.isAdmin,
		adminRights:     own.adminRights,
		bannedRights:    own.bannedRights,
		hasBannedRights: own.hasBannedRights,
		restricted:      restricted,
		left:            left,
		joinRequest:     joinRequest,
		broadcast:       broadcast,
		gigagroup:       gigagroup,
		joinToSend:      joinToSend,
		requestsPending: requestsPending,
	})
	profile.CanSendStickers, profile.CanSendGifs = deriveStickerGifRights(
		profile.CanSend,
		own.hasBannedRights,
		own.bannedRights,
	)
	return profile
}

// channelSendState is the minimal rights snapshot the pure derivation needs, so
// the logic is unit-testable without a network client.
type channelSendState struct {
	isOwner         bool
	isAdmin         bool
	adminRights     tg.ChatAdminRights
	bannedRights    tg.ChatBannedRights
	hasBannedRights bool
	restricted      bool
	left            bool
	joinRequest     bool
	broadcast       bool
	gigagroup       bool
	joinToSend      bool
	requestsPending int
}

// deriveChannelSendRights ports the send branch of tweb hasRights.ts:
//   - creator can always post;
//   - platform-restricted peers cannot be posted to;
//   - broadcast channels/gigagroups accept posts only from admins with
//     post_messages;
//   - megagroups need membership (not left, no pending join request) and no
//     send_messages ban; send_plain bans only read-only text.
func deriveChannelSendRights(state channelSendState) (canSend, canSendPlain bool, restriction string) {
	if state.isOwner {
		return true, true, ""
	}
	if state.hasBannedRights && !state.isAdmin && state.bannedRights.SendMessages {
		return false, false, ChatSendRestrictionRestricted
	}
	if state.restricted {
		return false, false, ChatSendRestrictionRestricted
	}
	if state.broadcast || state.gigagroup {
		if !state.isAdmin || !state.adminRights.PostMessages {
			return false, false, ChatSendRestrictionBroadcast
		}
		canSendPlain = !state.hasBannedRights || !state.bannedRights.SendPlain
		return true, canSendPlain, ""
	}
	if state.left {
		return false, false, ChatSendRestrictionNotMember
	}
	if state.joinRequest && !state.isAdmin {
		return false, false, ChatSendRestrictionNotMember
	}
	if state.joinToSend && state.left {
		return false, false, ChatSendRestrictionNotMember
	}
	if state.requestsPending > 0 && !state.isAdmin {
		return false, false, ChatSendRestrictionNotMember
	}
	canSend, canSendPlain = true, true
	if state.hasBannedRights && state.bannedRights.SendPlain {
		canSendPlain = false
	}
	return canSend, canSendPlain, ""
}

// hasAnyAdminRight is true when at least one admin permission is granted. The
// zero struct means "not an admin".
func hasAnyAdminRight(rights tg.ChatAdminRights) bool {
	return rights.ChangeInfo ||
		rights.PostMessages ||
		rights.EditMessages ||
		rights.DeleteMessages ||
		rights.BanUsers ||
		rights.InviteUsers ||
		rights.PinMessages ||
		rights.AddAdmins ||
		rights.Anonymous ||
		rights.ManageCall ||
		rights.Other ||
		rights.ManageTopics ||
		rights.PostStories ||
		rights.EditStories ||
		rights.DeleteStories ||
		rights.ManageDirectMessages
}

// exportedInviteLink extracts a usable invite link; revoked or legacy-chat
// invites do not expose one.
func exportedInviteLink(invite tg.ExportedChatInviteClass) string {
	switch value := invite.(type) {
	case *tg.ChatInviteExported:
		if value.Revoked || value.Link == "" {
			return ""
		}
		return value.Link
	case *tg.ChatInvitePublicJoinRequests:
		return ""
	default:
		return ""
	}
}

// exportChatInviteLink asks the server for an invite link. It is strictly best
// effort: non-admins get CHAT_ADMIN_REQUIRED and the profile simply has no link.
func exportChatInviteLink(ctx context.Context, client *telegram.Client, peer tg.InputPeerClass) string {
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	invite, err := client.API().MessagesExportChatInvite(callCtx, &tg.MessagesExportChatInviteRequest{
		Peer: peer,
	})
	if err != nil {
		return ""
	}
	return exportedInviteLink(invite)
}
