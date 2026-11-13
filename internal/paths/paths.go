// Package paths resolves tgdesk's portable data layout. Every runtime write
// defaults to a directory next to tgdesk.exe; no app data is written to the
// user profile unless the user explicitly points a setting there.
package paths

import (
	"os"
	"path/filepath"
)

// Root returns the portable root. TGDESK_HOME exists for tests and for users
// who deliberately want to keep the portable folder elsewhere.
func Root() string {
	if value := os.Getenv("TGDESK_HOME"); value != "" {
		if absolute, err := filepath.Abs(value); err == nil {
			return absolute
		}
		return value
	}

	executable, err := os.Executable()
	if err != nil {
		if cwd, cwdErr := os.Getwd(); cwdErr == nil {
			return cwd
		}
		return "."
	}
	if resolved, resolveErr := filepath.EvalSymlinks(executable); resolveErr == nil {
		executable = resolved
	}
	return filepath.Dir(executable)
}

func Data() string          { return filepath.Join(Root(), "data") }
func TData() string         { return filepath.Join(Root(), "tdata") }
func Downloads() string     { return filepath.Join(Root(), "downloads") }
func WebView() string       { return filepath.Join(Data(), "webview") }
func DownloadStore() string { return filepath.Join(Data(), "downloads.json") }

func Ensure() error {
	for _, dir := range []string{
		Data(),
		TData(),
		Downloads(),
		WebView(),
	} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
	}
	return nil
}

// RemoveLegacyImageCaches deletes the per-image JPEG directories written by
// older builds (data/thumbs, data/avatars). Images are now served from MTProto
// through the loopback server and cached by the WebView, so those files are
// dead weight next to the executable. Safe to call on every start.
func RemoveLegacyImageCaches() error {
	for _, dir := range []string{"thumbs", "avatars"} {
		if err := os.RemoveAll(filepath.Join(Data(), dir)); err != nil {
			return err
		}
	}
	return nil
}
