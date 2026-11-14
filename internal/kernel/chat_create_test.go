package kernel

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/gotd/td/tg"
)

func TestNormalizeChatTitle(t *testing.T) {
	title, err := normalizeChatTitle("  Team  ")
	if err != nil || title != "Team" {
		t.Fatalf("normalizeChatTitle = %q, %v", title, err)
	}
	if _, err := normalizeChatTitle("   "); err == nil {
		t.Fatal("expected empty title error")
	}

	long := strings.Repeat("界", maxChatTitleRunes+5)
	clamped, err := normalizeChatTitle(long)
	if err != nil {
		t.Fatalf("normalizeChatTitle(long): %v", err)
	}
	if runes := []rune(clamped); len(runes) != maxChatTitleRunes {
		t.Fatalf("clamped title length = %d, want %d", len(runes), maxChatTitleRunes)
	}
	if !utf8.ValidString(clamped) {
		t.Fatal("clamped title is not valid UTF-8")
	}
}

func TestNormalizeChatAbout(t *testing.T) {
	if got := normalizeChatAbout("  hello  "); got != "hello" {
		t.Fatalf("normalizeChatAbout = %q, want %q", got, "hello")
	}
	if got := normalizeChatAbout("   "); got != "" {
		t.Fatalf("normalizeChatAbout(blank) = %q, want empty", got)
	}
	long := strings.Repeat("a", maxChatAboutRunes+10)
	if got := []rune(normalizeChatAbout(long)); len(got) != maxChatAboutRunes {
		t.Fatalf("clamped about length = %d, want %d", len(got), maxChatAboutRunes)
	}
}

func TestTruncateRunes(t *testing.T) {
	if got := truncateRunes("hello", 3); got != "hel" {
		t.Errorf("truncateRunes = %q", got)
	}
	if got := truncateRunes("hi", 5); got != "hi" {
		t.Errorf("truncateRunes short = %q", got)
	}
	if got := truncateRunes("hello", 0); got != "" {
		t.Errorf("truncateRunes(0) = %q", got)
	}
}

func TestCreatedChannelFromUpdates(t *testing.T) {
	updates := &tg.Updates{
		Updates: []tg.UpdateClass{&tg.UpdateChannel{ChannelID: 5}},
		Chats:   []tg.ChatClass{&tg.Channel{ID: 5, AccessHash: 777, Title: "News"}},
	}
	channel, ok := createdChannel(updates)
	if !ok || channel.ID != 5 || channel.AccessHash != 777 || channel.Title != "News" {
		t.Fatalf("createdChannel = %#v, %v", channel, ok)
	}

	combined := &tg.UpdatesCombined{
		Updates: []tg.UpdateClass{&tg.UpdateChannel{ChannelID: 6}},
		Chats:   []tg.ChatClass{&tg.Channel{ID: 6, AccessHash: 888}},
	}
	if channel, ok := createdChannel(combined); !ok || channel.ID != 6 || channel.AccessHash != 888 {
		t.Fatalf("createdChannel(combined) = %#v, %v", channel, ok)
	}

	// Without an updateChannel entry a single channel entity is still enough.
	fallback := &tg.Updates{Chats: []tg.ChatClass{&tg.Channel{ID: 9, AccessHash: 1}}}
	if channel, ok := createdChannel(fallback); !ok || channel.ID != 9 {
		t.Fatalf("createdChannel(fallback) = %#v, %v", channel, ok)
	}

	// A channel id that does not match any entity must not be guessed.
	mismatch := &tg.Updates{
		Updates: []tg.UpdateClass{&tg.UpdateChannel{ChannelID: 5}},
		Chats:   []tg.ChatClass{&tg.Channel{ID: 6, AccessHash: 1}},
	}
	if channel, ok := createdChannel(mismatch); ok {
		t.Fatalf("createdChannel(mismatch) = %#v, true", channel)
	}
	if channel, ok := createdChannel(nil); ok {
		t.Fatalf("createdChannel(nil) = %#v, true", channel)
	}
}

func TestCreatedBasicChatFromUpdates(t *testing.T) {
	cases := []struct {
		name    string
		updates tg.UpdatesClass
		want    int64
		ok      bool
	}{
		{
			name: "message peer",
			updates: &tg.Updates{Updates: []tg.UpdateClass{
				&tg.UpdateNewMessage{Message: &tg.Message{PeerID: &tg.PeerChat{ChatID: 9}}},
			}},
			want: 9,
			ok:   true,
		},
		{
			name: "service message peer",
			updates: &tg.Updates{Updates: []tg.UpdateClass{
				&tg.UpdateNewMessage{Message: &tg.MessageService{PeerID: &tg.PeerChat{ChatID: 12}}},
			}},
			want: 12,
			ok:   true,
		},
		{
			name: "participants update",
			updates: &tg.Updates{Updates: []tg.UpdateClass{
				&tg.UpdateChatParticipants{Participants: &tg.ChatParticipants{ChatID: 13}},
			}},
			want: 13,
			ok:   true,
		},
		{
			name:    "chat entity fallback",
			updates: &tg.Updates{Chats: []tg.ChatClass{&tg.Chat{ID: 14, Title: "Group"}}},
			want:    14,
			ok:      true,
		},
		{
			name: "channel message is not a basic group",
			updates: &tg.Updates{Updates: []tg.UpdateClass{
				&tg.UpdateNewMessage{Message: &tg.Message{PeerID: &tg.PeerChannel{ChannelID: 21}}},
			}},
		},
		{name: "nil updates"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			got, ok := createdBasicChat(test.updates)
			if got != test.want || ok != test.ok {
				t.Fatalf("createdBasicChat() = %d, %v; want %d, %v", got, ok, test.want, test.ok)
			}
		})
	}
}

func TestOpaqueChatIDFormat(t *testing.T) {
	if got := encodePeerID("channel", 42, -99); got != "channel:42:-99" {
		t.Errorf("channel id = %q", got)
	}
	if got := encodePeerID("chat", 7, 0); got != "chat:7:0" {
		t.Errorf("chat id = %q", got)
	}
}
