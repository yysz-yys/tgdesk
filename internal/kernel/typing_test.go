package kernel

import (
	"context"
	"testing"

	"github.com/gotd/td/tg"
)

func TestTypingActionName(t *testing.T) {
	cases := []struct {
		action tg.SendMessageActionClass
		want   string
	}{
		{&tg.SendMessageTypingAction{}, "typing"},
		{&tg.SendMessageCancelAction{}, "cancel"},
		{&tg.SendMessageUploadPhotoAction{}, "upload_photo"},
		{&tg.SendMessageUploadDocumentAction{}, "upload_document"},
		{&tg.SendMessageUploadAudioAction{}, "upload_document"},
		{&tg.SendMessageUploadVideoAction{}, "upload_video"},
		{&tg.SendMessageUploadRoundAction{}, "upload_video"},
		{&tg.SendMessageRecordAudioAction{}, "record_voice"},
		{&tg.SendMessageRecordVideoAction{}, "record_video"},
		{&tg.SendMessageRecordRoundAction{}, "record_video"},
		{&tg.SendMessageChooseStickerAction{}, "choose_sticker"},
		{&tg.SendMessageChooseContactAction{}, "typing"},
		{&tg.SendMessageGeoLocationAction{}, "typing"},
		{&tg.SendMessageGamePlayAction{}, "typing"},
		{nil, ""},
	}
	for _, c := range cases {
		if got := typingActionName(c.action); got != c.want {
			t.Errorf("typingActionName(%T) = %q, want %q", c.action, got, c.want)
		}
	}
}

func TestTypingActionClassRoundTrip(t *testing.T) {
	for _, name := range []string{
		"typing",
		"cancel",
		"upload_photo",
		"upload_document",
		"upload_video",
		"record_voice",
		"record_video",
		"choose_sticker",
	} {
		class := typingActionClass(name)
		if class == nil {
			t.Fatalf("typingActionClass(%q) = nil", name)
		}
		if got := typingActionName(class); got != name {
			t.Errorf("round trip %q -> %T -> %q", name, class, got)
		}
	}
	if got := typingActionName(typingActionClass("")); got != "typing" {
		t.Errorf("empty action maps to %q, want typing", got)
	}
	if class := typingActionClass("bogus"); class != nil {
		t.Errorf("typingActionClass(bogus) = %T, want nil", class)
	}
}

func TestTypingPeerSenderResolvesNames(t *testing.T) {
	entities := tg.Entities{
		Users: map[int64]*tg.User{
			42: {ID: 42, AccessHash: 4242, FirstName: "Alice", LastName: "Smith"},
			43: {ID: 43, AccessHash: 4343, FirstName: "Botty", Bot: true},
			44: {ID: 44, AccessHash: 4444, Username: "nameless"},
		},
		Chats: map[int64]*tg.Chat{
			7: {ID: 7, Title: "Basic Group"},
		},
		Channels: map[int64]*tg.Channel{
			99: {ID: 99, AccessHash: 9900, Title: "Team"},
		},
	}

	userID, name, bot := typingPeerSender(&tg.PeerUser{UserID: 42}, entities)
	if userID != 42 || name != "Alice Smith" || bot {
		t.Fatalf("user sender = (%d, %q, %v)", userID, name, bot)
	}
	if _, _, bot := typingPeerSender(&tg.PeerUser{UserID: 43}, entities); !bot {
		t.Fatal("known bot not flagged")
	}
	if _, name, _ := typingPeerSender(&tg.PeerUser{UserID: 44}, entities); name != "nameless" {
		t.Fatalf("username fallback = %q", name)
	}
	if userID, name, _ := typingPeerSender(&tg.PeerChat{ChatID: 7}, entities); userID != 0 || name != "Basic Group" {
		t.Fatalf("anonymous chat admin = (%d, %q)", userID, name)
	}
	if userID, name, _ := typingPeerSender(&tg.PeerChannel{ChannelID: 99}, entities); userID != 0 || name != "Team" {
		t.Fatalf("anonymous channel admin = (%d, %q)", userID, name)
	}
	if userID, name, bot := typingPeerSender(nil, entities); userID != 0 || name != "" || bot {
		t.Fatalf("nil sender = (%d, %q, %v)", userID, name, bot)
	}
}

func typingEventSink(t *testing.T, s *Service) chan ChatEvent {
	t.Helper()
	events := make(chan ChatEvent, 8)
	s.SetChatEventSink(func(event ChatEvent) { events <- event })
	return events
}

