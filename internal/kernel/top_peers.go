package kernel

import (
	"context"
	"sync"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// Top peers — the Popular list of the third empty-chat tip card ("Chats").
// Telegram Web K asks contacts.getTopPeers for the "correspondents" category
// once a day, caches the ranking in account state and shows its first 8 rows;
// an empty (or disabled) ranking removes the Popular filter from the card
// entirely, which is the state the reference screenshot is in.
const (
	// topPeersRequestLimit is Web K's limit for the call (chatsCard asks the
	// manager for the whole cached ranking; the manager requests 30).
	topPeersRequestLimit = 30
	// topPeersDefaultLimit is the number of tiles on the card's 4×2 grid.
	topPeersDefaultLimit = 8
	// topPeersCacheTTL mirrors Web K's account-state cache period
	// (`cachedTime + 86400e3` in appUsersManager).
	topPeersCacheTTL = 24 * time.Hour
)

// topPeersCacheEntry mirrors Web K's account-state topPeersCache.correspondents:
// the ranking Telegram returned for one account and when it was fetched. The
// process serves a single account at a time, so the account id in the entry is
// what keeps a login switch from showing the previous account's ranking.
type topPeersCacheEntry struct {
	accountID int64
	peers     []ChatDTO
	fetchedAt time.Time
}

var (
	topPeersCacheMu sync.Mutex
	topPeersCache   *topPeersCacheEntry
)

// GetTopPeers returns up to limit most-used correspondents for the Chats tip
// card (contacts.getTopPeers{correspondents:true}, the same call Web K makes).
// The order is the server ranking. contacts.topPeersDisabled and
// contacts.topPeersNotModified yield an empty list rather than an error, since
// the card then simply hides its Popular filter. The ranking is cached for 24h
// per process like Web K caches it in account state; a failed refresh keeps
// serving the stale snapshot, and only a first fetch that fails returns the
// error (the card drops Popular on any error).
func (s *Service) GetTopPeers(proxy, ntp string, limit int) ([]ChatDTO, error) {
	limit = normalizeTopPeersLimit(limit)
	accountID := s.selfUserID()
	if entry := cachedTopPeers(accountID); entry != nil && time.Since(entry.fetchedAt) < topPeersCacheTTL {
		return trimTopPeers(entry.peers, limit), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	var result []ChatDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().ContactsGetTopPeers(ctx, &tg.ContactsGetTopPeersRequest{
			Correspondents: true,
			Offset:         0,
			Limit:          topPeersRequestLimit,
			// A zero hash asks the server for the full ranking; the cache is
			// in-process, so there is never a hash to validate against.
			Hash: 0,
		})
		if err != nil {
			return readableRPCError("load top peers", err)
		}
		// contacts.topPeersDisabled / contacts.topPeersNotModified are not an
		// error: they mean "no ranking", which is exactly an empty result.
		top, ok := response.(*tg.ContactsTopPeers)
		if !ok || top == nil || len(top.Categories) == 0 {
			result = nil
			return nil
		}
		result = s.mapTopPeers(top, accountID, topPeersRequestLimit, func(
			input tg.InputPeerClass,
			users map[int64]*tg.User,
			chats map[int64]*tg.Chat,
			channels map[int64]*tg.Channel,
		) string {
			return s.peerAvatarURL(input, users, chats, channels, proxy, ntp)
		})
		return nil
	})
	if err != nil {
		// A FLOOD_WAIT or a dropped connection should cost the card its Popular
		// list, not the whole card: serve the last ranking when there is one.
		if stale := cachedTopPeers(accountID); stale != nil {
			return trimTopPeers(stale.peers, limit), nil
		}
		return nil, err
	}
	storeTopPeers(accountID, result)
	return trimTopPeers(result, limit), nil
}

