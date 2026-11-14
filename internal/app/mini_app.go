package app

import (
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// MiniAppWindowName is the Wails window name of the detached bot mini-app.
const MiniAppWindowName = "mini-app"

// miniAppSessionPayload is the serialized state handed to the local wrapper
// page. It is stored per window session and fetched once by
// TakeMiniAppState; the wrapper embeds the authenticated mini-app URL in a
// sandboxed iframe and never navigates the Wails window itself to it.
type miniAppSessionPayload struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	BotName   string `json:"botName,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

// miniAppManager owns the single mini-app window, mirroring the media viewer:
// one window is reused for every launch and the session map keeps exactly the
// payload the wrapper is currently showing.
type miniAppManager struct {
	mu       sync.Mutex
	sessions map[string]string
	window   *application.WebviewWindow
}

func newMiniAppManager() *miniAppManager {
	return &miniAppManager{sessions: map[string]string{}}
}

// OpenBotWebView launches a bot mini app for the given button/menu. The kernel
// resolves the authenticated URL through messages.requestWebView; if that call
// fails (plain/simple webview buttons, bots without an inline context) the raw
// URL passed by the caller is opened instead, so "simple webview" buttons still
// work. The window always loads our local wrapper page, never the remote URL.
func (s *Service) OpenBotWebView(
	chatID, botPeerID string,
	messageID int,
	url string,
	fromBotMenu bool,
	title string,
	proxy, ntp string,
) error {
	webAppURL := ""
	webView, err := s.kernel.RequestBotWebView(chatID, botPeerID, messageID, url, fromBotMenu, proxy, ntp)
	if err == nil && webView != nil && webView.URL != "" {
		webAppURL = webView.URL
	} else {
		if err != nil {
			log.Printf("bot web app request failed, falling back to raw url: %v", err)
		}
		webAppURL = strings.TrimSpace(url)
		if !isHTTPWebAppURL(webAppURL) {
			if err != nil {
				return err
			}
			return errors.New("invalid mini app url")
		}
	}
	return s.openMiniAppWindow(webAppURL, title)
}

// OpenMiniApp opens a raw (unauthenticated) http(s) URL in the mini-app window.
// It serves simple-webview buttons (kind "webview_simple") which must not call
// messages.requestWebView, and is the fallback entry point for plain URLs.
func (s *Service) OpenMiniApp(url, title string) error {
	url = strings.TrimSpace(url)
	if !isHTTPWebAppURL(url) {
		return errors.New("invalid mini app url")
	}
	return s.openMiniAppWindow(url, title)
}

// openMiniAppWindow stores a session payload and shows the window, reusing the
// existing one when it is already open.
func (s *Service) openMiniAppWindow(rawURL, title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Mini App"
	}
	wailsApp := application.Get()
	if wailsApp == nil {
		return errors.New("application not available")
	}
	payload, err := json.Marshal(miniAppSessionPayload{
		URL:     rawURL,
		Title:   title,
		BotName: title,
	})
	if err != nil {
		return err
	}
	session, err := randomSessionID()
	if err != nil {
		return err
	}

	manager := s.miniApp
	manager.mu.Lock()
	manager.sessions = map[string]string{session: string(payload)}
	existing := manager.window
	manager.mu.Unlock()

	pageURL := "/miniapp.html?session=" + session
	if existing != nil {
		existing.SetURL(pageURL)
		existing.Show()
		existing.UnMinimise()
		existing.Focus()
		return nil
	}

	width, height := miniAppWindowSize(wailsApp)
	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:            MiniAppWindowName,
		Title:           title,
		Frameless:       true,
		Width:           width,
		Height:          height,
		MinWidth:        328,
		MinHeight:       420,
		InitialPosition: application.WindowCentered,
		StartState:      application.WindowStateNormal,
		// Per-pixel alpha so the wrapper page's 24px Telegram Web K corner
		// radius renders without dark wedges (WebView2 transparent background).
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		URL:              pageURL,
	})
	window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		manager.mu.Lock()
		if manager.window == window {
			manager.window = nil
		}
		manager.sessions = map[string]string{}
		manager.mu.Unlock()
		// Hand focus back to the chat window the mini app was opened from.
		if main, ok := wailsApp.Window.Get("main"); ok {
			main.Show()
			main.Focus()
		}
	})
	manager.mu.Lock()
	manager.window = window
	manager.mu.Unlock()
	return nil
}

// TakeMiniAppState returns the serialized mini-app payload for a session. The
// wrapper page calls it once on load; the entry stays until the window closes
// so a dev/HMR reload can still restore the app.
func (s *Service) TakeMiniAppState(session string) string {
	s.miniApp.mu.Lock()
	defer s.miniApp.mu.Unlock()
	return s.miniApp.sessions[session]
}

// miniAppWindowSize is Telegram Web K's 480x688 mini-app size clamped to 90% of
// the primary work area. Wails window sizes are DIPs, so the work area can be
// used directly (same assumption as the media viewer).
func miniAppWindowSize(wailsApp *application.App) (int, int) {
	width, height := 480, 688
	if screen := wailsApp.Screen.GetPrimary(); screen != nil {
		maxWidth := int(float64(screen.WorkArea.Width) * 0.9)
		maxHeight := int(float64(screen.WorkArea.Height) * 0.9)
		if width > maxWidth {
			width = maxWidth
		}
		if height > maxHeight {
			height = maxHeight
		}
	}
	if width < 328 {
		width = 328
	}
	if height < 420 {
		height = 420
	}
	return width, height
}

// isHTTPWebAppURL guards the mini-app window against non-http(s) schemes.
func isHTTPWebAppURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	return parsed.Host != ""
}
