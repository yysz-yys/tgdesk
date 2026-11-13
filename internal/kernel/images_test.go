package kernel

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

func TestMediaRefIDIsStable(t *testing.T) {
	media := &tmedia.Media{
		InputFileLoc: &tg.InputPhotoFileLocation{
			ID:            7,
			AccessHash:    9,
			FileReference: []byte("ref"),
			ThumbSize:     "m",
		},
		Name: "7_m.jpg",
		Size: 1234,
		DC:   2,
	}
	first := mediaRefID(media)
	second := mediaRefID(media)
	if first != second {
		t.Fatalf("mediaRefID is not stable: %q vs %q", first, second)
	}
	other := *media
	other.Size = 555
	if mediaRefID(&other) == first {
		t.Fatal("different media should produce different refs")
	}
}

func TestImageCacheEvictsLeastRecentlyAdded(t *testing.T) {
	cache := newImageCache(6)
	cache.put("a", []byte("1234"), "image/jpeg", 0)
	cache.put("b", []byte("5678"), "image/jpeg", 0)
	if _, ok := cache.get("a"); ok {
		t.Fatal("oldest entry a should have been evicted")
	}
	if _, ok := cache.get("b"); !ok {
		t.Fatal("b should still be cached")
	}
	// Replacing an existing key must not double count its bytes or leave a
	// stale order entry that evicts the fresh value later.
	cache.put("b", []byte("xy"), "image/jpeg", 0)
	if cache.bytes != 2 {
		t.Fatalf("bytes after replace = %d, want 2", cache.bytes)
	}
	cache.put("c", []byte("123"), "image/jpeg", 0)
	if cache.bytes != 5 {
		t.Fatalf("bytes after second insert = %d, want 5", cache.bytes)
	}
}

func TestImageCacheExpires(t *testing.T) {
	cache := newImageCache(1024)
	cache.put("avatar", nil, "", time.Millisecond)
	time.Sleep(5 * time.Millisecond)
	if _, ok := cache.get("avatar"); ok {
		t.Fatal("expired entry should not be returned")
	}
}

func TestImageRefStoreEvicts(t *testing.T) {
	store := newImageRefStore(2)
	first := &imageRef{media: &tmedia.Media{Name: "a.jpg", Size: 1, DC: 2}}
	second := &imageRef{media: &tmedia.Media{Name: "b.jpg", Size: 1, DC: 2}}
	third := &imageRef{media: &tmedia.Media{Name: "c.jpg", Size: 1, DC: 2}}
	firstID := store.put(first)
	store.put(second)
	store.put(third)
	if store.get(firstID) != nil {
		t.Fatal("oldest ref should have been evicted")
	}
	if len(store.refs) != 2 {
		t.Fatalf("ref count = %d, want 2", len(store.refs))
	}
}

func TestImageRoutesRejectUnknownRefs(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	s := New()
	base := s.avatarURL("user:1:2")
	if base == "" || !strings.HasPrefix(base, "http://127.0.0.1:") {
		t.Fatalf("unexpected avatar URL %q", base)
	}

	for _, url := range []string{
		base + "unknown",
		strings.Replace(base, "/avatar/", "/thumb/", 1) + "unknown",
		strings.Replace(base, "/avatar/", "/photo/", 1) + "unknown",
	} {
		response, err := http.Get(url)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: status = %d, want 404", url, response.StatusCode)
		}
	}
}

func TestMediaMime(t *testing.T) {
	tests := map[string]string{
		"photo.jpg":    "image/jpeg",
		"sticker.webp": "image/webp",
		"unknown.bin":  "",
	}
	for name, want := range tests {
		if got := mediaMime(&tmedia.Media{Name: name}); got != want {
			t.Fatalf("mediaMime(%q) = %q, want %q", name, got, want)
		}
	}
}
