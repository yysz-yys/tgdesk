package kernel

import (
	"errors"
	"testing"

	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

func TestNormalizePhone(t *testing.T) {
	cases := map[string]string{
		"+86 138 0013 8000":  "+8613800138000",
		"(+1) 555-0100":      "+15550100",
		"  +7 999 123-45-67": "+79991234567",
	}
	for input, want := range cases {
		if got := normalizePhone(input); got != want {
			t.Errorf("normalizePhone(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestMakeAuthUser(t *testing.T) {
	user := makeAuthUser(&tg.User{
		ID:        42,
		FirstName: "Ada",
		LastName:  "Lovelace",
		Username:  "ada",
	})

	if user.DisplayName != "Ada Lovelace" {
		t.Fatalf("DisplayName = %q", user.DisplayName)
	}
	if user.Initials != "AL" {
		t.Fatalf("Initials = %q", user.Initials)
	}
	if user.Username != "ada" {
		t.Fatalf("Username = %q", user.Username)
	}
	if user.Color == "" {
		t.Fatal("Color is empty")
	}
}

func TestMakeAuthUserFallsBackToUsername(t *testing.T) {
	user := makeAuthUser(&tg.User{ID: 7, Username: "solo"})
	if user.DisplayName != "solo" {
		t.Fatalf("DisplayName = %q", user.DisplayName)
	}
	if user.Initials != "S" {
		t.Fatalf("Initials = %q", user.Initials)
	}
}

func TestResolveAuthProxy(t *testing.T) {
	for _, name := range []string{
		"HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy",
	} {
		t.Setenv(name, "")
	}

	if got := resolveAuthProxy(""); got != "" {
		t.Fatalf("empty proxy = %q", got)
	}
	if got := resolveAuthProxy("127.0.0.1:7897"); got != "http://127.0.0.1:7897" {
		t.Fatalf("explicit proxy = %q", got)
	}

	t.Setenv("HTTP_PROXY", "127.0.0.1:7890")
	if got := resolveAuthProxy(""); got != "http://127.0.0.1:7890" {
		t.Fatalf("env proxy = %q", got)
	}

	if got := resolveAuthProxy("socks5://127.0.0.1:1080"); got != "socks5://127.0.0.1:1080" {
		t.Fatalf("scheme proxy = %q", got)
	}
}

func TestClassifyAuthErrorFloodWait(t *testing.T) {
	code, retryAfter, message := classifyAuthError(tgerr.New(420, "FLOOD_WAIT_42"))
	if code != "FLOOD_WAIT" {
		t.Fatalf("code = %q", code)
	}
	if retryAfter != 42 {
		t.Fatalf("retryAfter = %d", retryAfter)
	}
	if message == "" {
		t.Fatal("message is empty")
	}
}

func TestClassifyAuthErrorCode(t *testing.T) {
	for _, want := range []string{"PHONE_NUMBER_INVALID", "PHONE_CODE_INVALID", "PASSWORD_HASH_INVALID"} {
		code, _, _ := classifyAuthError(tgerr.New(400, want))
		if code != want {
			t.Fatalf("code = %q, want %q", code, want)
		}
	}
}

func TestClassifyAuthErrorNetwork(t *testing.T) {
	code, _, _ := classifyAuthError(errors.New("dial tcp 127.0.0.1:443: connect: connection refused"))
	if code != "NETWORK" {
		t.Fatalf("code = %q", code)
	}
}

func TestLoginCodeTypes(t *testing.T) {
	cases := []struct {
		typ    tg.AuthSentCodeTypeClass
		want   string
		length int
	}{
		{&tg.AuthSentCodeTypeApp{Length: 5}, "app", 5},
		{&tg.AuthSentCodeTypeSMS{Length: 6}, "sms", 6},
		{&tg.AuthSentCodeTypeCall{Length: 5}, "call", 5},
		{&tg.AuthSentCodeTypeFlashCall{Pattern: "*123*"}, "flash_call", 0},
	}
	for _, test := range cases {
		sent := &tg.AuthSentCode{Type: test.typ}
		codeType, length := tdesktopCodeInfo(sent)
		if codeType != test.want || length != test.length {
			t.Fatalf("type=%T got (%q,%d), want (%q,%d)", test.typ, codeType, length, test.want, test.length)
		}
	}
}
