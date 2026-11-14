package main

import (
	"embed"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"tgdesk/internal/app"
	"tgdesk/internal/kernel"
	"tgdesk/internal/paths"
)

//go:embed all:frontend/dist
var assets embed.FS

// migrateLegacyWebView copies the old profile-backed WebView2 data once so
// existing settings/language survive the move to the portable directory.
// resetWebViewCacheOnUpgrade drops the Chromium HTTP/JS cache once per binary
// build. Without this WebView2 can keep an old index.html (and therefore old
// hashed JS/CSS) after the exe is replaced, which makes UI changes invisible
// until the profile cache is manually cleared. Cookies, localStorage and the
// Telegram session are intentionally left untouched.
func resetWebViewCacheOnUpgrade() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	info, err := os.Stat(exe)
	if err != nil {
		return
	}
	version := fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())
	marker := filepath.Join(paths.Data(), "webview-cache.version")
	if old, err := os.ReadFile(marker); err == nil && string(old) == version {
		return
	}
	for _, dir := range []string{
		filepath.Join("EBWebView", "Default", "Cache"),
		filepath.Join("EBWebView", "Default", "Code Cache"),
		filepath.Join("EBWebView", "Default", "GPUCache"),
		filepath.Join("EBWebView", "Default", "DawnCache"),
	} {
		_ = os.RemoveAll(filepath.Join(paths.WebView(), dir))
	}
	_ = os.WriteFile(marker, []byte(version), 0o600)
}

func migrateLegacyWebView() {
	marker := filepath.Join(paths.Data(), ".legacy-webview-migrated")
	if _, err := os.Stat(marker); err == nil {
		return
	}
	oldRoot, err := os.UserConfigDir()
	if err != nil {
		return
	}
	oldPath := filepath.Join(oldRoot, "tgdesk", "webview")
	newPath := paths.WebView()
	if _, err := os.Stat(oldPath); err != nil {
		return
	}
	if entries, err := os.ReadDir(newPath); err == nil && len(entries) > 0 {
		_ = os.WriteFile(marker, []byte("1"), 0o600)
		return
	}
	if err := copyTree(oldPath, newPath); err != nil {
		log.Printf("portable WebView migration skipped: %v", err)
		return
	}
	_ = os.WriteFile(marker, []byte("1"), 0o600)
}

func copyTree(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, relative)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode().Perm())
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func main() {
	application.RegisterEvent[kernel.AuthEvent]("auth:event")
	application.RegisterEvent[kernel.DownloadEvent]("download:event")
	application.RegisterEvent[kernel.ChatEvent]("chat:event")
	application.RegisterEvent[kernel.UploadEvent]("upload:event")

	k := kernel.New()
	svc := app.New(k)

	if err := paths.Ensure(); err != nil {
		log.Fatalf("create portable data directories: %v", err)
	}
	if err := paths.RemoveLegacyImageCaches(); err != nil {
		log.Printf("legacy image cache cleanup skipped: %v", err)
	}
	resetWebViewCacheOnUpgrade()
	migrateLegacyWebView()

	windowsOptions := application.WindowsOptions{
		WebviewUserDataPath: paths.WebView(),
	}
	windowsOptions.AdditionalBrowserArgs = []string{"--disable-crash-reporter"}
	// Dev-only: expose the WebView2 DevTools endpoint for layout debugging.
	if os.Getenv("TGDESK_WEBVIEW_DEBUG") == "1" {
		windowsOptions.AdditionalBrowserArgs = append(
			windowsOptions.AdditionalBrowserArgs,
			"--remote-debugging-port=9222",
		)
	}

	wailsApp := application.New(application.Options{
		Name:        "tgdesk",
		Description: "tgdesk",
		Services: []application.Service{
			application.NewService(svc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Windows: windowsOptions,
	})

	width, height := initialWindowSize(wailsApp)

	mainWindow := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "tdesk",
		Frameless:        true,
		Width:            width,
		Height:           height,
		MinWidth:         640,
		MinHeight:        420,
		InitialPosition:  application.WindowCentered,
		StartState:       application.WindowStateNormal,
		BackgroundColour: application.NewRGB(14, 16, 22),
		URL:              "/",
	})
	// The detached media viewer window outlives the chat window for as long as
	// it is open; closing the main window closes it too so the app can quit.
	// Bot mini apps are rendered as an in-app overlay now (no OS window).
	mainWindow.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		if viewer, ok := wailsApp.Window.Get(app.MediaViewerWindowName); ok {
			viewer.Close()
		}
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}

// initialWindowSize keeps the restored window inside the primary work area.
// Wails window sizes are DIPs, so convert the physical work area by the
// monitor scale factor. The app still starts maximised.
func initialWindowSize(app *application.App) (int, int) {
	width, height := 1107, 725

	if screen := app.Screen.GetPrimary(); screen != nil && screen.ScaleFactor > 0 {
		maxWidth := int(float64(screen.WorkArea.Width) / float64(screen.ScaleFactor) * 0.94)
		maxHeight := int(float64(screen.WorkArea.Height) / float64(screen.ScaleFactor) * 0.94)
		if width > maxWidth {
			width = maxWidth
		}
		if height > maxHeight {
			height = maxHeight
		}
	}

	if width < 640 {
		width = 640
	}
	if height < 420 {
		height = 420
	}

	return width, height
}
