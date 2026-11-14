package kernel

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

// In-app Telegram link routing. The frontend sends every t.me / telegram.me /
// tg:// click here instead of opening the system browser; the kernel classifies
// the link, resolves public usernames and private invites through MTProto and
// returns an opaque ChatDTO (+ message id) the UI can select.

// Values of ResolvedTelegramLinkDTO.Kind.
const (
	TelegramLinkKindChat        = "chat"
	TelegramLinkKindInvite      = "invite"
	TelegramLinkKindUnsupported = "unsupported"
)

// ResolvedTelegramLinkDTO is everything the UI needs to route one link click.
// Kind decides the branch: "chat" selects Chat (optionally at MessageID),
// "invite" opens the join sheet (or the chat directly when AlreadyMember) and
// "unsupported" shows a "not supported" toast.
type ResolvedTelegramLinkDTO struct {
	Kind          string   `json:"kind"`
	URL           string   `json:"url"`
	Chat          *ChatDTO `json:"chat,omitempty"`
	MessageID     int      `json:"messageId,omitempty"`
	InviteHash    string   `json:"inviteHash,omitempty"`
	InviteTitle   string   `json:"inviteTitle,omitempty"`
	InviteMembers int      `json:"inviteMembers,omitempty"`
	AlreadyMember bool     `json:"alreadyMember,omitempty"`
}

// Parsed link kinds (internal; the public DTO only exposes chat/invite/
// unsupported).
const (
	parsedLinkKindPeer        = "peer"
	parsedLinkKindPrivatePost = "private_post"
	parsedLinkKindInvite      = "invite"
	parsedLinkKindUserByID    = "user_by_id"
	parsedLinkKindExternal    = "external"
	parsedLinkKindUnsupported = "unsupported"
)

// parsedTelegramLink is the pure classifier result; it never touches the
// network so it is fully unit-testable.
type parsedTelegramLink struct {
	Kind       string
	URL        string
	Username   string
	PostID     int
	ThreadID   int
	ChannelID  int64
	InviteHash string
	UserID     int64
}

// telegramHosts is the exact host allow-list (lowercase). telegram.dog is the
// legacy alias both Telegram Web K and Web A accept.
var telegramHosts = map[string]struct{}{
	"t.me":         {},
	"telegram.me":  {},
	"telegram.dog": {},
}

// classifyTelegramLink parses a link without any network access. The rules
// mirror Telegram Web K's wrapUrl/matchTelegramUrlHost:
//   - only http/https URLs and the tg:// scheme are considered; javascript:,
//     data: and other schemes are always unsupported;
//   - the host must be exactly t.me / telegram.me / telegram.dog (or a single
//     username label in front of t.me, e.g. durov.t.me); userinfo and explicit
//     ports are rejected so t.me.evil.com / t.me@evil.com never match;
//   - t.me/<name>, t.me/<name>/<post>, t.me/<name>/<thread>/<post>,
//     t.me/s/<name>, t.me/c/<id>/<post>, t.me/+<hash>, t.me/joinchat/<hash>;
//   - known non-chat t.me sections classify as unsupported (never leak to the
//     system browser); t.me/+<phone> is unsupported, not an invite.
func classifyTelegramLink(raw string) parsedTelegramLink {
	value := strings.TrimSpace(raw)
	parsed := parsedTelegramLink{URL: value, Kind: parsedLinkKindUnsupported}
	if value == "" {
		return parsed
	}
	if strings.HasPrefix(value, "@") {
		username := strings.TrimPrefix(value, "@")
		if isTelegramUsername(username) {
			parsed.Kind = parsedLinkKindPeer
			parsed.Username = username
		}
		return parsed
	}
	if strings.HasPrefix(value, "#") {
		return parsed
	}
	lower := strings.ToLower(value)
	if strings.HasPrefix(lower, "tg://") {
		return classifyTelegramDeepLink(value)
	}
	for _, prefix := range []string{"t.me/", "telegram.me/", "telegram.dog/"} {
		if strings.HasPrefix(lower, prefix) {
			value = "https://" + value
			parsed.URL = value
			break
		}
	}
	if !strings.Contains(lower, "://") {
		// <username>.t.me/... without a scheme.
		hostPart := lower
		if index := strings.IndexByte(hostPart, '/'); index >= 0 {
			hostPart = hostPart[:index]
		}
		if label, ok := strings.CutSuffix(hostPart, ".t.me"); ok && label != "" && !strings.Contains(label, ".") {
			value = "https://" + value
			parsed.URL = value
		}
	}

	parsedURL, err := url.Parse(value)
	if err != nil {
		return parsed
	}
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return parsed
	}
	if parsedURL.User != nil || parsedURL.Port() != "" {
		return parsed
	}
	host := strings.ToLower(parsedURL.Hostname())
	segments := splitLinkPath(parsedURL)
	if _, ok := telegramHosts[host]; ok {
		return classifyTelegramPath(parsed, segments)
	}
	// <username>.t.me is accepted by Telegram Web K; the label is the username
	// (only a single label, no nested domains).
	if strings.HasSuffix(host, ".t.me") {
		label := strings.TrimSuffix(host, ".t.me")
		if label == "" || strings.Contains(label, ".") || !isTelegramUsername(label) {
			return parsed
		}
		parsed.Kind = parsedLinkKindPeer
		parsed.Username = label
		segments = stripPublicPreviewSegment(segments)
		parsed.PostID, parsed.ThreadID = parsePostSegments(segments)
		if parsed.PostID == 0 && len(segments) > 0 {
			// e.g. durov.t.me/<appname> is a web app, not a post.
			parsed = parsedTelegramLink{URL: parsed.URL, Kind: parsedLinkKindUnsupported}
		}
		return parsed
	}
	parsed.Kind = parsedLinkKindExternal
	return parsed
}

