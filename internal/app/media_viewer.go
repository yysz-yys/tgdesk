package app

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// MediaViewerWindowName is the Wails window name of the detached viewer.
const MediaViewerWindowName = "media-viewer"

// mediaViewerManager owns the standalone media viewer window. The window loads
// a minimal viewer page (frontend/viewer.html), gets the serialized session
// payload from TakeMediaViewerState and keeps the main window untouched.
type mediaViewerManager struct {
	mu       sync.Mutex
	sessions map[string]string
	window   *application.WebviewWindow
	lastSize struct{ width, height int }
}

type mediaViewerPayloadShape struct {
	Items []struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"items"`
}

func newMediaViewerManager() *mediaViewerManager {
	return &mediaViewerManager{sessions: map[string]string{}}
}

func randomSessionID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

// OpenMediaViewer opens the media viewer in its own window, or reuses the open
// window by pointing it at the new session. The main window is never touched.
func (s *Service) OpenMediaViewer(payload string) error {
	if len(payload) == 0 {
		return errors.New("empty media viewer payload")
	}
	if !json.Valid([]byte(payload)) {
		return errors.New("invalid media viewer payload")
	}
	wailsApp := application.Get()
	if wailsApp == nil {
		return errors.New("application not available")
	}
	session, err := randomSessionID()
	if err != nil {
		return err
	}
	viewer := s.viewer
	viewer.mu.Lock()
	viewer.sessions = map[string]string{session: payload}
	existing := viewer.window
	viewer.mu.Unlock()

	url := "/viewer.html?session=" + session
	if existing != nil {
		existing.SetURL(url)
		existing.Show()
		existing.UnMinimise()
		existing.Focus()
		return nil
	}

	width, height := viewer.windowSize(wailsApp, payload)
	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             MediaViewerWindowName,
		Title:            "tgdesk",
		Frameless:        true,
		Width:            width,
		Height:           height,
		MinWidth:         480,
		MinHeight:        360,
		InitialPosition:  application.WindowCentered,
		StartState:       application.WindowStateNormal,
		BackgroundColour: application.NewRGB(0, 0, 0),
		URL:              url,
	})
	window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		viewer.mu.Lock()
		if viewer.window == window {
			viewer.window = nil
			viewer.lastSize = struct{ width, height int }{width: window.Width(), height: window.Height()}
		}
		viewer.sessions = map[string]string{}
		viewer.mu.Unlock()
		// Hand focus back to the chat window the viewer was opened from.
		if main, ok := wailsApp.Window.Get("main"); ok {
			main.Show()
			main.Focus()
		}
	})
	viewer.mu.Lock()
	viewer.window = window
	viewer.mu.Unlock()
	return nil
}

// TakeMediaViewerState returns the serialized viewer state for a session. The
// viewer page calls it once on load; the entry stays until the window closes so
// a reload (dev/HMR) can still restore the slide.
func (s *Service) TakeMediaViewerState(session string) string {
	s.viewer.mu.Lock()
	defer s.viewer.mu.Unlock()
	return s.viewer.sessions[session]
}

func (m *mediaViewerManager) windowSize(
	wailsApp *application.App,
	payload string,
) (int, int) {
	var parsed mediaViewerPayloadShape
	_ = json.Unmarshal([]byte(payload), &parsed)

	// Wails reports the work area in DIPs, the same unit as window sizes, so it
	// can be used directly; ScaleFactor only matters for native DPI elsewhere.
	maxWidth, maxHeight := 1200, 820
	if screen := wailsApp.Screen.GetPrimary(); screen != nil {
		maxWidth = int(float64(screen.WorkArea.Width) * 0.86)
		maxHeight = int(float64(screen.WorkArea.Height) * 0.86)
		log.Printf(
			"media viewer screen: workarea=%dx%d scale=%.3f",
			screen.WorkArea.Width, screen.WorkArea.Height, screen.ScaleFactor,
		)
	}
	if maxWidth < 720 {
		maxWidth = 720
	}
	if maxHeight < 500 {
		maxHeight = 500
	}

	// The viewer page paints a 34 px caption bar, a 56 px author bar and keeps
	// 110 px for the caption/album strip under the media.
	const chromeHeight = 34 + 56 + 110 + 12
	const minWidth = 720
	const minHeight = 520

	width, height := 0, 0
	if m.lastSize.width > 0 && m.lastSize.height > 0 {
		width, height = m.lastSize.width, m.lastSize.height
	} else {
		for _, item := range parsed.Items {
			if item.Width > 0 && item.Height > 0 {
				aspect := float64(item.Width) / float64(item.Height)
				width = maxWidth
				height = int(float64(width)/aspect) + chromeHeight
				if height > maxHeight {
					height = maxHeight
					width = int(float64(height-chromeHeight) * aspect)
				}
				break
			}
		}
		if width == 0 || height == 0 {
			width, height = 1080, 760
		}
	}
	width = clampInt(width, minWidth, maxWidth)
	height = clampInt(height, minHeight, maxHeight)
	log.Printf("media viewer window: %dx%d", width, height)
	return width, height
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
