package kernel

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/iyear/tdl/core/dcpool"
	"github.com/iyear/tdl/core/downloader"
	coretclient "github.com/iyear/tdl/core/tclient"
	"github.com/iyear/tdl/core/tmedia"
	"github.com/iyear/tdl/core/util/tutil"
	"tgdesk/internal/paths"
)

// GetMessageMedia downloads a video/document into the local media cache and
// returns a loopback URL that the WebView can play with normal HTTP Range
// support. Streaming directly from MTProto would require a much larger custom
// file server; caching first keeps playback reliable and seekable.
func (s *Service) GetMessageMedia(
	chatID string,
	messageID int,
	proxy, ntp string,
) (string, error) {
	if strings.TrimSpace(chatID) == "" || messageID <= 0 {
		return "", fmt.Errorf("invalid message")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return "", err
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return "", err
	}
	msg, err := tutil.GetSingleMessage(ctx, client.API(), peer, messageID)
	if err != nil {
		return "", err
	}
	media, ok := tmedia.GetMedia(msg)
	if !ok || media == nil || media.Size <= 0 {
		return "", fmt.Errorf("message has no downloadable media")
	}

	dir := filepath.Join(paths.Data(), "media")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(media.Name))
	switch ext {
	case ".mp4", ".webm", ".mov", ".m4v":
	default:
		ext = ".mp4"
	}
	name := fmt.Sprintf("%s_%d%s", safeFilePart(chatID), messageID, ext)
	finalPath := filepath.Join(dir, name)
	if info, statErr := os.Stat(finalPath); statErr == nil && info.Size() > 0 {
		return s.mediaHTTPURL(name)
	}

	tempPath := finalPath + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return "", err
	}

	pool := dcpool.NewPool(client, 4, coretclient.NewDefaultMiddlewares(ctx, 5*time.Minute)...)
	elem := &downloadElement{media: media, to: file}
	dl := downloader.New(downloader.Options{
		Pool:     pool,
		Threads:  4,
		Iter:     &singleIter{elem: elem},
		Progress: noopDownloadProgress{},
	})
	downloadErr := dl.Download(ctx, 1)
	_ = file.Close()
	_ = pool.Close()
	if downloadErr != nil {
		_ = os.Remove(tempPath)
		return "", downloadErr
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}
	return s.mediaHTTPURL(name)
}

func (s *Service) mediaHTTPURL(name string) (string, error) {
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()

	if err := s.startMediaServerLocked(); err != nil {
		return "", err
	}
	return s.mediaBaseURL + name, nil
}

func (s *Service) mediaStreamURL(id string) (string, error) {
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()

	if err := s.startMediaServerLocked(); err != nil {
		return "", err
	}
	return s.mediaStreamBase + id, nil
}

func (s *Service) startMediaServerLocked() error {
	if s.mediaBaseURL != "" {
		return nil
	}
	dir := filepath.Join(paths.Data(), "media")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	token, err := randomToken()
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	mediaPrefix := "/media/" + token + "/"
	streamPrefix := "/stream/" + token + "/"
	thumbPrefix := "/thumb/" + token + "/"
	avatarPrefix := "/avatar/" + token + "/"
	photoPrefix := "/photo/" + token + "/"
	mux := http.NewServeMux()
	mux.HandleFunc(mediaPrefix, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		relative := strings.TrimPrefix(r.URL.Path, mediaPrefix)
		if relative == "" || strings.Contains(relative, "/") || strings.Contains(relative, "\\") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, relative))
	})
	mux.HandleFunc(streamPrefix, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		id := strings.TrimPrefix(r.URL.Path, streamPrefix)
		if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") {
			http.NotFound(w, r)
			return
		}
		s.serveVideoStream(id, w, r)
	})
	mux.HandleFunc(thumbPrefix, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		id := strings.TrimPrefix(r.URL.Path, thumbPrefix)
		if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") {
			http.NotFound(w, r)
			return
		}
		s.serveThumb(id, w, r)
	})
	mux.HandleFunc(avatarPrefix, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		id := strings.TrimPrefix(r.URL.Path, avatarPrefix)
		if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") {
			http.NotFound(w, r)
			return
		}
		s.serveAvatar(id, w, r)
	})
	mux.HandleFunc(photoPrefix, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		id := strings.TrimPrefix(r.URL.Path, photoPrefix)
		if id == "" || strings.Contains(id, "/") || strings.Contains(id, "\\") {
			http.NotFound(w, r)
			return
		}
		s.servePhoto(id, w, r)
	})
	server := &http.Server{
		ReadHeaderTimeout: 10 * time.Second,
		Handler:           mux,
	}
	go func() {
		_ = server.Serve(listener)
	}()
	origin := "http://" + listener.Addr().String()
	s.mediaBaseURL = origin + mediaPrefix
	s.mediaStreamBase = origin + streamPrefix
	s.thumbBase = origin + thumbPrefix
	s.avatarBase = origin + avatarPrefix
	s.photoBase = origin + photoPrefix
	if s.videoStreams == nil {
		s.videoStreams = make(map[string]*videoStreamSession)
	}
	return nil
}

func randomToken() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

// noopDownloadProgress is required because tdl's downloader unconditionally
// calls Progress.OnAdd/OnDone. A nil interface would panic the whole process as
// soon as the user clicks a video.
type noopDownloadProgress struct{}

func (noopDownloadProgress) OnAdd(downloader.Elem) {}

func (noopDownloadProgress) OnDownload(downloader.Elem, downloader.ProgressState) {}

func (noopDownloadProgress) OnDone(downloader.Elem, error) {}
