package kernel

import (
	"reflect"
	"testing"

	"github.com/gotd/td/tg"
)

func TestMapEntitiesPreservesStylesAndLinks(t *testing.T) {
	entities := mapEntities([]tg.MessageEntityClass{
		&tg.MessageEntityBold{Offset: 0, Length: 4},
		&tg.MessageEntityItalic{Offset: 5, Length: 3},
		&tg.MessageEntityTextURL{Offset: 9, Length: 7, URL: "https://example.com"},
		&tg.MessageEntityCode{Offset: 17, Length: 2},
		&tg.MessageEntityPre{Offset: 20, Length: 4, Language: "go"},
		&tg.MessageEntityBlockquote{Offset: 25, Length: 3},
		&tg.MessageEntityCustomEmoji{Offset: 29, Length: 1, DocumentID: 42},
	})
	if len(entities) != 7 {
		t.Fatalf("entities = %d, want 7", len(entities))
	}
	if entities[0].Type != "bold" || entities[0].Length != 4 {
		t.Fatalf("bold = %#v", entities[0])
	}
	if entities[2].Type != "link" || entities[2].URL != "https://example.com" {
		t.Fatalf("link = %#v", entities[2])
	}
	if entities[4].Type != "pre" || entities[4].Language != "go" {
		t.Fatalf("pre = %#v", entities[4])
	}
}

func TestDecodeWaveform(t *testing.T) {
	wave := decodeWaveform([]byte{0x1f, 0xe1, 0x00})
	if len(wave) == 0 {
		t.Fatal("empty waveform")
	}
	for _, value := range wave {
		if value < 0 || value > 31 {
			t.Fatalf("value out of range: %d", value)
		}
	}
}

func TestMapPollKeepsCorrectOptionAndExplanation(t *testing.T) {
	media := mapMedia(&tg.MessageMediaPoll{
		Poll: tg.Poll{
			Quiz: true,
			Question: tg.TextWithEntities{
				Text: "Capital?",
			},
			Answers: []tg.PollAnswer{
				{Text: tg.TextWithEntities{Text: "Paris"}, Option: []byte{1}},
				{Text: tg.TextWithEntities{Text: "Berlin"}, Option: []byte{2}},
			},
		},
		Results: tg.PollResults{
			TotalVoters: 10,
			Results: []tg.PollAnswerVoters{
				{Option: []byte{1}, Voters: 7, Correct: true},
				{Option: []byte{2}, Voters: 3},
			},
			Solution: "Paris is the capital.",
		},
	})
	if media == nil || media.Kind != "poll" {
		t.Fatalf("media = %#v", media)
	}
	if media.Correct != 0 {
		t.Fatalf("correct = %d, want 0", media.Correct)
	}
	if !reflect.DeepEqual(media.VoteCounts, []int{7, 3}) {
		t.Fatalf("votes = %v", media.VoteCounts)
	}
}

func TestCacheSanitizeStripsProcessLocalURLs(t *testing.T) {
	messages := sanitizeMessagesForCache([]MessageDTO{{
		ID:              1,
		ChatID:          "user:1:2",
		SenderAvatarURL: "http://127.0.0.1:1/avatar/x",
		Media: &MessageMediaDTO{
			Kind:      "photo",
			ThumbURL:  "http://127.0.0.1:1/thumb/x",
			PhotoURL:  "http://127.0.0.1:1/photo/x",
			StreamURL: "http://127.0.0.1:1/photo/y",
		},
	}})
	if messages[0].SenderAvatarURL != "" {
		t.Fatalf("avatar URL leaked")
	}
	if messages[0].Media.ThumbURL != "" || messages[0].Media.PhotoURL != "" || messages[0].Media.StreamURL != "" {
		t.Fatalf("media URL leaked: %#v", messages[0].Media)
	}
}
