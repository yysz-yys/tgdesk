package kernel

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tgdesk/internal/paths"
)

// The local snapshot store is the equivalent of the local database official
// clients keep: the UI can paint the last known dialog list and messages before
// the network answers. It is deliberately small and disposable.

type cachedChatsFile struct {
	At    int64     `json:"at"`
	Chats []ChatDTO `json:"chats"`
}

type cachedMessagesFile struct {
	At       int64        `json:"at"`
	ChatID   string       `json:"chatId"`
	Messages []MessageDTO `json:"messages"`
}

const (
	dialogsCacheFile  = "chats.json"
	messagesCacheDir  = "messages"
	maxCachedMessages = 300
)

var cacheWriteMu sync.Mutex

// cacheEpoch invalidates snapshots queued before a logout/clear so they cannot
// reappear under the next account.
var cacheEpoch atomic.Int64

func cacheRoot() string {
	return filepath.Join(paths.Data(), "cache")
}

func messagesCacheRoot() string {
	return filepath.Join(cacheRoot(), messagesCacheDir)
}

func messageCachePath(chatID string) string {
	sum := sha1.Sum([]byte(chatID))
	return filepath.Join(messagesCacheRoot(), hex.EncodeToString(sum[:])+".json")
}

func sanitizeChatsForCache(chats []ChatDTO) []ChatDTO {
	result := make([]ChatDTO, len(chats))
	copy(result, chats)
	for index := range result {
		// Loopback image URLs are tied to a process-local media server; they
		// would 404 next launch, so cached rows start with initials and the
		// network refresh fills the real avatar URLs in.
		result[index].AvatarURL = ""
	}
	return result
}

func sanitizeMessagesForCache(messages []MessageDTO) []MessageDTO {
	result := make([]MessageDTO, len(messages))
	copy(result, messages)
	for index := range result {
		result[index].SenderAvatarURL = ""
		result[index].SenderStatusURL = ""
		if result[index].Media != nil {
			media := *result[index].Media
			media.ThumbURL = ""
			media.PhotoURL = ""
			media.StreamURL = ""
			result[index].Media = &media
		}
	}
	return result
}

func (s *Service) saveCachedChats(chats []ChatDTO) {
	snapshot := sanitizeChatsForCache(chats)
	epoch := cacheEpoch.Load()
	go func() {
		cacheWriteMu.Lock()
		defer cacheWriteMu.Unlock()
		if cacheEpoch.Load() != epoch {
			return
		}
		if err := os.MkdirAll(cacheRoot(), 0o700); err != nil {
			return
		}
		payload, err := json.Marshal(cachedChatsFile{
			At:    time.Now().Unix(),
			Chats: snapshot,
		})
		if err != nil {
			return
		}
		_ = writeFileAtomic(filepath.Join(cacheRoot(), dialogsCacheFile), payload)
	}()
}

func (s *Service) saveCachedMessages(chatID string, messages []MessageDTO) {
	if len(messages) == 0 {
		return
	}
	snapshot := sanitizeMessagesForCache(messages)
	epoch := cacheEpoch.Load()
	go func() {
		cacheWriteMu.Lock()
		defer cacheWriteMu.Unlock()
		if cacheEpoch.Load() != epoch {
			return
		}
		if err := os.MkdirAll(messagesCacheRoot(), 0o700); err != nil {
			return
		}
		payload, err := json.Marshal(cachedMessagesFile{
			At:       time.Now().Unix(),
			ChatID:   chatID,
			Messages: snapshot,
		})
		if err != nil {
			return
		}
		_ = writeFileAtomic(messageCachePath(chatID), payload)
		pruneMessageCacheLocked()
	}()
}

// GetCachedChats returns the last persisted dialog snapshot. It never performs
// network I/O; the frontend paints it and then replaces it with GetChats.
func (s *Service) GetCachedChats() []ChatDTO {
	payload, err := os.ReadFile(filepath.Join(cacheRoot(), dialogsCacheFile))
	if err != nil {
		return nil
	}
	var cached cachedChatsFile
	if err := json.Unmarshal(payload, &cached); err != nil {
		return nil
	}
	return cached.Chats
}

// GetCachedMessages returns the last persisted messages for a chat.
func (s *Service) GetCachedMessages(chatID string) []MessageDTO {
	payload, err := os.ReadFile(messageCachePath(chatID))
	if err != nil {
		return nil
	}
	var cached cachedMessagesFile
	if err := json.Unmarshal(payload, &cached); err != nil {
		return nil
	}
	if cached.ChatID != chatID {
		return nil
	}
	return cached.Messages
}

// ClearLocalCache removes everything in data/cache. Called on logout.
func (s *Service) ClearLocalCache() {
	cacheEpoch.Add(1)
	cacheWriteMu.Lock()
	defer cacheWriteMu.Unlock()
	_ = os.RemoveAll(cacheRoot())
}

func writeFileAtomic(path string, payload []byte) error {
	temp := path + ".tmp"
	if err := os.WriteFile(temp, payload, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, path)
}

func pruneMessageCacheLocked() {
	dir := messagesCacheRoot()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type entry struct {
		path string
		at   time.Time
	}
	files := make([]entry, 0, len(entries))
	for _, item := range entries {
		if item.IsDir() || !strings.HasSuffix(item.Name(), ".json") {
			continue
		}
		info, err := item.Info()
		if err != nil {
			continue
		}
		files = append(files, entry{path: filepath.Join(dir, item.Name()), at: info.ModTime()})
	}
	if len(files) <= maxCachedMessages {
		return
	}
	sort.Slice(files, func(left, right int) bool {
		return files[left].at.After(files[right].at)
	})
	for _, item := range files[maxCachedMessages:] {
		_ = os.Remove(item.path)
	}
}
