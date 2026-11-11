package kernel

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"tgdesk/internal/paths"
)

type persistedDownload struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Chat       string `json:"chat"`
	Size       string `json:"size"`
	Status     string `json:"status"`
	Ext        string `json:"ext"`
	Color      string `json:"color"`
	Error      string `json:"error,omitempty"`
	Path       string `json:"path,omitempty"`
	TempPath   string `json:"tempPath,omitempty"`
	Progress   int    `json:"progress"`
	ChatID     string `json:"chatId"`
	MessageID  int    `json:"messageId"`
	Dir        string `json:"dir"`
	Template   string `json:"template"`
	Threads    int    `json:"threads"`
	Total      int64  `json:"total,omitempty"`
	Downloaded int64  `json:"downloaded,omitempty"`
	Created    int64  `json:"created"`
}

type persistedDownloadStore struct {
	Counter int                 `json:"counter"`
	Tasks   []persistedDownload `json:"tasks"`
}

func downloadStorePath() string {
	target := paths.DownloadStore()
	if _, err := os.Stat(target); os.IsNotExist(err) {
		if configDir, configErr := os.UserConfigDir(); configErr == nil {
			legacy := filepath.Join(configDir, "tgdesk", "downloads.json")
			if data, readErr := os.ReadFile(legacy); readErr == nil {
				_ = os.MkdirAll(filepath.Dir(target), 0o700)
				_ = os.WriteFile(target, data, 0o600)
			}
		}
	}
	return target
}

func (s *Service) loadDownloadTasks() {
	path := downloadStorePath()
	if path == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var store persistedDownloadStore
	if err := json.Unmarshal(data, &store); err != nil {
		return
	}

	tasks := make(map[string]*downloadTask, len(store.Tasks))
	order := make([]string, 0, len(store.Tasks))
	for _, item := range store.Tasks {
		if item.ID == "" || item.ChatID == "" || item.MessageID <= 0 {
			continue
		}
		status := item.Status
		switch status {
		case downloadActive, downloadQueued:
			status = downloadPaused
		case downloadPaused, downloadFailed, downloadDone:
		default:
			status = downloadPaused
		}

		tempPath := item.TempPath
		if tempPath == "" && item.Path != "" {
			tempPath = item.Path + downloadTempExt
		}
		downloaded := item.Downloaded
		if info, statErr := os.Stat(tempPath); statErr == nil && status != downloadDone {
			downloaded = info.Size()
		}
		total := item.Total
		if total > 0 {
			if downloaded > total {
				downloaded = total
			}
			item.Progress = int(downloaded * 100 / total)
		}
		if status == downloadDone && item.Path != "" {
			if _, statErr := os.Stat(item.Path); statErr != nil {
				status = downloadFailed
				item.Error = "downloaded file is missing"
			}
		}

		dto := DownloadTaskDTO{
			ID:       item.ID,
			Name:     item.Name,
			Chat:     item.Chat,
			Size:     item.Size,
			Progress: item.Progress,
			Status:   status,
			Ext:      item.Ext,
			Color:    item.Color,
			Error:    item.Error,
			Path:     item.Path,
		}
		tasks[item.ID] = &downloadTask{
			dto:        dto,
			chatID:     item.ChatID,
			messageID:  item.MessageID,
			dir:        item.Dir,
			template:   item.Template,
			threads:    item.Threads,
			total:      total,
			downloaded: downloaded,
			tempPath:   tempPath,
			created:    item.Created,
		}
		order = append(order, item.ID)
	}

	s.downloadMu.Lock()
	s.downloadTasks = tasks
	s.downloadOrder = order
	s.downloadCounter = store.Counter
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()
}

// persistDownloadsLocked writes a small JSON snapshot. It is called with
// downloadMu held; progress updates are throttled, status changes force a write.
func (s *Service) persistDownloadsLocked(force bool) {
	if !force && time.Since(s.lastPersist) < time.Second {
		return
	}
	path := downloadStorePath()
	if path == "" {
		return
	}

	store := persistedDownloadStore{Counter: s.downloadCounter}
	for _, id := range s.downloadOrder {
		task := s.downloadTasks[id]
		if task == nil {
			continue
		}
		store.Tasks = append(store.Tasks, persistedDownload{
			ID:         task.dto.ID,
			Name:       task.dto.Name,
			Chat:       task.dto.Chat,
			Size:       task.dto.Size,
			Status:     task.dto.Status,
			Ext:        task.dto.Ext,
			Color:      task.dto.Color,
			Error:      task.dto.Error,
			Path:       task.dto.Path,
			TempPath:   task.tempPath,
			Progress:   task.dto.Progress,
			ChatID:     task.chatID,
			MessageID:  task.messageID,
			Dir:        task.dir,
			Template:   task.template,
			Threads:    task.threads,
			Total:      task.total,
			Downloaded: task.downloaded,
			Created:    task.created,
		})
	}

	data, err := json.Marshal(store)
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
	s.lastPersist = time.Now()
}

func (s *Service) persistDownloads(force bool) {
	s.downloadMu.Lock()
	s.persistDownloadsLocked(force)
	s.downloadMu.Unlock()
}