// mapTopPeers maps a contacts.topPeers answer onto the chat-list DTOs the card
// renders. Peers the answer's entities do not carry are dropped (deleted
// peers), the logged-in account is skipped (Web K would show Saved Messages,
// the card's three lists never do), and the result is capped at limit. Each
// mapped peer is remembered in the peer index so its opaque id can be passed
// straight back to GetMessages. avatar (optional — it needs the loopback media
// server) resolves a peer photo; tests pass nil.
func (s *Service) mapTopPeers(
	top *tg.ContactsTopPeers,
	selfID int64,
	limit int,
	avatar func(tg.InputPeerClass, map[int64]*tg.User, map[int64]*tg.Chat, map[int64]*tg.Channel) string,
) []ChatDTO {
	if top == nil || len(top.Categories) == 0 || limit <= 0 {
		return nil
	}
	users, chats, channels := topPeerEntities(top)
	result := make([]ChatDTO, 0, limit)
	for _, peer := range top.Categories[0].Peers {
		if len(result) >= limit {
			break
		}
		input, ok := topPeerInputPeer(peer.Peer, users, chats, channels)
		if !ok {
			continue
		}
		dto, ok := topPeerChatDTO(input, selfID, users, chats, channels, func(
			input tg.InputPeerClass,
		) string {
			if avatar == nil {
				return ""
			}
			return avatar(input, users, chats, channels)
		})
		if !ok {
			continue
		}
		s.rememberPeer(input)
		result = append(result, dto)
	}
	return result
}

// topPeerEntities indexes the users/chats/channels attached to a top-peers
// answer by their raw ids. Only full constructors are kept; the min/empty/
// forbidden variants Telegram may attach carry no title or photo to map.
func topPeerEntities(
	top *tg.ContactsTopPeers,
) (map[int64]*tg.User, map[int64]*tg.Chat, map[int64]*tg.Channel) {
	if top == nil {
		return nil, nil, nil
	}
	users := make(map[int64]*tg.User, len(top.Users))
	for _, raw := range top.Users {
		if user, ok := raw.(*tg.User); ok && user != nil {
			users[user.ID] = user
		}
	}
	chats := make(map[int64]*tg.Chat, len(top.Chats))
	channels := make(map[int64]*tg.Channel, len(top.Chats))
	for _, raw := range top.Chats {
		switch chat := raw.(type) {
		case *tg.Chat:
			if chat != nil {
				chats[chat.ID] = chat
			}
		case *tg.Channel:
			if chat != nil {
				channels[chat.ID] = chat
			}
		}
	}
	return users, chats, channels
}

// topPeerInputPeer turns a top-peer category entry into the input peer the
// media/message calls take, using the access hash from the answer's entities.
// Peers without an entity are unusable (deleted peers) and report false.
func topPeerInputPeer(
	peer tg.PeerClass,
	users map[int64]*tg.User,
	chats map[int64]*tg.Chat,
	channels map[int64]*tg.Channel,
) (tg.InputPeerClass, bool) {
	switch p := peer.(type) {
	case *tg.PeerUser:
		user, ok := users[p.UserID]
		if !ok || user == nil {
			return nil, false
		}
		return &tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash}, true
	case *tg.PeerChat:
		chat, ok := chats[p.ChatID]
		if !ok || chat == nil {
			return nil, false
		}
		return &tg.InputPeerChat{ChatID: chat.ID}, true
	case *tg.PeerChannel:
		channel, ok := channels[p.ChannelID]
		if !ok || channel == nil {
			return nil, false
		}
		return &tg.InputPeerChannel{
			ChannelID:  channel.ID,
			AccessHash: channel.AccessHash,
		}, true
	default:
		return nil, false
	}
}