// classifyTelegramDeepLink handles the tg:// scheme.
func classifyTelegramDeepLink(raw string) parsedTelegramLink {
	parsed := parsedTelegramLink{URL: raw, Kind: parsedLinkKindUnsupported}
	u, err := url.Parse(raw)
	if err != nil {
		return parsed
	}
	query := u.Query()
	switch strings.ToLower(u.Host) {
	case "resolve":
		if phone := strings.TrimSpace(query.Get("phone")); phone != "" {
			return parsed
		}
		if app := strings.TrimSpace(query.Get("appname")); app != "" {
			return parsed
		}
		username := strings.TrimSpace(query.Get("domain"))
		if !isTelegramUsername(username) {
			return parsed
		}
		parsed.Kind = parsedLinkKindPeer
		parsed.Username = username
		if post, err := strconv.Atoi(query.Get("post")); err == nil && post > 0 {
			parsed.PostID = post
		}
		if thread, err := strconv.Atoi(query.Get("thread")); err == nil && thread > 0 && parsed.PostID > 0 {
			parsed.ThreadID = thread
		}
		return parsed
	case "join", "joinchat":
		hash := strings.TrimSpace(query.Get("invite"))
		if hash != "" {
			parsed.Kind = parsedLinkKindInvite
			parsed.InviteHash = hash
		}
		return parsed
	case "user":
		id, err := strconv.ParseInt(strings.TrimSpace(query.Get("id")), 10, 64)
		if err == nil && id > 0 {
			parsed.Kind = parsedLinkKindUserByID
			parsed.UserID = id
		}
		return parsed
	case "privatepost":
		channelID, channelErr := strconv.ParseInt(strings.TrimSpace(query.Get("channel")), 10, 64)
		post, postErr := strconv.Atoi(strings.TrimSpace(query.Get("post")))
		if channelErr == nil && postErr == nil && channelID > 0 && post > 0 {
			parsed.Kind = parsedLinkKindPrivatePost
			parsed.ChannelID = channelID
			parsed.PostID = post
		}
		return parsed
	default:
		return parsed
	}
}

