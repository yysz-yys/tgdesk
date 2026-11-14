package kernel

import (
	"context"
	"reflect"
	"testing"

	"github.com/gotd/td/tg"
)

// Round-3 parity helpers that do not need a Telegram client: presence mapping,
// saved-dialog row mapping/preview joins, and saved star gift mapping.

func TestMapUserPresence(t *testing.T) {
	cases := []struct {
		name     string
		status   tg.UserStatusClass
		online   bool
		lastSeen int64
		kind     string
	}{
		{"online", &tg.UserStatusOnline{Expires: 1700000100}, true, 0, PresenceOnline},
		{"offline", &tg.UserStatusOffline{WasOnline: 1699990000}, false, 1699990000, PresenceOffline},
		{"recently", &tg.UserStatusRecently{}, false, 0, PresenceRecently},
		{"last week", &tg.UserStatusLastWeek{}, false, 0, PresenceLastWeek},
		{"last month", &tg.UserStatusLastMonth{}, false, 0, PresenceLastMonth},
		{"empty", &tg.UserStatusEmpty{}, false, 0, PresenceHidden},
		{"missing", nil, false, 0, PresenceHidden},
	}
	for _, test := range cases {
		online, lastSeen, kind := mapUserPresence(test.status)
		if online != test.online || lastSeen != test.lastSeen || kind != test.kind {
			t.Fatalf("%s: got (%v,%d,%q), want (%v,%d,%q)",
				test.name, online, lastSeen, kind, test.online, test.lastSeen, test.kind)
		}
	}
}

func TestUserPresenceSkipsBotsAndSelf(t *testing.T) {
	online := &tg.UserStatusOnline{}

	bot := &tg.User{ID: 5, Bot: true}
	bot.SetStatus(online)
	if online, lastSeen, status := userPresence(bot, 0); online || lastSeen != 0 || status != "" {
		t.Fatalf("bot presence = (%v,%d,%q), want zero", online, lastSeen, status)
	}

	self := &tg.User{ID: 6}
	self.SetStatus(online)
	if _, _, status := userPresence(self, 6); status != "" {
		t.Fatalf("self presence = %q, want empty", status)
	}

	human := &tg.User{ID: 7}
	human.SetStatus(&tg.UserStatusLastWeek{})
	if online, lastSeen, status := userPresence(human, 0); online || lastSeen != 0 || status != PresenceLastWeek {
		t.Fatalf("human presence = (%v,%d,%q)", online, lastSeen, status)
	}
}

func TestMapUserProfilePresence(t *testing.T) {
	full := tg.UserFull{}

	recent := &tg.User{ID: 21}
	recent.SetStatus(&tg.UserStatusRecently{})
	profile := mapUserProfile(full, recent, false)
	if profile.Online || profile.Status != PresenceRecently || profile.LastSeen != 0 {
		t.Fatalf("user profile presence = %+v", profile)
	}

	onlineUser := &tg.User{ID: 22}
	onlineUser.SetStatus(&tg.UserStatusOnline{})
	onlineProfile := mapUserProfile(full, onlineUser, false)
	if !onlineProfile.Online || onlineProfile.Status != PresenceOnline {
		t.Fatalf("online profile presence = %+v", onlineProfile)
	}

	// Saved Messages is never "online", even though the self user entity has a
	// status set; bots have no presence row on Telegram Web either.
	if saved := mapUserProfile(full, onlineUser, true); saved.Status != "" || saved.Online {
		t.Fatalf("saved profile presence = %+v", saved)
	}
	bot := &tg.User{ID: 23, Bot: true}
	bot.SetStatus(&tg.UserStatusOnline{})
	if botProfile := mapUserProfile(full, bot, false); botProfile.Status != "" || botProfile.Online {
		t.Fatalf("bot profile presence = %+v", botProfile)
	}
}

