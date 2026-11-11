package kernel

import (
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
