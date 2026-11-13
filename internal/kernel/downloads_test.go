package kernel

import (
	"errors"
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
		"photo":      "图片",
		"video":      "视频",
		"video_note": "视频",
		"animation":  "动图",
		"audio":      "音频",
		"voice":      "语音",
		"sticker":    "贴纸",
		"file":       "文件",
		"webpage":    "文件",
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
	wantDir := filepath.Join(task.dir, "图片")
	if filepath.Dir(path) != wantDir {
		t.Fatalf("task path dir = %q, want %q", filepath.Dir(path), wantDir)
	}
	if !strings.Contains(filepath.Base(path), "42") || !strings.HasSuffix(path, ".jpg") {
		t.Fatalf("unexpected task path %q", path)
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
