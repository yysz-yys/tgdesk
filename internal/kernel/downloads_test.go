package kernel

import (
	"errors"
	"testing"

	"github.com/gotd/td/tg"
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
