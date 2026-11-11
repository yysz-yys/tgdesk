package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
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
