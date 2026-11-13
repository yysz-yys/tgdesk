package kernel

import (
	"context"
	"testing"

	"github.com/gotd/td/tg"
)

func TestLiveShortMessageUsesPeerIndex(t *testing.T) {
	s := New()
	s.rememberPeer(&tg.InputPeerUser{UserID: 42, AccessHash: 777})
	events := make(chan ChatEvent, 1)
	s.SetChatEventSink(func(event ChatEvent) { events <- event })

	handler := newLiveUpdateHandler(s, "", "")
	err := handler.Handle(context.Background(), &tg.UpdateShortMessage{
		ID:      100,
		UserID:  42,
		Message: "hello",
		Date:    1700000000,
	})
	if err != nil {
		t.Fatal(err)
	}
	event := <-events
	if event.Kind != "message" || event.ChatID != "user:42:777" {
		t.Fatalf("unexpected event %#v", event)
	}
	if event.Message == nil || event.Message.Text != "hello" || event.Message.ID != 100 {
		t.Fatalf("unexpected message %#v", event.Message)
	}
}

func TestMapReactionsKeepsChosenState(t *testing.T) {
	count := tg.ReactionCount{
		Reaction: &tg.ReactionEmoji{Emoticon: "👍"},
		Count:    3,
	}
	count.SetChosenOrder(1)
	reactions := mapReactions(tg.MessageReactions{
		Results: []tg.ReactionCount{count},
	})
	if len(reactions) != 1 {
		t.Fatalf("reaction count = %d", len(reactions))
	}
	if reactions[0].Emoji != "👍" || reactions[0].Count != 3 || !reactions[0].Chosen {
		t.Fatalf("unexpected reaction %#v", reactions[0])
	}
}

func TestMapMessageCarriesGroupAndReactions(t *testing.T) {
	message := &tg.Message{
		ID:      5,
		PeerID:  &tg.PeerUser{UserID: 42},
		Message: "album caption",
		Date:    1700000000,
	}
	message.SetGroupedID(1234567890123)
	message.SetReactions(tg.MessageReactions{
		Results: []tg.ReactionCount{
			{Reaction: &tg.ReactionEmoji{Emoticon: "🔥"}, Count: 2},
		},
	})
	item := mapMessage("user:42:1", message, nil, nil)
	if item.GroupedID != "1234567890123" {
		t.Fatalf("grouped id = %q", item.GroupedID)
	}
	if len(item.Reactions) != 1 || item.Reactions[0].Emoji != "🔥" {
		t.Fatalf("reactions = %#v", item.Reactions)
	}
}

func TestAttachmentMimeByExtension(t *testing.T) {
	cases := map[string]string{
		"a.JPG": "image/jpeg",
		"b.mp4": "video/mp4",
		"c.pdf": "application/pdf",
		"d.zzz": "",
	}
	for path, want := range cases {
		if got := mimeTypeByExtension(path); got != want {
			t.Fatalf("mimeTypeByExtension(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestPeerIndexSeparatesPeerKinds(t *testing.T) {
	s := New()
	user := s.rememberPeer(&tg.InputPeerUser{UserID: 7, AccessHash: 70})
	chat := s.rememberPeer(&tg.InputPeerChat{ChatID: 7})
	channel := s.rememberPeer(&tg.InputPeerChannel{ChannelID: 7, AccessHash: 700})
	if user == chat || user == channel || chat == channel {
		t.Fatalf("peer kinds collided: %q %q %q", user, chat, channel)
	}
	if got := s.lookupPeer("channel", 7); got != channel {
		t.Fatalf("lookup channel = %q", got)
	}
	if got := s.lookupPeer("user", 7); got != user {
		t.Fatalf("lookup user = %q", got)
	}
}

func TestLiveChannelMessageMapsEntities(t *testing.T) {
	s := New()
	events := make(chan ChatEvent, 1)
	s.SetChatEventSink(func(event ChatEvent) { events <- event })

	entities := tg.Entities{
		Users: map[int64]*tg.User{
			42: &tg.User{ID: 42, AccessHash: 4242, FirstName: "Alice"},
		},
		Channels: map[int64]*tg.Channel{
			99: &tg.Channel{ID: 99, AccessHash: 9900, Title: "Team"},
		},
	}
	message := &tg.Message{
		ID:      7,
		PeerID:  &tg.PeerChannel{ChannelID: 99},
		FromID:  &tg.PeerUser{UserID: 42},
		Message: "live hello",
		Date:    1700000000,
	}
	handler := newLiveUpdateHandler(s, "", "")
	handler.handleMessageUpdate(message, entities, "message")

	event := <-events
	if event.Kind != "message" || event.ChatID != "channel:99:9900" {
		t.Fatalf("unexpected event %#v", event)
	}
	if event.Message == nil || event.Message.Sender != "Alice" {
		t.Fatalf("unexpected message %#v", event.Message)
	}
	if event.Message.SenderAvatarURL != "" {
		t.Fatalf("unexpected avatar URL %q", event.Message.SenderAvatarURL)
	}
}