// classifyTelegramPath classifies the path of a t.me/telegram.me URL.
func classifyTelegramPath(parsed parsedTelegramLink, segments []string) parsedTelegramLink {
	segments = stripPublicPreviewSegment(segments)
	if len(segments) == 0 {
		return parsed
	}
	first := segments[0]
	switch {
	case strings.HasPrefix(first, "+"):
		hash := strings.TrimPrefix(first, "+")
		if hash == "" || isPhoneNumberLink(hash) {
			return parsed
		}
		parsed.Kind = parsedLinkKindInvite
		parsed.InviteHash = hash
		return parsed
	case strings.EqualFold(first, "joinchat"):
		if len(segments) >= 2 && segments[1] != "" {
			parsed.Kind = parsedLinkKindInvite
			parsed.InviteHash = segments[1]
		}
		return parsed
	case strings.EqualFold(first, "c"):
		if len(segments) < 3 {
			return parsed
		}
		channelID, err := strconv.ParseInt(segments[1], 10, 64)
		post, postErr := strconv.Atoi(segments[2])
		if err == nil && postErr == nil && channelID > 0 && post > 0 {
			parsed.Kind = parsedLinkKindPrivatePost
			parsed.ChannelID = channelID
			parsed.PostID = post
		}
		return parsed
	}
	if isUnsupportedTelegramSection(first) || !isTelegramUsername(first) {
		return parsed
	}
	parsed.Kind = parsedLinkKindPeer
	parsed.Username = first
	parsed.PostID, parsed.ThreadID = parsePostSegments(segments[1:])
	if parsed.PostID == 0 && len(segments) > 1 {
		// /<name>/<appname> is a web app link; not handled by this build.
		parsed = parsedTelegramLink{URL: parsed.URL, Kind: parsedLinkKindUnsupported}
	}
	return parsed
}

func stripPublicPreviewSegment(segments []string) []string {
	if len(segments) > 0 && strings.EqualFold(segments[0], "s") {
		return segments[1:]
	}
	return segments
}

func parsePostSegments(segments []string) (postID, threadID int) {
	switch len(segments) {
	case 0:
		return 0, 0
	case 1:
		if post, err := strconv.Atoi(segments[0]); err == nil && post > 0 {
			return post, 0
		}
		return 0, 0
	default:
		thread, threadErr := strconv.Atoi(segments[0])
		post, postErr := strconv.Atoi(segments[1])
		if threadErr == nil && postErr == nil && thread > 0 && post > 0 {
			return post, thread
		}
		return 0, 0
	}
}

func splitLinkPath(u *url.URL) []string {
	raw := strings.Trim(u.EscapedPath(), "/")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, "/")
	segments := make([]string, 0, len(parts))
	for _, part := range parts {
		decoded, err := url.PathUnescape(part)
		if err != nil {
			decoded = part
		}
		segments = append(segments, decoded)
	}
	return segments
}

// unsupportedTelegramSections are t.me path sections that exist in Telegram but
// are not chat/post links; the UI shows one "not supported" toast instead of
// falling back to the system browser.
var unsupportedTelegramSections = map[string]struct{}{
	"addstickers":  {},
	"addemoji":     {},
	"addlist":      {},
	"addtheme":     {},
	"boost":        {},
	"call":         {},
	"confirmphone": {},
	"contact":      {},
	"giftcode":     {},
	"invoice":      {},
	"login":        {},
	"m":            {},
	"nft":          {},
	"passport":     {},
	"post":         {},
	"proxy":        {},
	"socks":        {},
	"share":        {},
	"setlanguage":  {},
	"addstyle":     {},
}

func isUnsupportedTelegramSection(section string) bool {
	if strings.HasPrefix(section, "$") {
		return true // collectible username / NFT link
	}
	_, ok := unsupportedTelegramSections[strings.ToLower(section)]
	return ok
}

// isTelegramUsername is a permissive syntactic check; the server decides
// whether the username exists.
func isTelegramUsername(value string) bool {
	if len(value) < 1 || len(value) > 64 {
		return false
	}
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '_':
		default:
			return false
		}
	}
	return true
}

