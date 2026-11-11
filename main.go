package main

import (
	"embed"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"

	"tgdesk/internal/app"
	"tgdesk/internal/kernel"
	"tgdesk/internal/paths"
)

//go:embed all:frontend/dist
var assets embed.FS

// migrateLegacyWebView copies the old profile-backed WebView2 data once so
// existing settings/language survive the move to the portable directory.
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

	k := kernel.New(kernel.Version)
	svc := app.New(k)

	if err := paths.Ensure(); err != nil {
		log.Fatalf("create portable data directories: %v", err)
	}
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
		Description: "Telegram media downloader and browser powered by tdl",
		Services: []application.Service{
			application.NewService(svc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Windows: windowsOptions,
	})

	width, height := initialWindowSize(wailsApp)

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "tgdesk",
		Width:            width,
		Height:           height,
		MinWidth:         640,
		MinHeight:        420,
		InitialPosition:  application.WindowCentered,
		StartState:       application.WindowStateNormal,
		BackgroundColour: application.NewRGB(14, 16, 22),
		URL:              "/",
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}

// initialWindowSize keeps the restored window inside the primary work area.
// Wails window sizes are DIPs, so convert the physical work area by the
// monitor scale factor. The app still starts maximised.
func initialWindowSize(app *application.App) (int, int) {
	width, height := 1120, 760

	if screen := app.Screen.GetPrimary(); screen != nil && screen.ScaleFactor > 0 {
		width = int(float64(screen.WorkArea.Width) / float64(screen.ScaleFactor) * 0.94)
		height = int(float64(screen.WorkArea.Height) / float64(screen.ScaleFactor) * 0.94)
	}

	if width < 640 {
		width = 640
	}
	if height < 420 {
		height = 420
	}

	return width, height
}
