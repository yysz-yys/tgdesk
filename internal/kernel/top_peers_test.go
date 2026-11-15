package kernel

import (
	"testing"
	"time"

	"github.com/gotd/td/tg"
)

func testAvatar(url string) func(tg.InputPeerClass) string {
	return func(tg.InputPeerClass) string { return url }
}

func testTopPeerEntities() (
	map[int64]*tg.User,
	map[int64]*tg.Chat,
	map[int64]*tg.Channel,
) {
	users := map[int64]*tg.User{
		1: {
			ID:            1,
			AccessHash:    11,
			FirstName:     "Ada",
			LastName:      "Lovelace",
			Username:      "ada",
			Verified:      true,
			Contact:       true,
			MutualContact: true,
		},
		7: {ID: 7, AccessHash: 77, FirstName: "Me", Self: true},
		8: {ID: 8, AccessHash: 88, FirstName: "CreateBot", Bot: true},
	}
	chats := map[int64]*tg.Chat{
		5: {ID: 5, Title: "Friends", ParticipantsCount: 12},
	}
	channels := map[int64]*tg.Channel{
		100: {
			ID:                100,
			AccessHash:        4242,
			Title:             "News",
			Username:          "news",
			Verified:          true,
			ParticipantsCount: 1000,
		},
		200: {ID: 200, AccessHash: 2424, Title: "Chatters", Megagroup: true},
	}
	return users, chats, channels
}

func TestTopPeerChatDTOUser(t *testing.T) {
	users, chats, channels := testTopPeerEntities()
	dto, ok := topPeerChatDTO(
		&tg.InputPeerUser{UserID: 1, AccessHash: 11},
		7, users, chats, channels, testAvatar("http://127.0.0.1:1/avatar.jpg"),
	)
	if !ok {
		t.Fatal("topPeerChatDTO(user) = not ok")
	}
	if dto.ID != "user:1:11" {
		t.Errorf("ID = %q, want user:1:11", dto.ID)
	}
	if dto.Title != "Ada Lovelace" || dto.Kind != "private" {
		t.Errorf("title/kind = %q/%q, want Ada Lovelace/private", dto.Title, dto.Kind)
	}
	if dto.Username != "ada" || !dto.Verified || !dto.Contact || dto.Bot {
		t.Errorf("user flags = %+v", dto)
	}
	if dto.AvatarURL != "http://127.0.0.1:1/avatar.jpg" {
		t.Errorf("AvatarURL = %q", dto.AvatarURL)
	}
	if dto.ColorIndex != 1 {
		t.Errorf("ColorIndex = %d, want 1", dto.ColorIndex)
	}
	if dto.Members != 0 {
		t.Errorf("Members = %d, want 0", dto.Members)
	}
}

func TestTopPeerChatDTOBotFallsBackToUsername(t *testing.T) {
	users, chats, channels := testTopPeerEntities()
	dto, ok := topPeerChatDTO(
		&tg.InputPeerUser{UserID: 8, AccessHash: 88},
		0, users, chats, channels, nil,
	)
	if !ok {
		t.Fatal("topPeerChatDTO(bot) = not ok")
	}
	// "CreateBot" is a single word: the first-name-only rule is the UI's job,
	// the DTO carries the display name Telegram gives the bot.
	if dto.Title != "CreateBot" || !dto.Bot || dto.Kind != "private" {
		t.Errorf("bot = %+v", dto)
	}
}

func TestTopPeerChatDTOSkipsSelf(t *testing.T) {
	users, chats, channels := testTopPeerEntities()
	if _, ok := topPeerChatDTO(&tg.InputPeerUser{UserID: 7, AccessHash: 77}, 7, users, chats, channels, nil); ok {
		t.Fatal("self user must be skipped")
	}
	// Even without a known self id, the entity's own Self flag is enough.
	if _, ok := topPeerChatDTO(&tg.InputPeerUser{UserID: 7, AccessHash: 77}, 0, users, chats, channels, nil); ok {
		t.Fatal("self-flagged user must be skipped")
	}
}

func TestTopPeerChatDTOChatAndChannels(t *testing.T) {
	users, chats, channels := testTopPeerEntities()

	group, ok := topPeerChatDTO(&tg.InputPeerChat{ChatID: 5}, 0, users, chats, channels, nil)
	if !ok || group.Kind != "group" || group.ID != "chat:5:0" || group.Members != 12 {
		t.Errorf("basic group = %+v, ok = %v", group, ok)
	}

	channel, ok := topPeerChatDTO(
		&tg.InputPeerChannel{ChannelID: 100, AccessHash: 4242},
		0, users, chats, channels, nil,
	)
	if !ok || channel.Kind != "channel" || channel.ID != "channel:100:4242" {
		t.Errorf("channel = %+v, ok = %v", channel, ok)
	}
	if channel.Username != "news" || !channel.Verified || channel.Members != 1000 {
		t.Errorf("channel = %+v", channel)
	}

	megagroup, ok := topPeerChatDTO(
		&tg.InputPeerChannel{ChannelID: 200, AccessHash: 2424},
		0, users, chats, channels, nil,
	)
	if !ok || megagroup.Kind != "group" {
		t.Errorf("megagroup = %+v, ok = %v", megagroup, ok)
	}
}