// isPhoneNumberLink detects t.me/+<phone> deep links, which must not be treated
// as invites (neither checkChatInvite nor importChatInvite accepts a phone).
func isPhoneNumberLink(value string) bool {
	if len(value) < 5 || len(value) > 16 {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// normalizeInviteHash accepts an invite hash or a full t.me/+hash /
// t.me/joinchat/hash link and returns the bare hash.
func normalizeInviteHash(value string) string {
	hash := strings.TrimSpace(value)
	lower := strings.ToLower(hash)
	for _, prefix := range []string{
		"https://t.me/",
		"http://t.me/",
		"https://telegram.me/",
		"http://telegram.me/",
		"https://telegram.dog/",
		"http://telegram.dog/",
		"t.me/",
		"telegram.me/",
		"telegram.dog/",
		"tg://join?invite=",
		"tg://joinchat?invite=",
		"tg://joinchat/",
		"tg://",
	} {
		if strings.HasPrefix(lower, prefix) {
			hash = hash[len(prefix):]
			break
		}
	}
	hash = strings.TrimPrefix(hash, "joinchat/")
	hash = strings.TrimPrefix(hash, "+")
	if index := strings.IndexAny(hash, "?#/ "); index >= 0 {
		hash = hash[:index]
	}
	if hash == "" || isPhoneNumberLink(hash) {
		return ""
	}
	return hash
}

// --------------------------------------------------------------- resolver

// ResolveTelegramLink classifies and resolves one Telegram link. Public
// usernames (posts included) are resolved with contacts.resolveUsername, private
// post links through the live peer index (there is no access hash in the link),
// invite links through messages.checkChatInvite and tg://user?id through the
// peer index plus users.getUsers. Non-Telegram http(s) URLs and unsupported
// Telegram sections return Kind "unsupported"; the frontend falls back to the
// system browser only when it decides to.
func (s *Service) ResolveTelegramLink(rawURL, proxy, ntp string) (*ResolvedTelegramLinkDTO, error) {
	parsed := classifyTelegramLink(rawURL)
	switch parsed.Kind {
	case parsedLinkKindExternal, parsedLinkKindUnsupported:
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	case parsedLinkKindPeer:
		return s.resolveTelegramUsername(parsed, proxy, ntp)
	case parsedLinkKindInvite:
		return s.resolveTelegramInvite(parsed, proxy, ntp)
	case parsedLinkKindPrivatePost:
		return s.resolveTelegramPrivatePost(parsed, proxy, ntp)
	case parsedLinkKindUserByID:
		return s.resolveTelegramUserByID(parsed, proxy, ntp)
	default:
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}
}

func (s *Service) resolveTelegramUsername(
	parsed parsedTelegramLink,
	proxy, ntp string,
) (*ResolvedTelegramLinkDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	s.noteMediaConfig(proxy, ntp)

	var result *ResolvedTelegramLinkDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		resp, err := client.API().ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{
			Username: parsed.Username,
		})
		if err != nil {
			if tgerr.Is(err, tg.ErrUsernameNotOccupied) || tgerr.Is(err, tg.ErrUsernameInvalid) {
				return fmt.Errorf("no user or chat was found for this username")
			}
			return readableRPCError("resolve username", err)
		}
		chat, ok := s.chatDTOFromPeerEntities(resp.Peer, resp.Users, resp.Chats, proxy, ntp)
		if !ok || chat == nil {
			return fmt.Errorf("no user or chat was found for this username")
		}
		result = &ResolvedTelegramLinkDTO{
			Kind:      TelegramLinkKindChat,
			URL:       parsed.URL,
			Chat:      chat,
			MessageID: parsed.PostID,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) resolveTelegramInvite(
	parsed parsedTelegramLink,
	proxy, ntp string,
) (*ResolvedTelegramLinkDTO, error) {
	hash := normalizeInviteHash(parsed.InviteHash)
	if hash == "" {
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	s.noteMediaConfig(proxy, ntp)

	var result *ResolvedTelegramLinkDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		invite, err := client.API().MessagesCheckChatInvite(ctx, hash)
		if err != nil {
			return readableInviteError(err)
		}
		switch value := invite.(type) {
		case *tg.ChatInviteAlready:
			chat, ok := s.chatDTOFromChatClass(value.Chat, proxy, ntp)
			if !ok {
				return fmt.Errorf("this invite link points to an unavailable chat")
			}
			result = &ResolvedTelegramLinkDTO{
				Kind:          TelegramLinkKindInvite,
				URL:           parsed.URL,
				Chat:          chat,
				InviteHash:    hash,
				InviteTitle:   chat.Title,
				InviteMembers: chat.Members,
				AlreadyMember: true,
			}
			return nil
		case *tg.ChatInvitePeek:
			chat, ok := s.chatDTOFromChatClass(value.Chat, proxy, ntp)
			if !ok {
				return fmt.Errorf("this invite link points to an unavailable chat")
			}
			result = &ResolvedTelegramLinkDTO{
				Kind:          TelegramLinkKindInvite,
				URL:           parsed.URL,
				Chat:          chat,
				InviteHash:    hash,
				InviteTitle:   chat.Title,
				InviteMembers: chat.Members,
				AlreadyMember: true,
			}
			return nil
		case *tg.ChatInvite:
			result = &ResolvedTelegramLinkDTO{
				Kind:          TelegramLinkKindInvite,
				URL:           parsed.URL,
				InviteHash:    hash,
				InviteTitle:   value.Title,
				InviteMembers: value.ParticipantsCount,
			}
			return nil
		default:
			return fmt.Errorf("this invite link is not available")
		}
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) resolveTelegramPrivatePost(
	parsed parsedTelegramLink,
	proxy, ntp string,
) (*ResolvedTelegramLinkDTO, error) {
	opaque := s.lookupPeer("channel", parsed.ChannelID)
	if opaque == "" {
		return nil, fmt.Errorf("this post link points to a private channel you have not joined")
	}
	peer, err := parsePeerID(opaque)
	if err != nil {
		return nil, err
	}
	input, ok := peer.(*tg.InputPeerChannel)
	if !ok {
		return nil, fmt.Errorf("this post link points to an unavailable chat")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	s.noteMediaConfig(proxy, ntp)

	var result *ResolvedTelegramLinkDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		resp, err := client.API().ChannelsGetChannels(ctx, []tg.InputChannelClass{
			&tg.InputChannel{ChannelID: input.ChannelID, AccessHash: input.AccessHash},
		})
		if err != nil {
			return readableRPCError("resolve channel", err)
		}
		for _, raw := range resp.GetChats() {
			channel, ok := raw.(*tg.Channel)
			if !ok || channel.ID != parsed.ChannelID {
				continue
			}
			chat, ok := s.chatDTOFromPeerEntities(
				&tg.PeerChannel{ChannelID: channel.ID},
				nil,
				[]tg.ChatClass{channel},
				proxy,
				ntp,
			)
			if ok && chat != nil {
				result = &ResolvedTelegramLinkDTO{
					Kind:      TelegramLinkKindChat,
					URL:       parsed.URL,
					Chat:      chat,
					MessageID: parsed.PostID,
				}
			}
			break
		}
		if result == nil {
			return fmt.Errorf("this post link points to an unavailable chat")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) resolveTelegramUserByID(
	parsed parsedTelegramLink,
	proxy, ntp string,
) (*ResolvedTelegramLinkDTO, error) {
	opaque := s.lookupPeer("user", parsed.UserID)
	if opaque == "" {
		// Cheap path only: an unknown user id cannot be resolved with a single
		// RPC, so tell the UI to show the unsupported toast.
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}
	peer, err := parsePeerID(opaque)
	if err != nil {
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}
	input, ok := peer.(*tg.InputPeerUser)
	if !ok {
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	s.noteMediaConfig(proxy, ntp)

	var result *ResolvedTelegramLinkDTO
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		users, err := client.API().UsersGetUsers(ctx, []tg.InputUserClass{
			&tg.InputUser{UserID: input.UserID, AccessHash: input.AccessHash},
		})
		if err != nil {
			return readableRPCError("resolve user", err)
		}
		chat, ok := s.chatDTOFromPeerEntities(
			&tg.PeerUser{UserID: input.UserID},
			users,
			nil,
			proxy,
			ntp,
		)
		if ok && chat != nil {
			result = &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindChat, URL: parsed.URL, Chat: chat}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		return &ResolvedTelegramLinkDTO{Kind: TelegramLinkKindUnsupported, URL: parsed.URL}, nil
	}
	return result, nil
}

// JoinByInvite joins a private chat through messages.importChatInvite and
// returns the joined chat, so the UI can open it immediately. A join request
// that needs administrator approval returns a readable error.
func (s *Service) JoinByInvite(hash, proxy, ntp string) (*ChatDTO, error) {
	inviteHash := normalizeInviteHash(hash)
	if inviteHash == "" {
		return nil, fmt.Errorf("this invite link is invalid")
	}

	s.chatMu.Lock()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var joined *ChatDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, importErr := client.API().MessagesImportChatInvite(ctx, inviteHash)
		if importErr != nil && !tgerr.Is(importErr, tg.ErrUserAlreadyParticipant) {
			return readableInviteError(importErr)
		}
		// Re-check the invite: on success it now answers chatInviteAlready with
		// the full chat entity, which is the cheapest way to build the ChatDTO.
		invite, checkErr := client.API().MessagesCheckChatInvite(ctx, inviteHash)
		if checkErr == nil {
			switch value := invite.(type) {
			case *tg.ChatInviteAlready:
				joined, _ = s.chatDTOFromChatClass(value.Chat, proxy, ntp)
			case *tg.ChatInvitePeek:
				joined, _ = s.chatDTOFromChatClass(value.Chat, proxy, ntp)
			}
		}
		if joined == nil {
			return fmt.Errorf("joined the chat but it could not be opened; refresh the chat list")
		}
		return nil
	})
	s.chatMu.Unlock()
	if err != nil {
		return nil, err
	}
	s.invalidateChatCaches(joined.ID)
	return joined, nil
}

// JoinPublicChat joins a public channel/supergroup with channels.joinChannel.
// chatID is the opaque peer id returned by ResolveTelegramLink (it carries the
// access hash, so no username lookup is needed here).
func (s *Service) JoinPublicChat(chatID, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	channel, ok := peer.(*tg.InputPeerChannel)
	if !ok {
		return fmt.Errorf("this chat cannot be joined from a link")
	}
	s.rememberPeer(peer)

	s.chatMu.Lock()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, joinErr := client.API().ChannelsJoinChannel(ctx, &tg.InputChannel{
			ChannelID:  channel.ChannelID,
			AccessHash: channel.AccessHash,
		})
		if joinErr != nil && !tgerr.Is(joinErr, tg.ErrUserAlreadyParticipant) {
			return readableJoinError(joinErr)
		}
		return nil
	})
	s.chatMu.Unlock()
	if err != nil {
		return err
	}
	s.invalidateChatCaches(chatID)
	return nil
}

// GetMessagesAround loads a history page ending at messageID so the UI can jump
// to a t.me post link that is older than the newest page. The page is returned
// oldest-first like GetMessages and is not written to the local snapshot cache.
func (s *Service) GetMessagesAround(
	chatID string,
	messageID, limit int,
	proxy, ntp string,
) ([]MessageDTO, bool, error) {
	if messageID <= 0 {
		return nil, false, fmt.Errorf("invalid message id")
	}
	if limit < 20 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	messages, err := s.getMessages(chatID, messageID+1, 0, proxy, ntp, limit)
	if err != nil {
		return nil, false, err
	}
	for index := range messages {
		if messages[index].ID == messageID {
			return messages, true, nil
		}
	}
	return messages, false, nil
}

// --------------------------------------------------------------- DTO helpers

// chatDTOFromPeerEntities maps a resolved peer (contacts.resolveUsername,
// users.getUsers) into the chat-list shape. It is deliberately the same mapping
// mapDialog uses, so the chat injected by the link router looks identical to a
// dialog row.
func (s *Service) chatDTOFromPeerEntities(
	peer tg.PeerClass,
	users []tg.UserClass,
	chats []tg.ChatClass,
	proxy, ntp string,
) (*ChatDTO, bool) {
	switch value := peer.(type) {
	case *tg.PeerUser:
		user := findUserEntity(users, value.UserID)
		if user == nil {
			return nil, false
		}
		input := &tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash}
		chat := &ChatDTO{
			ID:       encodePeerID("user", user.ID, user.AccessHash),
			Title:    displayName(user.FirstName, user.LastName),
			Kind:     "private",
			Username: user.Username,
			Verified: user.Verified,
			Bot:      user.Bot,
			Contact:  user.Contact || user.MutualContact,
		}
		if chat.Title == "" {
			chat.Title = user.Username
		}
		if chat.Title == "" {
			chat.Title = "Telegram user"
		}
		chat.AvatarURL = s.userAvatarURL(input, user, proxy, ntp)
		s.rememberPeer(input)
		return chat, true
	case *tg.PeerChat:
		entity := findChatEntity(chats, value.ChatID)
		if entity == nil {
			return nil, false
		}
		input := &tg.InputPeerChat{ChatID: entity.ID}
		chat := &ChatDTO{
			ID:      encodePeerID("chat", entity.ID, 0),
			Title:   entity.Title,
			Kind:    "group",
			Members: entity.GetParticipantsCount(),
		}
		chat.AvatarURL = s.chatAvatarURL(input, entity, proxy, ntp)
		s.rememberPeer(input)
		return chat, true
	case *tg.PeerChannel:
		channel := findChannelEntity(chats, value.ChannelID)
		if channel == nil {
			return nil, false
		}
		input := &tg.InputPeerChannel{ChannelID: channel.ID, AccessHash: channel.AccessHash}
		kind := "channel"
		if channel.GetMegagroup() {
			kind = "group"
		}
		chat := &ChatDTO{
			ID:       encodePeerID("channel", channel.ID, channel.AccessHash),
			Title:    channel.Title,
			Kind:     kind,
			Username: channel.Username,
			Verified: channel.Verified,
			Members:  channel.ParticipantsCount,
		}
		chat.AvatarURL = s.channelAvatarURL(input, channel, proxy, ntp)
		s.rememberPeer(input)
		return chat, true
	default:
		return nil, false
	}
}