func TestSavedMessagePreviewsKeyByPeer(t *testing.T) {
	messages := []tg.MessageClass{
		&tg.Message{ID: 5, PeerID: &tg.PeerUser{UserID: 1}, Message: "first", Date: 1700000001},
		&tg.Message{ID: 5, PeerID: &tg.PeerChannel{ChannelID: 2}, Message: "second", Date: 1700000002},
	}
	previews := savedMessagePreviews(messages)
	if got, ok := lookupSavedPreview(previews, &tg.PeerUser{UserID: 1}, 5); !ok || got.preview != "first" {
		t.Fatalf("user preview = %+v ok=%v", got, ok)
	}
	if got, ok := lookupSavedPreview(previews, &tg.PeerChannel{ChannelID: 2}, 5); !ok || got.preview != "second" || got.date != 1700000002 {
		t.Fatalf("channel preview = %+v ok=%v", got, ok)
	}
	if _, ok := lookupSavedPreview(previews, &tg.PeerUser{UserID: 3}, 5); ok {
		t.Fatalf("unknown peer matched a preview")
	}
}

func TestMergeSavedChatsPinnedFirstAndDedup(t *testing.T) {
	pinned := []ChatDTO{
		{ID: "user:1:1", Title: "Pinned", Pinned: true},
	}
	saved := []ChatDTO{
		{ID: "user:2:2", Title: "Second"},
		{ID: "user:1:1", Title: "Pinned duplicate"},
	}
	got := mergeSavedChats(pinned, saved)
	want := []ChatDTO{
		{ID: "user:1:1", Title: "Pinned", Pinned: true},
		{ID: "user:2:2", Title: "Second"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("mergeSavedChats = %+v, want %+v", got, want)
	}
	if got := mergeSavedChats(nil, nil); got != nil {
		t.Fatalf("empty merge = %+v, want nil", got)
	}
}

func TestSavedDialogsCount(t *testing.T) {
	slice := &tg.MessagesSavedDialogsSlice{Count: 3}
	if got := savedDialogsCount(slice); got != 3 {
		t.Fatalf("slice count = %d", got)
	}
	full := &tg.MessagesSavedDialogs{Dialogs: []tg.SavedDialogClass{
		&tg.SavedDialog{},
		&tg.SavedDialog{},
	}}
	if got := savedDialogsCount(full); got != 2 {
		t.Fatalf("full count = %d", got)
	}
	notModified := &tg.MessagesSavedDialogsNotModified{Count: 9}
	if got := savedDialogsCount(notModified); got != 9 {
		t.Fatalf("not-modified count = %d", got)
	}
	if got := savedDialogsCount(nil); got != 0 {
		t.Fatalf("nil count = %d", got)
	}
}

func TestMapSavedDialogsFromResponse(t *testing.T) {
	service := New()

	user := &tg.User{ID: 7, AccessHash: 70, FirstName: "Ana"}
	user.SetStatus(&tg.UserStatusOffline{WasOnline: 1700000000})

	dialog := &tg.SavedDialog{
		Peer:       &tg.PeerUser{UserID: 7},
		TopMessage: 100,
	}
	dialog.SetPinned(true)
	last := &tg.Message{
		ID:      100,
		PeerID:  &tg.PeerUser{UserID: 7},
		Message: "saved note",
		Date:    1700000500,
	}
	response := &tg.MessagesSavedDialogsSlice{
		Count:    1,
		Dialogs:  []tg.SavedDialogClass{dialog},
		Messages: []tg.MessageClass{last},
		Users:    []tg.UserClass{user},
	}

	chats := service.mapSavedDialogsFromResponse(response, "", "")
	if len(chats) != 1 {
		t.Fatalf("mapped chats = %+v", chats)
	}
	chat := chats[0]
	if chat.ID != "user:7:70" || chat.Title != "Ana" || !chat.Pinned {
		t.Fatalf("unexpected chat row %+v", chat)
	}
	if chat.Preview != "saved note" || chat.LastMessageDate != 1700000500 {
		t.Fatalf("preview not mapped: %+v", chat)
	}
	if chat.Status != PresenceOffline || chat.LastSeen != 1700000000 {
		t.Fatalf("presence not mapped: %+v", chat)
	}
}

func TestMapSavedStarGift(t *testing.T) {
	senders := map[int64]string{7: "Bob"}

	template := &tg.StarGift{ID: 111, Stars: 50, SoldOut: true}
	template.SetTitle("Teddy")
	regular := tg.SavedStarGift{Date: 1700000000, Gift: template}
	regular.SetSavedID(9001)
	regular.SetGiftNum(3)
	regular.SetFromID(&tg.PeerUser{UserID: 7})

	item := mapSavedStarGift(regular, senders)
	if item.ID != "9001" || item.Title != "Teddy" || item.From != "Bob" {
		t.Fatalf("regular gift = %+v", item)
	}
	if item.Date != 1700000000 || item.Stars != 50 || item.Count != 3 {
		t.Fatalf("regular gift numbers = %+v", item)
	}
	if !item.SoldOut || item.Unique || item.ThumbURL != "" {
		t.Fatalf("regular gift flags = %+v", item)
	}

	hidden := tg.SavedStarGift{Date: 1700000001, Gift: &tg.StarGift{ID: 112}}
	hidden.SetNameHidden(true)
	hidden.SetFromID(&tg.PeerUser{UserID: 7})
	if got := mapSavedStarGift(hidden, senders); got.From != "" || got.ID != "112" || got.Count != 1 {
		t.Fatalf("hidden-sender gift = %+v", got)
	}

	unique := &tg.StarGiftUnique{ID: 5, GiftID: 111, Title: "Teddy #5", Num: 5}
	unique.SetValueAmount(1200)
	unique.SetValueCurrency("XTR")
	collectible := tg.SavedStarGift{Date: 1700000002, Gift: unique}
	uniqueItem := mapSavedStarGift(collectible, senders)
	if !uniqueItem.Unique || uniqueItem.ID != "unique:5" || uniqueItem.Title != "Teddy #5" {
		t.Fatalf("unique gift = %+v", uniqueItem)
	}
	if uniqueItem.Stars != 1200 || uniqueItem.Count != 1 {
		t.Fatalf("unique gift numbers = %+v", uniqueItem)
	}
}

func TestLiveUserStatusEmitsPresence(t *testing.T) {
	service := New()
	service.rememberPeer(&tg.InputPeerUser{UserID: 42, AccessHash: 777})
	events := make(chan ChatEvent, 1)
	service.SetChatEventSink(func(event ChatEvent) { events <- event })

	handler := newLiveUpdateHandler(service, "", "")
	err := handler.Handle(context.Background(), &tg.UpdateShort{
		Update: &tg.UpdateUserStatus{
			UserID: 42,
			Status: &tg.UserStatusOffline{WasOnline: 1700000000},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.Kind != "presence" || event.ChatID != "user:42:777" || event.UserID != 42 {
		t.Fatalf("unexpected presence event %#v", event)
	}
	if event.Online || event.LastSeen != 1700000000 || event.Status != PresenceOffline {
		t.Fatalf("unexpected presence payload %#v", event)
	}
}

func TestLivePinnedChannelMessagesEmitsPinned(t *testing.T) {
	service := New()
	events := make(chan ChatEvent, 1)
	service.SetChatEventSink(func(event ChatEvent) { events <- event })

	handler := newLiveUpdateHandler(service, "", "")
	err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdatePinnedChannelMessages{
				ChannelID: 99,
				Messages:  []int{7, 8},
				Pinned:    true,
			},
		},
		Chats: []tg.ChatClass{&tg.Channel{ID: 99, AccessHash: 9900}},
		Date:  1700000000,
	})
	if err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.Kind != "pinned" || event.ChatID != "channel:99:9900" {
		t.Fatalf("unexpected pinned event %#v", event)
	}
	if !reflect.DeepEqual(event.MessageIDs, []int{7, 8}) {
		t.Fatalf("pinned ids = %v", event.MessageIDs)
	}
}