func TestTopPeerChatDTOMissingEntity(t *testing.T) {
	users, chats, channels := testTopPeerEntities()
	for _, peer := range []tg.InputPeerClass{
		&tg.InputPeerUser{UserID: 404},
		&tg.InputPeerChat{ChatID: 404},
		&tg.InputPeerChannel{ChannelID: 404},
		&tg.InputPeerSelf{},
	} {
		if dto, ok := topPeerChatDTO(peer, 0, users, chats, channels, nil); ok {
			t.Errorf("topPeerChatDTO(%T) = %+v, want not ok", peer, dto)
		}
	}
}

func TestTopPeerInputPeer(t *testing.T) {
	users, chats, channels := testTopPeerEntities()

	input, ok := topPeerInputPeer(&tg.PeerUser{UserID: 1}, users, chats, channels)
	if !ok {
		t.Fatal("PeerUser = not ok")
	}
	if peer, ok := input.(*tg.InputPeerUser); !ok || peer.AccessHash != 11 {
		t.Errorf("PeerUser input = %#v", input)
	}

	input, ok = topPeerInputPeer(&tg.PeerChat{ChatID: 5}, users, chats, channels)
	if !ok {
		t.Fatal("PeerChat = not ok")
	}
	if peer, ok := input.(*tg.InputPeerChat); !ok || peer.ChatID != 5 {
		t.Errorf("PeerChat input = %#v", input)
	}

	input, ok = topPeerInputPeer(&tg.PeerChannel{ChannelID: 100}, users, chats, channels)
	if !ok {
		t.Fatal("PeerChannel = not ok")
	}
	if peer, ok := input.(*tg.InputPeerChannel); !ok || peer.AccessHash != 4242 {
		t.Errorf("PeerChannel input = %#v", input)
	}

	if _, ok := topPeerInputPeer(&tg.PeerUser{UserID: 404}, users, chats, channels); ok {
		t.Error("missing PeerUser must not map")
	}
	if _, ok := topPeerInputPeer(&tg.PeerChat{ChatID: 404}, users, chats, channels); ok {
		t.Error("missing PeerChat must not map")
	}
	if _, ok := topPeerInputPeer(&tg.PeerChannel{ChannelID: 404}, users, chats, channels); ok {
		t.Error("missing PeerChannel must not map")
	}
}

func TestTopPeerEntities(t *testing.T) {
	top := &tg.ContactsTopPeers{
		Users: []tg.UserClass{
			&tg.User{ID: 1, FirstName: "Ada"},
			&tg.UserEmpty{ID: 2},
		},
		Chats: []tg.ChatClass{
			&tg.Chat{ID: 5, Title: "Friends"},
			&tg.Channel{ID: 100, Title: "News"},
			&tg.ChatEmpty{ID: 6},
			&tg.ChannelForbidden{ID: 101, Title: "Forbidden"},
		},
	}
	users, chats, channels := topPeerEntities(top)
	if len(users) != 1 || users[1] == nil {
		t.Errorf("users = %#v", users)
	}
	if len(chats) != 1 || chats[5] == nil {
		t.Errorf("chats = %#v", chats)
	}
	if len(channels) != 1 || channels[100] == nil {
		t.Errorf("channels = %#v", channels)
	}
	if users, chats, channels := topPeerEntities(nil); users != nil || chats != nil || channels != nil {
		t.Error("topPeerEntities(nil) must be nil maps")
	}
}

