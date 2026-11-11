package kernel

import (
	"context"
	"runtime/debug"
	"sync"
	"time"

	tdlclient "github.com/iyear/tdl/pkg/tclient"

	"tgdesk/internal/paths"
)

// Version is the desktop application version. It can be overridden at build
// time with: -ldflags "-X tgdesk/internal/kernel.Version=..."
var Version = "0.1.0"

// PortablePaths is the on-disk layout rooted next to tgdesk.exe.
type PortablePaths struct {
	Root          string `json:"root"`
	Data          string `json:"data"`
	TData         string `json:"tdata"`
	Downloads     string `json:"downloads"`
	WebView       string `json:"webview"`
	DownloadStore string `json:"downloadStore"`
}

// Status is the small, stable DTO the UI uses to show kernel health. Keep it
// free of gotd/tg types: those must not leak outside internal/telegram.
type Status struct {
	AppName        string `json:"appName"`
	AppVersion     string `json:"appVersion"`
	TDLVersion     string `json:"tdlVersion"`
	TDLCoreVersion string `json:"tdlCoreVersion"`
	TDLAppID       int    `json:"tdlAppId"`
	Phase          string `json:"phase"`
	Ready          bool   `json:"ready"`
	StartedAt      string `json:"startedAt"`
}

// ChecklistItem is a single item in the first technical spike. The UI renders
// this list until the real screens are wired up.
type ChecklistItem struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Done   bool   `json:"done"`
}

// Service is the UI-agnostic kernel facade. Wails-facing methods live in
// internal/app; Telegram auth, chat, media and download work stay here.
type Service struct {
	startedAt time.Time
	version   string

	authMu               sync.Mutex
	authCancel           context.CancelFunc
	authDone             chan struct{}
	codeCh               chan string
	passCh               chan string
	authState            string
	authUser             *AuthUser
	tdataImportAttempted bool
	tdataImportErr       error

	eventMu   sync.RWMutex
	eventSink func(AuthEvent)

	chatMu sync.Mutex

	sessionMu sync.Mutex
	session   *telegramSession

	downloadMu      sync.Mutex
	downloadTasks   map[string]*downloadTask
	downloadOrder   []string
	downloadCounter int
	downloadSem     chan struct{}
	downloadSink    func(DownloadEvent)
	lastPersist     time.Time
}

func New(version string) *Service {
	if version == "" {
		version = Version
	}
	s := &Service{
		startedAt:     time.Now(),
		version:       version,
		downloadTasks: make(map[string]*downloadTask),
		downloadSem:   make(chan struct{}, 2),
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

func (s *Service) Status() Status {
	app := tdlclient.Apps[tdlclient.AppDesktop]

	return Status{
		AppName:        "tgdesk",
		AppVersion:     s.version,
		TDLVersion:     moduleVersion("github.com/iyear/tdl"),
		TDLCoreVersion: moduleVersion("github.com/iyear/tdl/core"),
		TDLAppID:       app.AppID,
		Phase:          "desktop",
		Ready:          true,
		StartedAt:      s.startedAt.UTC().Format(time.RFC3339),
	}
}

func (s *Service) Checklist() []ChecklistItem {
	return []ChecklistItem{
		{ID: "wails", Title: "Wails v3 shell runs", Detail: "The desktop window opens and hot reload works.", Done: true},
		{ID: "tdl-import", Title: "tdl modules compile into the kernel", Detail: "pkg/tclient and core/downloader are linked without a fork.", Done: true},
		{ID: "qr-login", Title: "QR/phone/2FA login", Detail: "The kernel runs the real gotd flow and emits auth events.", Done: true},
		{ID: "chats", Title: "Chat list loads", Detail: "Real dialogs and recent messages are mapped to DTOs.", Done: true},
		{ID: "download", Title: "One file downloads with progress", Detail: "core/downloader progress reaches the task panel.", Done: true},
		{ID: "session", Title: "Session survives a restart", Detail: "Reopen tgdesk and stay logged in via the tgdesk KV namespace.", Done: true},
	}
}

func moduleVersion(path string) string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}

	for _, dep := range info.Deps {
		if dep.Path == path {
			if dep.Replace != nil {
				return dep.Replace.Version
			}
			return dep.Version
		}
	}

	return "unknown"
}
