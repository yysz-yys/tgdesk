package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
)

func TestMapMediaRichTypes(t *testing.T) {
	tests := []struct {
		name string
		in   tg.MessageMediaClass
		kind string
	}{
		{
			name: "sticker",
			in: &tg.MessageMediaDocument{Document: &tg.Document{
				MimeType: "image/webp",
				Attributes: []tg.DocumentAttributeClass{
					&tg.DocumentAttributeSticker{Alt: "😀"},
				},
			}},
			kind: "sticker",
		},
		{
			name: "animation",
			in: &tg.MessageMediaDocument{Document: &tg.Document{
				MimeType: "video/mp4",
				Attributes: []tg.DocumentAttributeClass{
					&tg.DocumentAttributeAnimated{},
				},
			}},
			kind: "animation",
		},
		{
			name: "voice",
			in: &tg.MessageMediaDocument{Document: &tg.Document{
				MimeType: "audio/ogg",
				Attributes: []tg.DocumentAttributeClass{
					&tg.DocumentAttributeAudio{Voice: true, Duration: 8},
				},
			}},
			kind: "voice",
		},
		{
			name: "video note",
			in: &tg.MessageMediaDocument{Document: &tg.Document{
				MimeType: "video/mp4",
				Attributes: []tg.DocumentAttributeClass{
					&tg.DocumentAttributeVideo{RoundMessage: true, Duration: 12},
				},
			}},
			kind: "video_note",
		},
		{
			name: "web page",
			in: &tg.MessageMediaWebPage{Webpage: &tg.WebPage{
				URL:         "https://example.com",
				DisplayURL:  "example.com",
				SiteName:    "Example",
				Title:       "Example title",
				Description: "Example description",
			}},
			kind: "webpage",
		},
		{
			name: "dice",
			in:   &tg.MessageMediaDice{Emoticon: "🎲", Value: 6},
			kind: "dice",
		},
		{
			name: "live location",
			in:   &tg.MessageMediaGeoLive{Geo: &tg.GeoPoint{Lat: 1, Long: 2}, Period: 60},
			kind: "location",
		},
		{
			name: "quiz",
			in: &tg.MessageMediaPoll{Poll: tg.Poll{
				Quiz:         true,
				Question:     tg.TextWithEntities{Text: "Pick one"},
				Answers:      []tg.PollAnswer{{Text: tg.TextWithEntities{Text: "A"}}},
				Closed:       false,
				PublicVoters: false,
			}, Results: tg.PollResults{}},
			kind: "poll",
		},
		{
			name: "unsupported",
			in:   &tg.MessageMediaUnsupported{},
			kind: "unsupported",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := mapMedia(test.in)
			if got == nil {
				t.Fatalf("mapMedia() returned nil")
			}
			if got.Kind != test.kind {
				t.Fatalf("kind = %q, want %q", got.Kind, test.kind)
			}
		})
	}
}

func TestMapMessageReplyAndSender(t *testing.T) {
	reply := &tg.MessageReplyHeader{}
	reply.SetReplyToMsgID(4)
	msg := &tg.Message{
		ID:      9,
		Date:    123,
		Message: "reply",
		FromID:  &tg.PeerUser{UserID: 7},
	}
	msg.SetReplyTo(reply)
	got := mapMessage("user:1:0", msg, map[int64]string{7: "Ada"}, map[int64]string{7: "user:7:99"})
	if got.SenderID != "user:7:99" || got.Sender != "Ada" {
		t.Fatalf("sender mapping = %q/%q", got.Sender, got.SenderID)
	}
	if got.ReplyToID != 4 {
		t.Fatalf("replyToId = %d, want 4", got.ReplyToID)
	}
}
