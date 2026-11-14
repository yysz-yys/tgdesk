package kernel

import (
	"reflect"
	"testing"

	"github.com/gotd/td/tg"
)

func TestDeriveStickerGifRights(t *testing.T) {
	cases := []struct {
		name      string
		canSend   bool
		hasBanned bool
		banned    tg.ChatBannedRights
		wantStick bool
		wantGifs  bool
	}{
		{"allowed", true, false, tg.ChatBannedRights{}, true, true},
		{"cannot send at all", false, false, tg.ChatBannedRights{}, false, false},
		{"stickers banned", true, true, tg.ChatBannedRights{SendStickers: true}, false, true},
		{"gifs banned", true, true, tg.ChatBannedRights{SendGifs: true}, true, false},
		{"both banned", true, true, tg.ChatBannedRights{SendStickers: true, SendGifs: true}, false, false},
		{"media ban alone does not hide picker", true, true, tg.ChatBannedRights{SendMedia: true}, true, true},
	}
	for _, testCase := range cases {
		stickers, gifs := deriveStickerGifRights(testCase.canSend, testCase.hasBanned, testCase.banned)
		if stickers != testCase.wantStick || gifs != testCase.wantGifs {
			t.Fatalf("%s: got (%v,%v) want (%v,%v)",
				testCase.name, stickers, gifs, testCase.wantStick, testCase.wantGifs)
		}
	}
}

func TestActiveUsernameList(t *testing.T) {
	usernames := []tg.Username{
		{Username: "second", Active: true, Editable: true},
		{Username: "owned", Active: true, Editable: false},
		{Username: "hidden", Active: false, Editable: true},
	}
	got := activeUsernameList("main", usernames)
	want := []string{"main", "owned", "second"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("activeUsernameList = %v want %v", got, want)
	}
	if got := activeUsernameList("", nil); got != nil {
		t.Fatalf("empty username list = %v", got)
	}
}

func TestMapUserProfileStickerGifts(t *testing.T) {
	full := tg.UserFull{}
	full.SetStargiftsCount(2)
	user := &tg.User{ID: 11, Username: "main"}
	user.SetUsernames([]tg.Username{
		{Username: "second", Active: true, Editable: true},
		{Username: "hidden", Active: false, Editable: true},
	})

	profile := mapUserProfile(full, user, false)
	if !profile.CanSendStickers || !profile.CanSendGifs {
		t.Fatalf("user should be allowed to send stickers and gifs: %+v", profile)
	}
	if profile.GiftsCount != 2 {
		t.Fatalf("giftsCount = %d", profile.GiftsCount)
	}
	if want := []string{"main", "second"}; !reflect.DeepEqual(profile.Usernames, want) {
		t.Fatalf("usernames = %v want %v", profile.Usernames, want)
	}
}

func TestMapChannelProfileStickerGifts(t *testing.T) {
	full := &tg.ChannelFull{}
	full.SetParticipantsCount(1500)
	full.SetAdminsCount(9)
	full.SetStargiftsCount(4)
	channel := &tg.Channel{ID: 7, AccessHash: 8, Title: "News"}
	channel.SetUsernames([]tg.Username{
		{Username: "owned", Active: true, Editable: false},
		{Username: "second", Active: true, Editable: true},
		{Username: "hidden", Active: false, Editable: true},
	})

	profile := mapChannelProfile(full, channel, channelOwnRights{}, "")
	if profile.Members != 1500 || profile.AdminsCount != 9 || profile.GiftsCount != 4 {
		t.Fatalf("unexpected counts: %+v", profile)
	}
	// A plain broadcast channel cannot be posted in, so the media picker is
	// blocked too.
	if profile.CanSend || profile.CanSendStickers || profile.CanSendGifs {
		t.Fatalf("broadcast non-member should not be able to send: %+v", profile)
	}
	if want := []string{"owned", "second"}; !reflect.DeepEqual(profile.Usernames, want) {
		t.Fatalf("usernames = %v want %v", profile.Usernames, want)
	}

	banned := tg.ChatBannedRights{SendStickers: true}
	megagroup := &tg.Channel{ID: 9, AccessHash: 10, Title: "Group"}
	megagroup.SetMegagroup(true)
	megagroup.SetBannedRights(banned)
	memberProfile := mapChannelProfile(nil, megagroup, channelOwnRights{
		bannedRights:    banned,
		hasBannedRights: true,
	}, "")
	if !memberProfile.CanSend || memberProfile.CanSendStickers || !memberProfile.CanSendGifs {
		t.Fatalf("megagroup sticker ban not reflected: %+v", memberProfile)
	}
}

func TestMapBasicGroupProfileStickerGifRights(t *testing.T) {
	chat := &tg.Chat{ID: 3, Title: "Group", ParticipantsCount: 5}
	chat.SetDefaultBannedRights(tg.ChatBannedRights{SendGifs: true})

	profile := mapBasicGroupProfile(nil, chat)
	if !profile.CanSend || !profile.CanSendStickers || profile.CanSendGifs {
		t.Fatalf("basic group gif ban not reflected: %+v", profile)
	}
	if profile.Members != 5 {
		t.Fatalf("members = %d", profile.Members)
	}
}

func TestCloneChatProfileCopiesUsernames(t *testing.T) {
	source := &ChatProfileDTO{
		Usernames:  []string{"a", "b"},
		LinkedChat: &ChatDTO{ID: "channel:1:2", Title: "Discussion"},
	}
	clone := cloneChatProfile(source)
	if !reflect.DeepEqual(clone.Usernames, source.Usernames) {
		t.Fatalf("usernames not cloned")
	}
	clone.Usernames[0] = "changed"
	if source.Usernames[0] != "a" {
		t.Fatalf("clone shares the usernames slice with the cached profile")
	}
	if clone.LinkedChat == nil || clone.LinkedChat.Title != "Discussion" {
		t.Fatalf("linked chat not cloned: %+v", clone.LinkedChat)
	}
	clone.LinkedChat.Title = "changed"
	if source.LinkedChat.Title != "Discussion" {
		t.Fatalf("clone shares the linked chat pointer with the cached profile")
	}
}

func TestLinkedChatDTO(t *testing.T) {
	service := newStickerTestService()
	channel := &tg.Channel{ID: 42, AccessHash: 43, Title: "Discussion", ParticipantsCount: 100}
	channelID := encodePeerID("channel", 42, 43)

	dto := service.linkedChatDTO([]tg.ChatClass{channel}, channelID, "proxy", "ntp")
	if dto == nil || dto.ID != channelID || dto.Title != "Discussion" || dto.Kind != "channel" || dto.Members != 100 {
		t.Fatalf("unexpected linked chat dto: %+v", dto)
	}

	entity := &tg.Chat{ID: 7, Title: "Legacy Group", ParticipantsCount: 3}
	legacyID := encodePeerID("chat", 7, 0)
	legacy := service.linkedChatDTO([]tg.ChatClass{entity}, legacyID, "proxy", "ntp")
	if legacy == nil || legacy.ID != legacyID || legacy.Kind != "group" {
		t.Fatalf("unexpected legacy linked chat dto: %+v", legacy)
	}

	if service.linkedChatDTO([]tg.ChatClass{channel}, "", "", "") != nil {
		t.Fatalf("empty linked id must not map a chat")
	}
	if service.linkedChatDTO(nil, channelID, "", "") != nil {
		t.Fatalf("missing entity must not map a chat")
	}
}
