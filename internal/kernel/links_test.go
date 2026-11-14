package kernel

import "testing"

func TestClassifyTelegramLink(t *testing.T) {
	cases := []struct {
		name       string
		raw        string
		wantKind   string
		wantUser   string
		wantPost   int
		wantThread int
		wantChan   int64
		wantHash   string
		wantUserID int64
	}{
		{"bare t.me username", "t.me/durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"https username", "https://t.me/durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"post", "https://t.me/durov/42", parsedLinkKindPeer, "durov", 42, 0, 0, "", 0},
		{"telegram.me post", "https://telegram.me/durov/42", parsedLinkKindPeer, "durov", 42, 0, 0, "", 0},
		{"telegram.dog", "http://telegram.dog/durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"public preview s", "https://t.me/s/durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"username label host", "durov.t.me/7", parsedLinkKindPeer, "durov", 7, 0, 0, "", 0},
		{"thread and post", "https://t.me/durov/42/99", parsedLinkKindPeer, "durov", 99, 42, 0, "", 0},
		{"query ignored", "https://t.me/durov/42?thread=5", parsedLinkKindPeer, "durov", 42, 0, 0, "", 0},
		{"mention", "@durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"tg resolve", "tg://resolve?domain=durov", parsedLinkKindPeer, "durov", 0, 0, 0, "", 0},
		{"tg resolve post", "tg://resolve?domain=durov&post=9", parsedLinkKindPeer, "durov", 9, 0, 0, "", 0},
		{"invite plus", "https://t.me/+abcDEF123", parsedLinkKindInvite, "", 0, 0, 0, "abcDEF123", 0},
		{"invite joinchat", "https://t.me/joinchat/abcDEF123", parsedLinkKindInvite, "", 0, 0, 0, "abcDEF123", 0},
		{"bare invite", "t.me/+abcDEF123", parsedLinkKindInvite, "", 0, 0, 0, "abcDEF123", 0},
		{"tg join", "tg://join?invite=abcDEF123", parsedLinkKindInvite, "", 0, 0, 0, "abcDEF123", 0},
		{"tg joinchat", "tg://joinchat?invite=abcDEF123", parsedLinkKindInvite, "", 0, 0, 0, "abcDEF123", 0},
		{"private post", "https://t.me/c/12345/67", parsedLinkKindPrivatePost, "", 67, 0, 12345, "", 0},
		{"tg private post", "tg://privatepost?channel=12345&post=67", parsedLinkKindPrivatePost, "", 67, 0, 12345, "", 0},
		{"tg user", "tg://user?id=42", parsedLinkKindUserByID, "", 0, 0, 0, "", 42},
		{"phone invite is unsupported", "https://t.me/+8613800138000", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"stickers section", "https://t.me/addstickers/durov", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"addemoji section", "https://t.me/addemoji/durov", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"boost section", "https://t.me/boost/durov", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"web app path", "https://t.me/durov/someapp", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"unknown tg command", "tg://unknown/thing", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"hashtag", "#tag", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"javascript scheme", "javascript:alert(1)", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"data scheme", "data:text/html,hello", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"userinfo rejected", "https://t.me@evil.com/durov", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"port rejected", "https://t.me:8443/durov", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
		{"lookalike host external", "https://t.me.evil.com/durov", parsedLinkKindExternal, "", 0, 0, 0, "", 0},
		{"external url", "https://example.com/page", parsedLinkKindExternal, "", 0, 0, 0, "", 0},
		{"empty", "   ", parsedLinkKindUnsupported, "", 0, 0, 0, "", 0},
	}
	for _, testCase := range cases {
		got := classifyTelegramLink(testCase.raw)
		if got.Kind != testCase.wantKind {
			t.Fatalf("%s (%q): kind = %q want %q", testCase.name, testCase.raw, got.Kind, testCase.wantKind)
		}
		if got.Username != testCase.wantUser || got.PostID != testCase.wantPost ||
			got.ThreadID != testCase.wantThread || got.ChannelID != testCase.wantChan ||
			got.InviteHash != testCase.wantHash || got.UserID != testCase.wantUserID {
			t.Fatalf("%s (%q): unexpected parse %+v", testCase.name, testCase.raw, got)
		}
	}
}

func TestNormalizeInviteHash(t *testing.T) {
	cases := map[string]string{
		"abcDEF123":                     "abcDEF123",
		"+abcDEF123":                    "abcDEF123",
		"https://t.me/+abcDEF123":       "abcDEF123",
		"https://t.me/joinchat/abcDEF1": "abcDEF1",
		"t.me/joinchat/abcDEF1":         "abcDEF1",
		"tg://join?invite=abcDEF123":    "abcDEF123",
		"tg://joinchat?invite=abcDEF1":  "abcDEF1",
		"abcDEF123?start=1":             "abcDEF123",
		"":                              "",
		"+8613800138000":                "",
		"https://t.me/+8613800138000":   "",
	}
	for raw, want := range cases {
		if got := normalizeInviteHash(raw); got != want {
			t.Fatalf("normalizeInviteHash(%q) = %q want %q", raw, got, want)
		}
	}
}

func TestIsPhoneNumberLink(t *testing.T) {
	if !isPhoneNumberLink("8613800138000") {
		t.Fatalf("expected phone link")
	}
	if isPhoneNumberLink("abcDEF123") || isPhoneNumberLink("1234") || isPhoneNumberLink("12345678901234567") {
		t.Fatalf("false positive phone link")
	}
}
