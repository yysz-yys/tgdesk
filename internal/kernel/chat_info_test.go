package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
)

func TestSharedMediaFiltersRoundTrip(t *testing.T) {
	sections := []string{
		SectionMedia,
		SectionPhotos,
		SectionVideos,
		SectionFiles,
		SectionLinks,
		SectionMusic,
		SectionVoice,
		SectionGifs,
	}
	for _, section := range sections {
		filter, ok := sharedMediaFilter(section)
		if !ok {
			t.Fatalf("no filter for %q", section)
		}
		got, ok := sectionForFilter(filter)
		if !ok || got != section {
			t.Fatalf("round trip for %q = %q, %v", section, got, ok)
		}
	}
	if _, ok := sharedMediaFilter(SectionMembers); ok {
		t.Fatal("members has no message filter")
	}
	if _, ok := sharedMediaFilter("unknown"); ok {
		t.Fatal("unknown section accepted")
	}
}

func TestMatchesSharedMediaSection(t *testing.T) {
	message := func(kind string) *MessageDTO {
		return &MessageDTO{Media: &MessageMediaDTO{Kind: kind}}
	}
	cases := []struct {
		section string
		kind    string
		want    bool
	}{
		{SectionMedia, "photo", true},
		{SectionMedia, "video", true},
		{SectionMedia, "animation", false},
		{SectionPhotos, "photo", true},
		{SectionPhotos, "video", false},
		{SectionVideos, "video", true},
		{SectionVideos, "photo", false},
		{SectionFiles, "file", true},
		{SectionFiles, "audio", false},
		{SectionFiles, "voice", false},
		{SectionMusic, "audio", true},
		{SectionMusic, "voice", false},
		{SectionVoice, "voice", true},
		{SectionVoice, "video_note", true},
		{SectionVoice, "audio", false},
		{SectionGifs, "animation", true},
		{SectionGifs, "photo", false},
	}
	for _, test := range cases {
		if got := matchesSharedMediaSection(test.section, message(test.kind)); got != test.want {
			t.Errorf("%s/%s = %v, want %v", test.section, test.kind, got, test.want)
		}
	}
	if matchesSharedMediaSection(SectionMedia, nil) {
		t.Fatal("nil message matched")
	}
}

func TestMatchesSharedMediaLinks(t *testing.T) {
	withTextURL := &MessageDTO{Text: "see https://example.com for details"}
	if !matchesSharedMediaSection(SectionLinks, withTextURL) {
		t.Fatal("text URL not matched")
	}
	withEntity := &MessageDTO{
		Text:     "see example.com",
		Entities: []MessageEntityDTO{{Type: "url", Offset: 4, Length: 11}},
	}
	if !matchesSharedMediaSection(SectionLinks, withEntity) {
		t.Fatal("url entity not matched")
	}
	withPreview := &MessageDTO{Media: &MessageMediaDTO{Kind: "webpage"}}
	if !matchesSharedMediaSection(SectionLinks, withPreview) {
		t.Fatal("webpage not matched")
	}
	withoutURL := &MessageDTO{Text: "plain text", Media: &MessageMediaDTO{Kind: "photo"}}
	if matchesSharedMediaSection(SectionLinks, withoutURL) {
		t.Fatal("plain text matched links")
	}
}

func TestMessageListLastID(t *testing.T) {
	messages := []tg.MessageClass{
		&tg.Message{ID: 90},
		&tg.MessageService{ID: 85},
		&tg.Message{ID: 80},
	}
	if got := messageListLastID(messages, 0); got != 80 {
		t.Fatalf("last id = %d, want 80", got)
	}
	if got := messageListLastID(nil, 42); got != 0 {
		t.Fatalf("empty page last id = %d, want 0", got)
	}
}

func TestMessagesListUnwrapsResponses(t *testing.T) {
	users := []tg.UserClass{&tg.User{ID: 7}}
	chats := []tg.ChatClass{&tg.Chat{ID: 8, Title: "Group"}}
	messages := []tg.MessageClass{&tg.Message{ID: 1, Message: "hi"}}

	cases := []tg.MessagesMessagesClass{
		&tg.MessagesMessages{Messages: messages, Users: users, Chats: chats},
		&tg.MessagesMessagesSlice{Messages: messages, Users: users, Chats: chats},
		&tg.MessagesChannelMessages{Messages: messages, Users: users, Chats: chats},
	}
	for _, response := range cases {
		gotMessages, gotUsers, gotChats, ok := messagesList(response)
		if !ok || len(gotMessages) != 1 || len(gotUsers) != 1 || len(gotChats) != 1 {
			t.Fatalf("unwrap %T = %d/%d/%d/%v", response, len(gotMessages), len(gotUsers), len(gotChats), ok)
		}
	}
	if _, _, _, ok := messagesList(&tg.MessagesMessagesNotModified{Count: 0}); ok {
		t.Fatal("not-modified response unwrapped as a page")
	}
}
