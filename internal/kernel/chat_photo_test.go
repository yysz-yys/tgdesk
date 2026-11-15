package kernel

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

func base64Of(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func TestDecodeChatPhoto(t *testing.T) {
	jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'}
	photo, err := decodeChatPhoto(base64Of(jpeg))
	if err != nil {
		t.Fatalf("decodeChatPhoto(jpeg): %v", err)
	}
	if photo.mime != "image/jpeg" || photo.ext != ".jpg" {
		t.Errorf("jpeg format = %q/%q", photo.mime, photo.ext)
	}
	if !bytes.Equal(photo.data, jpeg) {
		t.Errorf("jpeg data = %v, want %v", photo.data, jpeg)
	}

	// The avatar editor hands over a data URL, not bare base64.
	dataURL := "data:image/jpeg;base64," + base64Of(jpeg)
	if photo, err = decodeChatPhoto(dataURL); err != nil || photo.mime != "image/jpeg" {
		t.Fatalf("decodeChatPhoto(data URL) = %#v, %v", photo, err)
	}
	// Surrounding whitespace is tolerated (the frontend may pass a wrapped line).
	if _, err = decodeChatPhoto("  \n" + dataURL + "\n "); err != nil {
		t.Fatalf("decodeChatPhoto(padded data URL): %v", err)
	}

	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 8)...)
	if photo, err = decodeChatPhoto(base64Of(png)); err != nil || photo.mime != "image/png" {
		t.Fatalf("decodeChatPhoto(png) = %#v, %v", photo, err)
	}
	webp := append([]byte("RIFF"), 0, 0, 0, 0)
	webp = append(webp, []byte("WEBPVP8 ")...)
	if photo, err = decodeChatPhoto(base64Of(webp)); err != nil || photo.mime != "image/webp" {
		t.Fatalf("decodeChatPhoto(webp) = %#v, %v", photo, err)
	}

	// An unpadded payload (RawStdEncoding) is accepted as a fallback.
	unpadded := strings.TrimRight(base64Of(jpeg), "=")
	if _, err = decodeChatPhoto(unpadded); err != nil {
		t.Errorf("decodeChatPhoto(unpadded): %v", err)
	}
}

func TestDecodeChatPhotoValidation(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty", input: "", want: "empty"},
		{name: "whitespace", input: "   \n\t", want: "empty"},
		{name: "bad base64", input: "%%%not-base64%%%", want: "base64"},
		{name: "not an image", input: base64Of([]byte("plain text, not a picture")), want: "JPEG"},
		{name: "data URL without payload", input: "data:image/jpeg;base64", want: "data URL"},
		{name: "data URL not base64", input: "data:image/jpeg,abcdef", want: "base64"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, err := decodeChatPhoto(test.input)
			if err == nil {
				t.Fatalf("decodeChatPhoto(%q) returned no error", test.input)
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Errorf("error %q does not mention %q", err, test.want)
			}
		})
	}

	tooLarge := make([]byte, maxChatPhotoBytes+1)
	copy(tooLarge, []byte{0xFF, 0xD8, 0xFF})
	if _, err := decodeChatPhoto(base64Of(tooLarge)); err == nil ||
		!strings.Contains(err.Error(), "10 MB") {
		t.Errorf("oversized photo error = %v, want a 10 MB rejection", err)
	}
}

func TestChatPhotoTargetFor(t *testing.T) {
	channel, err := chatPhotoTargetFor(&tg.InputPeerChannel{ChannelID: 42, AccessHash: -7})
	if err != nil || channel.kind != "channel" || channel.channel.ChannelID != 42 ||
		channel.channel.AccessHash != -7 {
		t.Fatalf("channel target = %#v, %v", channel, err)
	}

	group, err := chatPhotoTargetFor(&tg.InputPeerChat{ChatID: 9})
	if err != nil || group.kind != "chat" || group.chatID != 9 || group.channel != nil {
		t.Fatalf("group target = %#v, %v", group, err)
	}

	if _, err := chatPhotoTargetFor(&tg.InputPeerUser{UserID: 1, AccessHash: 2}); err == nil {
		t.Error("user peer must not have an editable chat photo")
	}
	if _, err := chatPhotoTargetFor(nil); err == nil {
		t.Error("nil peer must be rejected")
	}
}
