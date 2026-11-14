package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
)

func TestMapButtonsRowsAndStyles(t *testing.T) {
	markup := &tg.ReplyInlineMarkup{Rows: []tg.KeyboardButtonRow{
		{Buttons: []tg.KeyboardButtonClass{
			&tg.KeyboardButtonCallback{
				Text:  "OK",
				Data:  []byte{0x01, 0x02},
				Style: tg.KeyboardButtonStyle{BgPrimary: true},
			},
			&tg.KeyboardButtonURL{Text: "Open", URL: "https://example.com"},
		}},
		{Buttons: []tg.KeyboardButtonClass{
			&tg.KeyboardButtonSimpleWebView{
				Text:  "App",
				URL:   "https://example.com/app",
				Style: tg.KeyboardButtonStyle{BgSuccess: true},
			},
			&tg.KeyboardButtonCopy{
				Text:     "Copy",
				CopyText: "copied text",
			},
		}},
	}}
	buttons := mapButtons(markup)
	if len(buttons) != 4 {
		t.Fatalf("buttons = %d, want 4", len(buttons))
	}
	byKind := map[string]MessageButtonDTO{}
	for _, button := range buttons {
		byKind[button.Kind] = button
	}
	if got := byKind["callback"]; got.Row != 0 || got.Style != "primary" || got.Data != "0102" || got.Text != "OK" {
		t.Fatalf("callback = %+v", got)
	}
	if got := byKind["url"]; got.Row != 0 || got.URL != "https://example.com" || got.Style != "" {
		t.Fatalf("url = %+v", got)
	}
	if got := byKind["webview_simple"]; got.Row != 1 || got.Style != "success" || got.URL != "https://example.com/app" {
		t.Fatalf("simple webview = %+v", got)
	}
	if got := byKind["copy"]; got.Row != 1 || got.Data != "copied text" || got.Style != "" {
		t.Fatalf("copy = %+v", got)
	}
	if mapButtons(&tg.ReplyKeyboardMarkup{}) != nil {
		t.Fatal("reply keyboard mapped as inline buttons")
	}
}

func TestDeriveChannelSendRights(t *testing.T) {
	adminPost := tg.ChatAdminRights{PostMessages: true}
	cases := []struct {
		name        string
		state       channelSendState
		canSend     bool
		canPlain    bool
		restriction string
	}{
		{
			name:     "owner",
			state:    channelSendState{isOwner: true, broadcast: true, left: true},
			canSend:  true,
			canPlain: true,
		},
		{
			name:        "broadcast subscriber",
			state:       channelSendState{broadcast: true},
			restriction: ChatSendRestrictionBroadcast,
		},
		{
			name:     "broadcast admin with post rights",
			state:    channelSendState{broadcast: true, isAdmin: true, adminRights: adminPost},
			canSend:  true,
			canPlain: true,
		},
		{
			name:        "broadcast admin without post rights",
			state:       channelSendState{broadcast: true, isAdmin: true, adminRights: tg.ChatAdminRights{DeleteMessages: true}},
			restriction: ChatSendRestrictionBroadcast,
		},
		{
			name:        "gigagroup member",
			state:       channelSendState{gigagroup: true},
			restriction: ChatSendRestrictionBroadcast,
		},
		{
			name:        "megagroup left",
			state:       channelSendState{left: true},
			restriction: ChatSendRestrictionNotMember,
		},
		{
			name:        "megagroup send_messages ban",
			state:       channelSendState{hasBannedRights: true, bannedRights: tg.ChatBannedRights{SendMessages: true}},
			restriction: ChatSendRestrictionRestricted,
		},
		{
			name:     "megagroup banned admin is unaffected",
			state:    channelSendState{isAdmin: true, adminRights: adminPost, hasBannedRights: true, bannedRights: tg.ChatBannedRights{SendMessages: true}},
			canSend:  true,
			canPlain: true,
		},
		{
			name:     "megagroup send_plain ban",
			state:    channelSendState{hasBannedRights: true, bannedRights: tg.ChatBannedRights{SendPlain: true}},
			canSend:  true,
			canPlain: false,
		},
		{
			name:        "megagroup pending join request",
			state:       channelSendState{requestsPending: 2},
			restriction: ChatSendRestrictionNotMember,
		},
		{
			name:        "megagroup self join request pending",
			state:       channelSendState{joinRequest: true},
			restriction: ChatSendRestrictionNotMember,
		},
		{
			name:        "platform-restricted group",
			state:       channelSendState{restricted: true},
			restriction: ChatSendRestrictionRestricted,
		},
		{
			name:     "megagroup member",
			state:    channelSendState{},
			canSend:  true,
			canPlain: true,
		},
	}
	for _, test := range cases {
		canSend, canPlain, restriction := deriveChannelSendRights(test.state)
		if canSend != test.canSend || canPlain != test.canPlain || restriction != test.restriction {
			t.Errorf("%s = (%v,%v,%q), want (%v,%v,%q)", test.name, canSend, canPlain, restriction, test.canSend, test.canPlain, test.restriction)
		}
	}
}