func TestMapTopPeers(t *testing.T) {
	service := New()
	top := &tg.ContactsTopPeers{
		Categories: []tg.TopPeerCategoryPeers{{
			Category: &tg.TopPeerCategoryCorrespondents{},
			Count:    5,
			Peers: []tg.TopPeer{
				{Peer: &tg.PeerUser{UserID: 1}, Rating: 0.9},
				{Peer: &tg.PeerUser{UserID: 7}},              // self: skipped
				{Peer: &tg.PeerUser{UserID: 404}},            // deleted: skipped
				{Peer: &tg.PeerChat{ChatID: 5}},              // basic group
				{Peer: &tg.PeerChannel{ChannelID: 100}},      // broadcast channel
				{Peer: &tg.PeerUser{UserID: 8}, Rating: 0.1}, // bot
			},
		}},
		Users: []tg.UserClass{
			&tg.User{ID: 1, AccessHash: 11, FirstName: "Ada", LastName: "Lovelace"},
			&tg.User{ID: 7, AccessHash: 77, FirstName: "Me", Self: true},
			&tg.User{ID: 8, AccessHash: 88, FirstName: "CreateBot", Bot: true},
		},
		Chats: []tg.ChatClass{
			&tg.Chat{ID: 5, Title: "Friends"},
			&tg.Channel{ID: 100, AccessHash: 4242, Title: "News"},
		},
	}

	result := service.mapTopPeers(top, 7, 8, nil)
	if len(result) != 4 {
		t.Fatalf("mapTopPeers() length = %d, want 4: %+v", len(result), result)
	}
	for index, want := range []string{"user:1:11", "chat:5:0", "channel:100:4242", "user:8:88"} {
		if result[index].ID != want {
			t.Errorf("mapTopPeers()[%d].ID = %q, want %q", index, result[index].ID, want)
		}
	}
	// The mapped peers are remembered for the message calls the tiles trigger.
	if key := service.lookupPeer("user", 1); key != "user:1:11" {
		t.Errorf("peer index user:1 = %q", key)
	}
	// The cap holds and the order is the server ranking.
	if limited := service.mapTopPeers(top, 7, 2, nil); len(limited) != 2 || limited[1].ID != "chat:5:0" {
		t.Errorf("mapTopPeers(limit=2) = %+v", limited)
	}
	if empty := service.mapTopPeers(nil, 7, 8, nil); empty != nil {
		t.Errorf("mapTopPeers(nil) = %+v, want nil", empty)
	}
	if empty := service.mapTopPeers(top, 7, 0, nil); empty != nil {
		t.Errorf("mapTopPeers(limit=0) = %+v, want nil", empty)
	}

	// A resolver is asked once per accepted peer, before the self/deleted drop.
	var resolved int
	service.mapTopPeers(top, 7, 8, func(tg.InputPeerClass, map[int64]*tg.User, map[int64]*tg.Chat, map[int64]*tg.Channel) string {
		resolved++
		return "avatar"
	})
	if resolved != 4 {
		t.Errorf("avatar resolver calls = %d, want 4", resolved)
	}
}

func TestNormalizeTopPeersLimit(t *testing.T) {
	cases := map[int]int{
		0:   topPeersDefaultLimit,
		-1:  topPeersDefaultLimit,
		8:   8,
		30:  topPeersRequestLimit,
		100: topPeersRequestLimit,
	}
	for limit, want := range cases {
		if got := normalizeTopPeersLimit(limit); got != want {
			t.Errorf("normalizeTopPeersLimit(%d) = %d, want %d", limit, got, want)
		}
	}
}

func TestTopPeersCache(t *testing.T) {
	reset := func() {
		topPeersCacheMu.Lock()
		topPeersCache = nil
		topPeersCacheMu.Unlock()
	}
	reset()
	t.Cleanup(reset)

	if entry := cachedTopPeers(1); entry != nil {
		t.Fatalf("empty cache = %+v, want nil", entry)
	}

	peers := []ChatDTO{{ID: "user:1:11", Title: "Ada"}}
	storeTopPeers(1, peers)
	// The stored slice is a copy: mutating the caller's slice must not leak in.
	peers[0].Title = "mutated"

	entry := cachedTopPeers(1)
	if entry == nil || len(entry.peers) != 1 || entry.peers[0].Title != "Ada" {
		t.Fatalf("cachedTopPeers = %+v", entry)
	}
	if entry := cachedTopPeers(2); entry != nil {
		t.Errorf("cachedTopPeers(other account) = %+v, want nil", entry)
	}

	// A stale entry is still served by the stale path but no longer counts as
	// fresh (GetTopPeers decides between refetch and serving it on error).
	topPeersCacheMu.Lock()
	topPeersCache.fetchedAt = time.Now().Add(-(topPeersCacheTTL + time.Hour))
	topPeersCacheMu.Unlock()
	if entry := cachedTopPeers(1); entry == nil {
		t.Error("cachedTopPeers must still return the stale entry")
	} else if time.Since(entry.fetchedAt) < topPeersCacheTTL {
		t.Error("stale entry must be older than the TTL")
	}
}

func TestTrimTopPeers(t *testing.T) {
	peers := []ChatDTO{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	if got := trimTopPeers(peers, 2); len(got) != 2 || got[1].ID != "b" {
		t.Errorf("trimTopPeers(2) = %+v", got)
	}
	if got := trimTopPeers(peers, 0); len(got) != 0 {
		t.Errorf("trimTopPeers(0) = %+v", got)
	}
	if got := trimTopPeers(nil, 8); got == nil || len(got) != 0 {
		t.Errorf("trimTopPeers(nil) = %+v, want empty non-nil slice", got)
	}
	got := trimTopPeers(peers, 8)
	got[0].ID = "mutated"
	if peers[0].ID != "a" {
		t.Error("trimTopPeers must return a copy")
	}
}
