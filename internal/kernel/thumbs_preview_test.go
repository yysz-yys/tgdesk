package kernel

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"image/jpeg"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

func TestStrippedThumbJPEGRebuildsFrame(t *testing.T) {
	payload := []byte{0x01, 0x24, 0x37, 0x11, 0x22, 0x33, 0x44}
	jpeg := strippedThumbJPEG(payload)
	if len(jpeg) != len(strippedJPEGHeader)+len(payload)-3+len(strippedJPEGTail) {
		t.Fatalf("rebuilt length = %d", len(jpeg))
	}
	if jpeg[0] != 0xff || jpeg[1] != 0xd8 {
		t.Fatalf("preview does not start with a JPEG SOI marker: % x", jpeg[:2])
	}
	if jpeg[len(jpeg)-2] != 0xff || jpeg[len(jpeg)-1] != 0xd9 {
		t.Fatalf("preview does not end with a JPEG EOI marker: % x", jpeg[len(jpeg)-2:])
	}
	if jpeg[164] != 0x24 || jpeg[166] != 0x37 {
		t.Fatalf("quantisation patch bytes = % x / % x", jpeg[164], jpeg[166])
	}
	if !strings.Contains(string(jpeg), string(payload[3:])) {
		t.Fatal("rebuilt preview does not carry the stripped payload body")
	}
}

func TestStrippedThumbJPEGPassesCompleteJPEGThrough(t *testing.T) {
	payload := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9}
	got := strippedThumbJPEG(payload)
	if len(got) != len(payload) || got[0] != 0xff || got[1] != 0xd8 {
		t.Fatalf("complete JPEG was not returned unchanged: % x", got)
	}
}

func TestStrippedThumbJPEGRejectsTruncatedMarker(t *testing.T) {
	if got := strippedThumbJPEG([]byte{0x01, 0x24}); got != nil {
		t.Fatalf("truncated stripped payload produced %d bytes", len(got))
	}
}

// A real photoStrippedSize payload captured from a 40x40 photo message. The
// frame rebuilt from it must be a real JPEG, exactly what the WebView paints as
// the instant blurred preview.
const realStrippedPayloadHex = "012828d6a6cb2a431979182a8ef4faaf78eab0ec2db59fe55e327f2a00ce7d4cfdb43ab9f2338db8edeb5ab0cd1ce9be26dcb5cf6cb50dccd21fa27ff5eb72c645920c02c590ed6dc306a981628a5a2a40696017713c567c12f9b24979302110111fa014f7b98c43fbf6e3a6cedffd7accb9bb69504318db10edeb5a288da2a925989f539add91845225ec6098dc01263d3b1ac3fe556ed2f1a006190ee84f18c74a6e2c46ea488e81d4e54f20d159af2ffa38fb3e31d8668a5c85f2994f2b4afb98e4f6a4072734515a4590276a534515421525789b72360f7a28a2b26c7767"

func TestStrippedThumbJPEGDecodesAsJPEG(t *testing.T) {
	payload, err := hex.DecodeString(realStrippedPayloadHex)
	if err != nil {
		t.Fatalf("decode payload fixture: %v", err)
	}
	rebuilt := strippedThumbJPEG(payload)
	if len(rebuilt) == 0 {
		t.Fatal("stripped payload produced no JPEG")
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(rebuilt))
	if err != nil {
		t.Fatalf("rebuilt preview is not a decodable JPEG: %v", err)
	}
	if config.Width != 40 || config.Height != 40 {
		t.Fatalf("preview dimensions = %dx%d, want 40x40", config.Width, config.Height)
	}
}

func TestPhotoInlinePreviewPrefersCachedSize(t *testing.T) {
	cached := []byte{0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9}
	photo := &tg.Photo{Sizes: []tg.PhotoSizeClass{
		&tg.PhotoStrippedSize{Type: "i", Bytes: []byte{0x01, 0x24, 0x37, 0xaa}},
		&tg.PhotoCachedSize{Type: "e", Bytes: cached},
	}}
	got := photoInlinePreview(photo)
	if len(got) != len(cached) || got[2] != 0x01 || got[3] != 0x02 {
		t.Fatalf("inline preview = % x, want the cached JPEG", got)
	}
}

func TestMessagePlaceholderURLIsInlineJPEG(t *testing.T) {
	msg := &tg.Message{Media: &tg.MessageMediaPhoto{Photo: &tg.Photo{
		Sizes: []tg.PhotoSizeClass{
			&tg.PhotoStrippedSize{Type: "i", Bytes: []byte{0x01, 0x24, 0x37, 0x0a, 0x0b}},
		},
	}}}
	url := messagePlaceholderURL(msg)
	const prefix = "data:image/jpeg;base64,"
	if !strings.HasPrefix(url, prefix) {
		t.Fatalf("placeholder = %q, want a JPEG data URL", url)
	}
	jpeg, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(url, prefix))
	if err != nil {
		t.Fatalf("placeholder base64: %v", err)
	}
	if len(jpeg) < 4 || jpeg[0] != 0xff || jpeg[1] != 0xd8 || jpeg[len(jpeg)-1] != 0xd9 {
		t.Fatalf("placeholder is not a complete JPEG: % x", jpeg)
	}
}

func TestMessagePlaceholderURLSkipsTextMessages(t *testing.T) {
	if got := messagePlaceholderURL(&tg.Message{Message: "hello"}); got != "" {
		t.Fatalf("text message placeholder = %q, want empty", got)
	}
}

func TestDocumentInlinePreviewUsesStrippedThumb(t *testing.T) {
	doc := &tg.Document{Thumbs: []tg.PhotoSizeClass{
		&tg.PhotoSize{Type: "m", W: 320, H: 180, Size: 1234},
		&tg.PhotoStrippedSize{Type: "i", Bytes: []byte{0x01, 0x24, 0x37, 0x0c}},
	}}
	got := documentInlinePreview(doc)
	if len(got) == 0 || got[0] != 0xff || got[1] != 0xd8 {
		t.Fatalf("document inline preview = % x, want a rebuilt JPEG", got)
	}
}