func TestDeriveBasicGroupRights(t *testing.T) {
	cases := []struct {
		name        string
		isOwner     bool
		isAdmin     bool
		left        bool
		deactivated bool
		hasBanned   bool
		banned      tg.ChatBannedRights
		canSend     bool
		canPlain    bool
		restriction string
	}{
		{name: "owner", isOwner: true, canSend: true, canPlain: true},
		{name: "left", left: true, restriction: ChatSendRestrictionNotMember},
		{name: "deactivated", deactivated: true, restriction: ChatSendRestrictionRestricted},
		{
			name:        "banned send",
			hasBanned:   true,
			banned:      tg.ChatBannedRights{SendMessages: true},
			restriction: ChatSendRestrictionRestricted,
		},
		{name: "banned plain", hasBanned: true, banned: tg.ChatBannedRights{SendPlain: true}, canSend: true, canPlain: false},
		{name: "member", canSend: true, canPlain: true},
	}
	for _, test := range cases {
		canSend, canPlain, restriction := deriveBasicGroupRights(
			test.isOwner, test.isAdmin, test.left, test.deactivated, test.hasBanned, test.banned,
		)
		if canSend != test.canSend || canPlain != test.canPlain || restriction != test.restriction {
			t.Errorf("%s = (%v,%v,%q), want (%v,%v,%q)", test.name, canSend, canPlain, restriction, test.canSend, test.canPlain, test.restriction)
		}
	}
}

func TestMapUserProfileBotAndSaved(t *testing.T) {
	botInfo := tg.BotInfo{}
	botInfo.SetDescription("helper bot")
	botInfo.SetCommands([]tg.BotCommand{
		{Command: "start", Description: "Start"},
		{Command: "/help", Description: "Help"},
		{Command: "start", Description: "duplicate"},
	})
	full := tg.UserFull{}
	full.SetAbout("bot bio")
	full.SetBotInfo(botInfo)

	bot := &tg.User{ID: 42, Bot: true, Username: "helper_bot"}
	profile := mapUserProfile(full, bot, false)
	if profile.Type != ChatProfileTypeBot {
		t.Fatalf("type = %q, want bot", profile.Type)
	}
	if profile.About != "bot bio" || profile.Username != "helper_bot" {
		t.Fatalf("about/username = %q/%q", profile.About, profile.Username)
	}
	if len(profile.BotCommands) != 2 || profile.BotCommands[0].Command != "start" || profile.BotCommands[1].Command != "help" {
		t.Fatalf("commands = %+v", profile.BotCommands)
	}
	if profile.BotMenuButton == nil || profile.BotMenuButton.Type != BotMenuButtonTypeDefault {
		t.Fatalf("menu button = %+v", profile.BotMenuButton)
	}
	if profile.BotPrivacyURL != "https://telegram.org/privacy-tpa" {
		t.Fatalf("privacy url = %q", profile.BotPrivacyURL)
	}

	saved := mapUserProfile(full, &tg.User{ID: 42}, true)
	if saved.Type != ChatProfileTypeSaved {
		t.Fatalf("saved type = %q", saved.Type)
	}

	userFull := tg.UserFull{}
	userFull.SetAbout("hello")
	contact := &tg.User{ID: 7, Contact: true}
	contact.SetPhone("15550000")
	userProfile := mapUserProfile(userFull, contact, false)
	if userProfile.Type != ChatProfileTypeUser || userProfile.Phone != "15550000" {
		t.Fatalf("user profile = %+v", userProfile)
	}
	hidden := &tg.User{ID: 8}
	hidden.SetPhone("15550000")
	if got := mapUserProfile(userFull, hidden, false); got.Phone != "" {
		t.Fatalf("phone leaked for non-contact: %q", got.Phone)
	}
}

func TestMapBotMenuButtonVariants(t *testing.T) {
	webApp := mapBotMenuButton(&tg.BotMenuButton{Text: "Open app", URL: "https://example.com/app"})
	if webApp == nil || webApp.Type != BotMenuButtonTypeWebApp || webApp.Text != "Open app" || webApp.URL != "https://example.com/app" {
		t.Fatalf("webapp = %+v", webApp)
	}
	if got := mapBotMenuButton(&tg.BotMenuButtonCommands{}); got == nil || got.Type != BotMenuButtonTypeCommands {
		t.Fatalf("commands = %+v", got)
	}
	if got := mapBotMenuButton(&tg.BotMenuButtonDefault{}); got == nil || got.Type != BotMenuButtonTypeDefault {
		t.Fatalf("default = %+v", got)
	}
	if got := mapBotMenuButton(nil); got != nil {
		t.Fatalf("nil = %+v", got)
	}
}