// chatDTOFromChatClass maps the entity embedded in chatInviteAlready /
// chatInvitePeek into the chat-list shape.
func (s *Service) chatDTOFromChatClass(
	chat tg.ChatClass,
	proxy, ntp string,
) (*ChatDTO, bool) {
	switch value := chat.(type) {
	case *tg.Channel:
		return s.chatDTOFromPeerEntities(
			&tg.PeerChannel{ChannelID: value.ID},
			nil,
			[]tg.ChatClass{value},
			proxy,
			ntp,
		)
	case *tg.Chat:
		return s.chatDTOFromPeerEntities(
			&tg.PeerChat{ChatID: value.ID},
			nil,
			[]tg.ChatClass{value},
			proxy,
			ntp,
		)
	default:
		return nil, false
	}
}

// invalidateChatCaches drops the dialog list and the per-chat profile/info
// caches after a join or leave so the next open reflects the new membership.
func (s *Service) invalidateChatCaches(chatID string) {
	s.invalidateDialogsCache()
	prefix := chatID + "|"
	s.chatProfileCacheMu.Lock()
	for key := range s.chatProfileCache {
		if key == chatID || strings.HasPrefix(key, prefix) {
			delete(s.chatProfileCache, key)
		}
	}
	s.chatProfileCacheMu.Unlock()
	s.chatInfoCacheMu.Lock()
	for key := range s.chatInfoCache {
		if key == chatID || strings.HasPrefix(key, prefix) {
			delete(s.chatInfoCache, key)
		}
	}
	s.chatInfoCacheMu.Unlock()
}