func TestLiveUserTypingEmitsEvent(t *testing.T) {
	s := New()
	events := typingEventSink(t, s)
	handler := newLiveUpdateHandler(s, "", "")

	entities := tg.Entities{Users: map[int64]*tg.User{
		42: {ID: 42, AccessHash: 4242, FirstName: "Alice"},
	}}
	err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdateUserTyping{UserID: 42, Action: &tg.SendMessageTypingAction{}},
		},
		Users: []tg.UserClass{entities.Users[42]},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.Kind != "typing" {
		t.Fatalf("kind = %q", event.Kind)
	}
	if event.ChatID != "user:42:4242" {
		t.Fatalf("chat id = %q", event.ChatID)
	}
	if event.TypingAction != "typing" || event.TypingName != "Alice" || event.TypingUserID != 42 {
		t.Fatalf("unexpected typing event %#v", event)
	}
	if event.ThreadID != 0 {
		t.Fatalf("thread id = %d", event.ThreadID)
	}
}

func TestLiveTypingSkipsSelfAndBots(t *testing.T) {
	s := New()
	s.authUser = &AuthUser{ID: 7}
	events := typingEventSink(t, s)
	handler := newLiveUpdateHandler(s, "", "")

	users := []tg.UserClass{
		&tg.User{ID: 7, AccessHash: 70, FirstName: "Me"},
		&tg.User{ID: 8, AccessHash: 80, FirstName: "Botty", Bot: true},
	}
	if err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdateUserTyping{UserID: 7, Action: &tg.SendMessageTypingAction{}},
			&tg.UpdateUserTyping{UserID: 8, Action: &tg.SendMessageTypingAction{}},
		},
		Users: users,
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		t.Fatalf("unexpected event for self/bot: %#v", event)
	default:
	}
}

func TestLiveChannelUserTypingResolvesThread(t *testing.T) {
	s := New()
	events := typingEventSink(t, s)
	handler := newLiveUpdateHandler(s, "", "")

	update := &tg.UpdateChannelUserTyping{
		ChannelID: 99,
		FromID:    &tg.PeerUser{UserID: 42},
		Action:    &tg.SendMessageTypingAction{},
	}
	update.SetTopMsgID(55)
	err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{update},
		Users:   []tg.UserClass{&tg.User{ID: 42, AccessHash: 4242, FirstName: "Alice"}},
		Chats:   []tg.ChatClass{&tg.Channel{ID: 99, AccessHash: 9900, Title: "Team", Megagroup: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.Kind != "typing" || event.ChatID != "channel:99:9900" {
		t.Fatalf("unexpected event %#v", event)
	}
	if event.TypingName != "Alice" || event.TypingUserID != 42 || event.ThreadID != 55 {
		t.Fatalf("unexpected typing fields %#v", event)
	}
}

func TestLiveTypingForwardsCancelAndSkipsBroadcastChannel(t *testing.T) {
	s := New()
	events := typingEventSink(t, s)
	handler := newLiveUpdateHandler(s, "", "")

	// A basic-group cancel keeps the cancel action so the UI clears the row.
	if err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdateChatUserTyping{
				ChatID: 7,
				FromID: &tg.PeerUser{UserID: 42},
				Action: &tg.SendMessageCancelAction{},
			},
		},
		Chats: []tg.ChatClass{&tg.Chat{ID: 7, Title: "Group"}},
	}); err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.TypingAction != "cancel" || event.ChatID != "chat:7:0" {
		t.Fatalf("unexpected cancel event %#v", event)
	}

	// Broadcast channels never show typing (a known broadcast channel is skipped).
	if err := handler.Handle(context.Background(), &tg.Updates{
		Updates: []tg.UpdateClass{
			&tg.UpdateChannelUserTyping{
				ChannelID: 100,
				FromID:    &tg.PeerUser{UserID: 42},
				Action:    &tg.SendMessageTypingAction{},
			},
		},
		Chats: []tg.ChatClass{&tg.Channel{ID: 100, AccessHash: 10000, Title: "News", Broadcast: true}},
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		t.Fatalf("unexpected event for broadcast channel: %#v", event)
	default:
	}
}

func TestSendTypingRejectsUnsupportedActionWithoutNetwork(t *testing.T) {
	s := New()
	if err := s.SendTyping("user:42:4242", "bogus", "", ""); err == nil {
		t.Fatal("expected an error for an unsupported action")
	}
}

func TestSendTypingToSelfIsNoOp(t *testing.T) {
	s := New()
	s.authUser = &AuthUser{ID: 42}
	// Would fail in ensureSession if it tried to reach the network at all.
	if err := s.SendTyping("user:42:4242", "typing", "", ""); err != nil {
		t.Fatalf("typing to self = %v, want nil", err)
	}
}
