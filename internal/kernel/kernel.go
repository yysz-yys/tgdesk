package kernel

import (
	"context"
	"sync"
	"time"

	"github.com/gotd/td/tg"

	"tgdesk/internal/paths"
)

// PortablePaths is the on-disk layout rooted next to tgdesk.exe.
type PortablePaths struct {
	Root          string `json:"root"`
	Data          string `json:"data"`
	TData         string `json:"tdata"`
	Downloads     string `json:"downloads"`
	WebView       string `json:"webview"`
	DownloadStore string `json:"downloadStore"`
}

// Service is the UI-agnostic kernel facade. Wails-facing methods live in
// internal/app; Telegram auth, chat, media and download work stay here.
type Service struct {
	authMu               sync.Mutex
	authCancel           context.CancelFunc
	authDone             chan struct{}
	codeCh               chan string
	passCh               chan string
	resendCh             chan struct{}
	authState            string
	authUser             *AuthUser
	tdataEnsured         bool
	tdataImportAttempted bool
	tdataImportErr       error

	eventMu   sync.RWMutex
	eventSink func(AuthEvent)

	chatEventMu     sync.RWMutex
	chatEventSink   func(ChatEvent)
	uploadEventMu   sync.RWMutex
	uploadEventSink func(UploadEvent)

	peerIndexMu sync.RWMutex
	peerIndex   map[string]string

	dialogsCacheMu sync.Mutex
	dialogsCache   map[string]dialogsCacheEntry

	chatInfoCacheMu sync.Mutex
	chatInfoCache   map[string]chatInfoCacheEntry

	chatProfileCacheMu sync.Mutex
	chatProfileCache   map[string]chatProfileCacheEntry

	emojiStatusMu    sync.Mutex
	emojiStatusCache map[int64]string

	// Sticker/GIF picker: short-lived list caches plus the opaque document-ref
	// side map. See stickers.go / stickers_media.go.
	stickerCacheMu   sync.Mutex
	stickerSetsCache *stickerSetsCacheEntry
	recentCache      *recentStickersCacheEntry
	stickerSetCache  map[string]stickerSetCacheEntry
	savedGifsCache   *savedGifsCacheEntry

	stickerRefsMu   sync.Mutex
	stickerRefs     map[string]*tg.Document
	stickerRefOrder []string

	chatMu sync.Mutex

	sessionMu sync.Mutex
	session   *telegramSession

	mediaServerMu   sync.Mutex
	mediaBaseURL    string
	mediaStreamBase string
	thumbBase       string
	avatarBase      string
	photoBase       string
	videoStreams    map[string]*videoStreamSession
	imageRefs       *imageRefStore
	images          *imageCache

	mediaConfigMu sync.RWMutex
	mediaProxy    string
	mediaNTP      string

	downloadMu      sync.Mutex
	downloadTasks   map[string]*downloadTask
	downloadOrder   []string
	downloadCounter int
	downloadSem     chan struct{}
	downloadSink    func(DownloadEvent)
	lastPersist     time.Time
}

func New() *Service {
	s := &Service{
		downloadTasks:    make(map[string]*downloadTask),
		downloadSem:      make(chan struct{}, 2),
		imageRefs:        newImageRefStore(2048),
		images:           newImageCache(48 << 20),
		peerIndex:        make(map[string]string),
		dialogsCache:     make(map[string]dialogsCacheEntry),
		chatInfoCache:    make(map[string]chatInfoCacheEntry),
		chatProfileCache: make(map[string]chatProfileCacheEntry),
		emojiStatusCache: make(map[int64]string),
		stickerSetCache:  make(map[string]stickerSetCacheEntry),
		stickerRefs:      make(map[string]*tg.Document),
	}
	s.loadDownloadTasks()
	return s
}

// SetEventSink wires the UI event bridge. The kernel stays independent from
// Wails; internal/app supplies the actual emitter.
func (s *Service) SetEventSink(sink func(AuthEvent)) {
	s.eventMu.Lock()
	s.eventSink = sink
	s.eventMu.Unlock()
}

func (s *Service) Paths() PortablePaths {
	return PortablePaths{
		Root:          paths.Root(),
		Data:          paths.Data(),
		TData:         paths.TData(),
		Downloads:     paths.Downloads(),
		WebView:       paths.WebView(),
		DownloadStore: paths.DownloadStore(),
	}
}
