package kernel

import (
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

func TestPeerIDRoundTrip(t *testing.T) {
	cases := []struct {
		id   string
		want any
	}{
		{"user:42:123456", &tg.InputPeerUser{UserID: 42, AccessHash: 123456}},
		{"chat:7:0", &tg.InputPeerChat{ChatID: 7}},
		{"channel:99:-123", &tg.InputPeerChannel{ChannelID: 99, AccessHash: -123}},
	}
	for _, tc := range cases {
		peer, err := parsePeerID(tc.id)
		if err != nil {
			t.Fatalf("parsePeerID(%q): %v", tc.id, err)
		}
		switch want := tc.want.(type) {
		case *tg.InputPeerUser:
			got, ok := peer.(*tg.InputPeerUser)
			if !ok || got.UserID != want.UserID || got.AccessHash != want.AccessHash {
				t.Fatalf("user round trip: %#v", peer)
			}
		case *tg.InputPeerChat:
			got, ok := peer.(*tg.InputPeerChat)
			if !ok || got.ChatID != want.ChatID {
				t.Fatalf("chat round trip: %#v", peer)
			}
		case *tg.InputPeerChannel:
			got, ok := peer.(*tg.InputPeerChannel)
			if !ok || got.ChannelID != want.ChannelID || got.AccessHash != want.AccessHash {
				t.Fatalf("channel round trip: %#v", peer)
			}
		}
	}

	if _, err := parsePeerID("bogus"); err == nil {
		t.Fatal("expected invalid chat ID error")
	}
}

func TestHumanSize(t *testing.T) {
	cases := map[int64]string{
		512:             "512 B",
		2048:            "2.0 KB",
		5 * 1024 * 1024: "5.0 MB",
	}
	for size, want := range cases {
		if got := humanSize(size); got != want {
			t.Errorf("humanSize(%d) = %q, want %q", size, got, want)
		}
	}
}

func TestReplyPreviewText(t *testing.T) {
	text := strings.Repeat("a", 140)
	if got := replyPreviewText(&tg.Message{Message: text}); len([]rune(got)) != 121 || !strings.HasSuffix(got, "…") {
		t.Fatalf("long reply preview = %q", got)
	}
	plain := replyPreviewText(&tg.Message{Message: "hello"})
	if plain != "hello" {
		t.Fatalf("reply preview = %q", plain)
	}
	photo := replyPreviewText(&tg.Message{Media: &tg.MessageMediaPhoto{Photo: &tg.Photo{}}})
	if photo != "Photo" {
		t.Fatalf("media reply preview = %q", photo)
	}
}

func TestSenderName(t *testing.T) {
	senders := map[int64]string{42: "Ada", 7: "Group"}
	cases := []struct {
		peer tg.PeerClass
		want string
	}{
		{&tg.PeerUser{UserID: 42}, "Ada"},
		{&tg.PeerChat{ChatID: 7}, "Group"},
		{&tg.PeerChannel{ChannelID: 99}, ""},
		{nil, ""},
	}
	for _, tc := range cases {
		if got := senderName(tc.peer, senders); got != tc.want {
			t.Errorf("senderName(%T) = %q, want %q", tc.peer, got, tc.want)
		}
	}
}

func TestParseMessageReplies(t *testing.T) {
	post := &tg.Message{ID: 77}
	post.Replies.Comments = true
	post.Replies.Replies = 24
	post.Replies.SetChannelID(1003)
	post.SetReplies(post.Replies)
	info, ok := parseMessageReplies(post)
	if !ok || !info.Enabled || info.Count != 24 ||
		info.DiscussionChannelID != 1003 || info.ThreadID != 77 {
		t.Fatalf("parseMessageReplies = %+v, ok=%v", info, ok)
	}

	// a group's plain reply thread carries no comments flag
	thread := &tg.Message{ID: 8}
	thread.Replies.Replies = 3
	thread.Replies.SetMaxID(12)
	thread.SetReplies(thread.Replies)
	if _, ok := parseMessageReplies(thread); ok {
		t.Fatal("a simple reply thread must not map to a comment section")
	}
	if _, ok := parseMessageReplies(&tg.Message{}); ok {
		t.Fatal("a message without replies must not map to a comment section")
	}
	if _, ok := parseMessageReplies(nil); ok {
		t.Fatal("nil message must not map to a comment section")
	}
}

func TestApplyMessageRepliesResolvesDiscussion(t *testing.T) {
	svc := &Service{peerIndex: map[string]string{}}
	msg := &tg.Message{ID: 5}
	msg.Replies.Comments = true
	msg.Replies.Replies = 1
	msg.Replies.SetChannelID(1003)
	msg.SetReplies(msg.Replies)

	item := MessageDTO{ID: 5}
	// neither the response entities nor the peer index know the discussion
	// channel yet: the bar still shows, the id stays empty
	svc.applyMessageReplies(&item, msg, nil)
	if !item.CommentsEnabled || item.CommentsCount != 1 ||
		item.ThreadID != 5 || item.DiscussionChatID != "" {
		t.Fatalf("unresolved replies = %+v", item)
	}

	// the response that carries the linked channel gives its opaque id, which is
	// remembered for the next page
	svc.applyMessageReplies(&item, msg, []tg.ChatClass{&tg.Channel{ID: 1003, AccessHash: -42}})
	if item.DiscussionChatID != "channel:1003:-42" {
		t.Fatalf("discussion chat id = %q", item.DiscussionChatID)
	}
	if got := svc.lookupPeer("channel", 1003); got != "channel:1003:-42" {
		t.Fatalf("discussion peer not remembered: %q", got)
	}
}

func TestMapEntitiesBlockquoteCollapsed(t *testing.T) {
	entities := mapEntities([]tg.MessageEntityClass{
		&tg.MessageEntityBlockquote{Collapsed: true, Offset: 7, Length: 6},
		&tg.MessageEntityBlockquote{Offset: 14, Length: 4},
	})
	if len(entities) != 2 {
		t.Fatalf("entities = %+v", entities)
	}
	first := entities[0]
	if first.Type != "blockquote" || first.Offset != 7 || first.Length != 6 || !first.Collapsed {
		t.Fatalf("collapsed blockquote = %+v", first)
	}
	if entities[1].Collapsed {
		t.Fatalf("expanded blockquote = %+v", entities[1])
	}
}
