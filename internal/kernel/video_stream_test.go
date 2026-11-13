package kernel

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/iyear/tdl/core/tmedia"
)

func TestParseByteRange(t *testing.T) {
	tests := []struct {
		header  string
		size    int64
		start   int64
		end     int64
		partial bool
		ok      bool
	}{
		{"", 100, 0, 99, false, true},
		{"bytes=0-9", 100, 0, 9, true, true},
		{"bytes=10-", 100, 10, 99, true, true},
		{"bytes=-10", 100, 90, 99, true, true},
		{"bytes=0-999", 100, 0, 99, true, true},
		{"bytes=100-", 100, 0, 0, false, false},
		{"items=0-1", 100, 0, 0, false, false},
		{"bytes=0-1,4-5", 100, 0, 0, false, false},
	}
	for _, test := range tests {
		start, end, partial, err := parseByteRange(test.header, test.size)
		if (err == nil) != test.ok {
			t.Fatalf("%q: err = %v, want ok=%v", test.header, err, test.ok)
		}
		if err == nil && (start != test.start || end != test.end || partial != test.partial) {
			t.Fatalf("%q = %d-%d partial=%v, want %d-%d partial=%v",
				test.header, start, end, partial, test.start, test.end, test.partial)
		}
	}
}

func TestGrowingFileServesRange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "clip.mp4")
	payload := []byte("0123456789abcdefghij")
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	session := &videoStreamSession{
		media: &tmedia.Media{Name: "clip.mp4", Size: int64(len(payload))},
		file:  file,
	}
	session.cond = sync.NewCond(&session.mu)
	session.markWritten(0, len(payload))
	session.finish(nil)

	request := httptest.NewRequest("GET", "/stream/test", nil)
	request.Header.Set("Range", "bytes=10-14")
	response := httptest.NewRecorder()
	session.serveGrowingFile(response, request)

	if response.Code != 206 {
		t.Fatalf("status = %d", response.Code)
	}
	if strings.TrimSpace(response.Body.String()) != "abcde" {
		t.Fatalf("body = %q", response.Body.String())
	}
	if got := response.Header().Get("Content-Range"); got != "bytes 10-14/20" {
		t.Fatalf("content-range = %q", got)
	}
}