func TestMapBotPrivacyURL(t *testing.T) {
	withURL := tg.BotInfo{}
	withURL.SetPrivacyPolicyURL("https://example.com/privacy")
	if got := mapBotPrivacyURL(withURL, nil); got != "https://example.com/privacy" {
		t.Fatalf("explicit url = %q", got)
	}

	privacyCommand := []BotCommandDTO{{Command: "privacy"}}
	noURL := tg.BotInfo{}
	if got := mapBotPrivacyURL(noURL, privacyCommand); got != "" {
		t.Fatalf("privacy command url = %q, want empty", got)
	}
	if got := mapBotPrivacyURL(noURL, []BotCommandDTO{{Command: "start"}}); got != "https://telegram.org/privacy-tpa" {
		t.Fatalf("fallback url = %q", got)
	}
}

func TestMapChannelProfileBroadcastAndForum(t *testing.T) {
	broadcast := &tg.Channel{ID: 9}
	broadcast.SetBroadcast(true)
	broadcast.SetUsername("news")
	broadcast.SetParticipantsCount(1200)

	full := &tg.ChannelFull{About: "news channel"}
	full.SetParticipantsCount(1200)
	full.SetSlowmodeSeconds(30)
	full.SetSlowmodeNextSendDate(1700000000)
	invite := &tg.ChatInviteExported{Link: "https://t.me/+abc"}
	full.SetExportedInvite(invite)

	profile := mapChannelProfile(full, broadcast, channelOwnRights{}, "")
	if profile.Type != ChatProfileTypeChannel {
		t.Fatalf("type = %q", profile.Type)
	}
	if profile.About != "news channel" || profile.Members != 1200 || profile.Username != "news" {
		t.Fatalf("profile = %+v", profile)
	}
	if profile.CanSend || profile.SendRestriction != ChatSendRestrictionBroadcast {
		t.Fatalf("broadcast rights = %v/%q", profile.CanSend, profile.SendRestriction)
	}
	if profile.CanViewMembers {
		t.Fatal("broadcast exposes member list")
	}
	if profile.SlowModeSeconds != 30 || profile.SlowModeNextSendDate != 1700000000 {
		t.Fatalf("slow mode = %d/%d", profile.SlowModeSeconds, profile.SlowModeNextSendDate)
	}
	if profile.InviteLink != "https://t.me/+abc" {
		t.Fatalf("invite = %q", profile.InviteLink)
	}

	group := &tg.Channel{ID: 10}
	group.SetMegagroup(true)
	group.SetForum(true)
	group.SetParticipantsCount(50)
	groupFull := &tg.ChannelFull{}
	groupFull.SetCanViewParticipants(true)
	groupProfile := mapChannelProfile(groupFull, group, channelOwnRights{}, "channel:99:1")
	if groupProfile.Type != ChatProfileTypeGroup || !groupProfile.IsForum || !groupProfile.CanSend || !groupProfile.CanViewMembers {
		t.Fatalf("group profile = %+v", groupProfile)
	}
	if groupProfile.LinkedChatID != "channel:99:1" {
		t.Fatalf("linked chat = %q", groupProfile.LinkedChatID)
	}
}

func TestMapBasicGroupProfile(t *testing.T) {
	chat := &tg.Chat{ID: 5, Title: "Group", ParticipantsCount: 4}
	full := &tg.ChatFull{About: "group about"}
	invite := &tg.ChatInviteExported{Link: "https://t.me/+group"}
	full.SetExportedInvite(invite)
	full.SetBotInfo([]tg.BotInfo{{}})

	profile := mapBasicGroupProfile(full, chat)
	if profile.Type != ChatProfileTypeGroup || profile.Members != 4 || profile.About != "group about" {
		t.Fatalf("profile = %+v", profile)
	}
	if !profile.CanSend || !profile.CanSendPlain || !profile.CanViewMembers {
		t.Fatalf("rights = %+v", profile)
	}
	if profile.InviteLink != "https://t.me/+group" {
		t.Fatalf("invite = %q", profile.InviteLink)
	}

	left := &tg.Chat{ID: 6}
	left.SetLeft(true)
	leftProfile := mapBasicGroupProfile(nil, left)
	if leftProfile.CanSend || leftProfile.SendRestriction != ChatSendRestrictionNotMember {
		t.Fatalf("left profile = %+v", leftProfile)
	}
}

func TestCloneChatProfileDetachesSlices(t *testing.T) {
	original := &ChatProfileDTO{
		Type:        ChatProfileTypeBot,
		BotCommands: []BotCommandDTO{{Command: "start"}},
		BotMenuButton: &BotMenuButtonDTO{
			Type: BotMenuButtonTypeWebApp,
			URL:  "https://example.com",
		},
	}
	clone := cloneChatProfile(original)
	clone.BotCommands[0].Command = "changed"
	clone.BotMenuButton.URL = "changed"
	if original.BotCommands[0].Command != "start" || original.BotMenuButton.URL != "https://example.com" {
		t.Fatal("clone mutated the cache entry")
	}
	if cloneChatProfile(nil) != nil {
		t.Fatal("nil clone is not nil")
	}
}
