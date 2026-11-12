package kernel

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tgdesk/internal/paths"
)

func TestMediaHTTPURLServesRanges(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	s := New()

	dir := filepath.Join(paths.Data(), "media")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	payload := []byte("0123456789abcdefghij")
	if err := os.WriteFile(filepath.Join(dir, "clip.mp4"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	url, err := s.mediaHTTPURL("clip.mp4")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(url, "http://127.0.0.1:") {
		t.Fatalf("unexpected media URL %q", url)
	}

	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Range", "bytes=10-14")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "abcde" {
		t.Fatalf("body = %q, want abcde", body)
	}
}
