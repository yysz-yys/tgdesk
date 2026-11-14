package kernel

import (
	"strings"
	"testing"

	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

func TestValidateWebAppURL(t *testing.T) {
	valid := []string{
		"https://example.com/app",
		"http://example.com/app?x=1#frag",
	}
	for _, raw := range valid {
		if err := validateWebAppURL(raw); err != nil {
			t.Errorf("%q rejected: %v", raw, err)
		}
	}
	invalid := []string{
		"",
		"javascript:alert(1)",
		"tg://resolve?domain=bot",
		"file:///C:/secret.txt",
		"/relative/path",
		"https://",
	}
	for _, raw := range invalid {
		if err := validateWebAppURL(raw); err == nil {
			t.Errorf("%q accepted", raw)
		}
	}
}

func TestReadableRPCError(t *testing.T) {
	timeout := readableRPCError("bot callback", tgerr.New(400, tg.ErrBotResponseTimeout))
	if !strings.Contains(timeout.Error(), "not responding") {
		t.Fatalf("timeout error = %q", timeout.Error())
	}
	invalidButton := readableRPCError("bot callback", tgerr.New(400, tg.ErrButtonDataInvalid))
	if !strings.Contains(invalidButton.Error(), "no longer valid") {
		t.Fatalf("button error = %q", invalidButton.Error())
	}
	flood := readableRPCError("pin chat", tgerr.New(420, "FLOOD_WAIT_7"))
	if !strings.Contains(flood.Error(), "retry in 7 seconds") {
		t.Fatalf("flood error = %q", flood.Error())
	}
	plain := readableRPCError("pin chat", tgerr.New(400, "SOMETHING_ELSE"))
	if !strings.Contains(plain.Error(), "SOMETHING_ELSE") || !strings.Contains(plain.Error(), "pin chat") {
		t.Fatalf("generic error = %q", plain.Error())
	}
}