// topPeerChatDTO maps one top peer onto the chat-list DTO shape the card's
// tiles render, exactly like mapDialog does for the dialog list: the opaque
// peer id (kind:rawID:accessHash), the display title, the peer kind and the
// Web K avatar colour index. avatar (optional — it needs the loopback media
// server) is only asked for a peer that maps, so a skipped self/deleted peer
// never registers an image; tests pass a plain function or nil.
func topPeerChatDTO(
	peer tg.InputPeerClass,
	selfID int64,
	users map[int64]*tg.User,
	chats map[int64]*tg.Chat,
	channels map[int64]*tg.Channel,
	avatar func(tg.InputPeerClass) string,
) (ChatDTO, bool) {
	var (
		title    string
		username string
		kind     string
		verified bool
		bot      bool
		contact  bool
		members  int
		id       string
		online   bool
		lastSeen int64
		status   string
	)
	switch p := peer.(type) {
	case *tg.InputPeerUser:
		user := users[p.UserID]
		if user == nil || user.Self || (selfID != 0 && user.ID == selfID) {
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
		online, lastSeen, status = userPresence(user, selfID)
	case *tg.InputPeerChat:
		chat := chats[p.ChatID]
		if chat == nil {
			return ChatDTO{}, false
		}
		title = chat.Title
		kind = "group"
		members = chat.ParticipantsCount
		id = encodePeerID("chat", p.ChatID, 0)
	case *tg.InputPeerChannel:
		channel := channels[p.ChannelID]
		if channel == nil {
			return ChatDTO{}, false
		}
		title = channel.Title
		username = channel.Username
		verified = channel.Verified
		members = channel.ParticipantsCount
		kind = "channel"
		if channel.Megagroup {
			kind = "group"
		}
		id = encodePeerID("channel", p.ChannelID, p.AccessHash)
	default:
		return ChatDTO{}, false
	}
	avatarURL := ""
	if avatar != nil {
		avatarURL = avatar(peer)
	}
	return ChatDTO{
		ID:         id,
		Title:      title,
		Kind:       kind,
		Username:   username,
		AvatarURL:  avatarURL,
		Verified:   verified,
		Bot:        bot,
		Contact:    contact,
		Members:    members,
		Online:     online,
		LastSeen:   lastSeen,
		Status:     status,
		ColorIndex: topPeerColorIndex(peer),
	}, true
}

// topPeerColorIndex is Web K's avatar gradient index (abs(peer id) % 7),
// matching mapDialog.
func topPeerColorIndex(peer tg.InputPeerClass) int {
	switch p := peer.(type) {
	case *tg.InputPeerUser:
		return int(absInt64(p.UserID) % 7)
	case *tg.InputPeerChat:
		return int(absInt64(p.ChatID) % 7)
	case *tg.InputPeerChannel:
		return int(absInt64(p.ChannelID) % 7)
	default:
		return 0
	}
}

// normalizeTopPeersLimit defaults to the grid's 8 tiles and caps the request at
// what the server ranking holds (Web K asks for 30).
func normalizeTopPeersLimit(limit int) int {
	if limit <= 0 {
		return topPeersDefaultLimit
	}
	if limit > topPeersRequestLimit {
		return topPeersRequestLimit
	}
	return limit
}

// trimTopPeers returns a copy of peers capped at limit, so callers cannot
// mutate the cached ranking and an empty result is an empty slice, not nil.
func trimTopPeers(peers []ChatDTO, limit int) []ChatDTO {
	count := len(peers)
	if limit <= 0 {
		count = 0
	} else if limit < count {
		count = limit
	}
	result := make([]ChatDTO, count)
	copy(result, peers)
	return result
}

// cachedTopPeers returns the cached ranking for accountID (fresh or stale), or
// nil when there is none or it belongs to another account.
func cachedTopPeers(accountID int64) *topPeersCacheEntry {
	topPeersCacheMu.Lock()
	defer topPeersCacheMu.Unlock()
	if topPeersCache == nil || topPeersCache.accountID != accountID {
		return nil
	}
	return topPeersCache
}

// storeTopPeers replaces the in-process ranking cache.
func storeTopPeers(accountID int64, peers []ChatDTO) {
	stored := make([]ChatDTO, len(peers))
	copy(stored, peers)
	topPeersCacheMu.Lock()
	topPeersCache = &topPeersCacheEntry{
		accountID: accountID,
		peers:     stored,
		fetchedAt: time.Now(),
	}
	topPeersCacheMu.Unlock()
}