// ------------------------------------------------------------ error mapping

func readableInviteError(err error) error {
	if delay, ok := tgerr.AsFloodWait(err); ok {
		seconds := int(delay.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Errorf("too many attempts, retry in %d seconds", seconds)
	}
	switch {
	case tgerr.Is(err, tg.ErrInviteHashExpired):
		return fmt.Errorf("this invite link has expired")
	case tgerr.Is(err, tg.ErrInviteHashInvalid), tgerr.Is(err, tg.ErrInviteHashEmpty):
		return fmt.Errorf("this invite link is invalid")
	case tgerr.Is(err, tg.ErrInviteRequestSent):
		return fmt.Errorf("join request sent; an administrator must approve it")
	case tgerr.Is(err, tg.ErrUserAlreadyParticipant):
		return nil
	case tgerr.Is(err, tg.ErrChannelsTooMuch), tgerr.Is(err, tg.ErrUserChannelsTooMuch):
		return fmt.Errorf("you have joined too many channels and groups")
	case tgerr.Is(err, tg.ErrChannelPrivate):
		return fmt.Errorf("this chat is not available")
	default:
		return readableRPCError("open invite link", err)
	}
}

func readableJoinError(err error) error {
	if delay, ok := tgerr.AsFloodWait(err); ok {
		seconds := int(delay.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Errorf("too many attempts, retry in %d seconds", seconds)
	}
	switch {
	case tgerr.Is(err, tg.ErrUserAlreadyParticipant):
		return nil
	case tgerr.Is(err, tg.ErrInviteRequestSent):
		return fmt.Errorf("join request sent; an administrator must approve it")
	case tgerr.Is(err, tg.ErrChannelsTooMuch), tgerr.Is(err, tg.ErrUserChannelsTooMuch):
		return fmt.Errorf("you have joined too many channels and groups")
	case tgerr.Is(err, tg.ErrChannelPrivate), tgerr.Is(err, tg.ErrChannelInvalid):
		return fmt.Errorf("this chat is not available")
	case tgerr.Is(err, tg.ErrChatWriteForbidden):
		return fmt.Errorf("you cannot join this chat")
	default:
		return readableRPCError("join chat", err)
	}
}
