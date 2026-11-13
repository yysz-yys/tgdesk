package kernel

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

func TestUploadFileDataTrimsFinalPart(t *testing.T) {
	data, err := uploadFileData(&tg.UploadFile{Bytes: []byte("0123456789")}, 4)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "0123" {
		t.Fatalf("trimmed data = %q, want %q", data, "0123")
	}

	data, err = uploadFileData(&tg.UploadFile{Bytes: []byte("0123456789")}, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 10 {
		t.Fatalf("untrimmed data length = %d, want 10", len(data))
	}

	if _, err := uploadFileData(&tg.UploadFile{Bytes: nil}, 10); err == nil {
		t.Fatal("empty upload file accepted")
	}
	if _, err := uploadFileData(&tg.UploadFileCDNRedirect{}, 10); !errors.Is(err, errCDNRedirect) {
		t.Fatalf("CDN redirect error = %v, want errCDNRedirect", err)
	}
}

func TestDownloadCategoryFolder(t *testing.T) {
	cases := map[string]string{
		"photo":      "Images",
		"video":      "Videos",
		"video_note": "Videos",
		"animation":  "GIFs",
		"audio":      "Audio",
		"voice":      "Voice",
		"sticker":    "Stickers",
		"file":       "Files",
		"webpage":    "Files",
	}
	for kind, want := range cases {
		if got := downloadCategoryFolder(kind); got != want {
			t.Errorf("downloadCategoryFolder(%q) = %q, want %q", kind, got, want)
		}
	}
}

func TestTaskPathAddsCategoryFolder(t *testing.T) {
	service := New()
	service.downloadCounter = 1
	task := &downloadTask{
		dto:       DownloadTaskDTO{ID: "dl-1"},
		chatID:    "channel:1674095127:-4878409943740838065",
		messageID: 42,
		dir:       t.TempDir(),
		template:  "{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}",
	}
	media := &tmedia.Media{Name: "图片.jpg", Size: 10}
	msg := &tg.Message{ID: 42, Date: 1700000000, Message: ""}
	path, err := taskPath(task, media, msg, "photo")
	if err != nil {
		t.Fatal(err)
	}
	wantDir := filepath.Join(task.dir, "Images")
	if filepath.Dir(path) != wantDir {
		t.Fatalf("task path dir = %q, want %q", filepath.Dir(path), wantDir)
	}
	if !strings.Contains(filepath.Base(path), "42") || !strings.HasSuffix(path, ".jpg") {
		t.Fatalf("unexpected task path %q", path)
	}
}

func TestGetDownloadsForgetsMissingFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Images", "photo.jpg")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("image"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := New()
	service.downloadTasks = map[string]*downloadTask{
		"dl-1": {
			dto: DownloadTaskDTO{
				ID:        "dl-1",
				Status:    downloadDone,
				Path:      path,
				ChatID:    "channel:1:2",
				MessageID: 10,
			},
		},
	}
	service.downloadOrder = []string{"dl-1"}

	if got := service.GetDownloads(); len(got) != 1 || got[0].Status != downloadDone {
		t.Fatalf("existing file marked %#v, want one done task", got)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if got := service.GetDownloads(); len(got) != 0 {
		t.Fatalf("missing file kept %d stale tasks, want none", len(got))
	}
}

func TestValidateDownloadForgetsMissingFile(t *testing.T) {
	service := New()
	service.downloadTasks = map[string]*downloadTask{
		"dl-1": {
			dto: DownloadTaskDTO{
				ID:        "dl-1",
				Status:    downloadDone,
				Path:      filepath.Join(t.TempDir(), "gone.jpg"),
				ChatID:    "channel:1:2",
				MessageID: 10,
			},
		},
	}
	service.downloadOrder = []string{"dl-1"}
	exists, err := service.ValidateDownload("dl-1")
	if err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("ValidateDownload reported a missing file as present")
	}
	if _, ok := service.downloadTasks["dl-1"]; ok {
		t.Fatal("missing done task was not forgotten")
	}
	if exists, err := service.ValidateDownload("missing"); err != nil || exists {
		t.Fatalf("unknown task validate = %v/%v, want false/nil", exists, err)
	}
}

func TestUniqueDownloadPath(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(first, []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	second := uniqueDownloadPath(first)
	if second != filepath.Join(dir, "clip (2).mp4") {
		t.Fatalf("second path = %q", second)
	}
	if err := os.WriteFile(second, []byte("two"), 0o644); err != nil {
		t.Fatal(err)
	}
	third := uniqueDownloadPath(first)
	if third != filepath.Join(dir, "clip (3).mp4") {
		t.Fatalf("third path = %q", third)
	}
}

func TestFindDownloadTaskLocked(t *testing.T) {
	service := New()
	service.downloadTasks = map[string]*downloadTask{
		"dl-1": {
			dto:       DownloadTaskDTO{ID: "dl-1", Status: downloadPaused},
			chatID:    "channel:1:2",
			messageID: 10,
		},
		"dl-2": {
			dto:       DownloadTaskDTO{ID: "dl-2", Status: downloadDone},
			chatID:    "channel:1:2",
			messageID: 11,
		},
	}
	if task := service.findDownloadTaskLocked("channel:1:2", 10); task == nil || task.dto.ID != "dl-1" {
		t.Fatalf("find paused task = %#v", task)
	}
	if task := service.findDownloadTaskLocked("channel:1:2", 99); task != nil {
		t.Fatalf("unexpected task %#v", task)
	}
	if task := service.findDownloadTaskLocked("user:1:2", 10); task != nil {
		t.Fatalf("found task for wrong chat: %#v", task)
	}
}
