package kernel

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/dcpool"
	"github.com/iyear/tdl/core/downloader"
	coretclient "github.com/iyear/tdl/core/tclient"
	"github.com/iyear/tdl/core/tmedia"
	"github.com/iyear/tdl/core/util/tutil"
	"tgdesk/internal/paths"
)

type byteInterval struct {
	start int64
	end   int64
}

type videoStreamSession struct {
	id     string
	mode   string
	client *telegram.Client
	media  *tmedia.Media
	pool   dcpool.Pool
	ctx    context.Context
	cancel context.CancelFunc

	mu        sync.Mutex
	cond      *sync.Cond
	file      *os.File
	intervals []byteInterval
	done      bool
	err       error
}

// GetVideoStream prepares a progressive stream URL. Mode "stream" uses the
// Telegram MTProto upload.getFile ranges directly, like the web client. Mode
// "tdl" runs tdl's multi-connection downloader into a growing cache file and
// serves bytes as they arrive.
func (s *Service) GetVideoStream(
	chatID string,
	messageID int,
	proxy, ntp string,
	useTDL bool,
) (string, error) {
	if strings.TrimSpace(chatID) == "" || messageID <= 0 {
		return "", fmt.Errorf("invalid message")
	}

	connectCtx, connectCancel := context.WithTimeout(context.Background(), 45*time.Second)
	client, err := s.ensureSession(connectCtx, proxy, ntp)
	connectCancel()
	if err != nil {
		return "", err
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return "", err
	}
	messageCtx, messageCancel := context.WithTimeout(context.Background(), 45*time.Second)
	msg, err := tutil.GetSingleMessage(messageCtx, client.API(), peer, messageID)
	messageCancel()
	if err != nil {
		return "", err
	}
	media, ok := tmedia.GetMedia(msg)
	if !ok || media == nil || media.Size <= 0 {
		return "", fmt.Errorf("message has no playable media")
	}

	s.mediaServerMu.Lock()
	if err := s.startMediaServerLocked(); err != nil {
		s.mediaServerMu.Unlock()
		return "", err
	}
	if s.videoStreams == nil {
		s.videoStreams = make(map[string]*videoStreamSession)
	}
	id, err := randomToken()
	if err != nil {
		s.mediaServerMu.Unlock()
		return "", err
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &videoStreamSession{
		id:     id,
		mode:   "stream",
		client: client,
		media:  media,
		pool:   dcpool.NewPool(client, 4, coretclient.NewDefaultMiddlewares(ctx, 5*time.Minute)...),
		ctx:    ctx,
		cancel: cancel,
	}
	session.cond = sync.NewCond(&session.mu)
	if useTDL {
		session.mode = "tdl"
	}
	s.videoStreams[id] = session
	base := s.mediaStreamBase
	s.mediaServerMu.Unlock()

	if useTDL {
		go session.runVideoFileStream()
	}
	return base + id, nil
}

func (s *Service) serveVideoStream(id string, w http.ResponseWriter, r *http.Request) {
	s.mediaServerMu.Lock()
	session := s.videoStreams[id]
	s.mediaServerMu.Unlock()
	if session == nil {
		http.NotFound(w, r)
		return
	}
	if session.mode == "tdl" {
		session.serveGrowingFile(w, r)
		return
	}
	session.serveMTProto(w, r)
}

func (s *videoStreamSession) serveMTProto(w http.ResponseWriter, r *http.Request) {
	start, end, partial, err := parseByteRange(r.Header.Get("Range"), s.media.Size)
	if err != nil {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", s.media.Size))
		http.Error(w, "invalid range", http.StatusRequestedRangeNotSatisfiable)
		return
	}
	writeVideoHeaders(w, s.media, start, end, partial)

	if r.Method == http.MethodHead {
		return
	}
	w.WriteHeader(statusForPartial(partial))

	fetchCtx, cancel := context.WithCancel(r.Context())
	defer cancel()

	dc := s.pool.Client(fetchCtx, s.media.DC)
	flusher, _ := w.(http.Flusher)
	const chunkLimit = int64(1024 * 1024)
	const align = int64(4096)

	pos := start
	for pos <= end {
		offset := pos / align * align
		limit := chunkLimit
		if remaining := s.media.Size - offset; limit > remaining {
			limit = remaining
		}
		limit = limit / align * align
		if limit < align {
			limit = align
		}
		result, fetchErr := dc.UploadGetFile(fetchCtx, &tg.UploadGetFileRequest{
			Location:     s.media.InputFileLoc,
			Offset:       offset,
			Limit:        int(limit),
			Precise:      true,
			CDNSupported: false,
		})
		if fetchErr != nil {
			if pos == start {
				http.Error(w, fetchErr.Error(), http.StatusBadGateway)
			}
			return
		}
		file, ok := result.(*tg.UploadFile)
		if !ok || len(file.Bytes) == 0 {
			if pos == start {
				http.Error(w, "Telegram did not return stream data", http.StatusBadGateway)
			}
			return
		}
		from := int(pos - offset)
		if from >= len(file.Bytes) {
			if pos == start {
				http.Error(w, "invalid Telegram stream offset", http.StatusBadGateway)
			}
			return
		}
		available := int64(len(file.Bytes) - from)
		remaining := end - pos + 1
		if available > remaining {
			available = remaining
		}
		if _, writeErr := w.Write(file.Bytes[from : from+int(available)]); writeErr != nil {
			return
		}
		if flusher != nil {
			flusher.Flush()
		}
		pos += available
	}
}

func (s *videoStreamSession) runVideoFileStream() {
	dir := filepath.Join(paths.Data(), "media")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		s.finish(err)
		return
	}
	ext := videoExtension(s.media)
	path := filepath.Join(dir, "stream_"+s.id+ext)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0o600)
	if err != nil {
		s.finish(err)
		return
	}
	s.mu.Lock()
	s.file = file
	s.mu.Unlock()

	writer := &trackingWriter{file: file, session: s}
	elem := &downloadElement{media: s.media, to: writer}
	dl := downloader.New(downloader.Options{
		Pool:     s.pool,
		Threads:  4,
		Iter:     &singleIter{elem: elem},
		Progress: noopDownloadProgress{},
	})
	downloadErr := dl.Download(s.ctx, 1)
	s.finish(downloadErr)
}

func (s *videoStreamSession) finish(err error) {
	s.mu.Lock()
	s.done = true
	s.err = err
	s.cond.Broadcast()
	s.mu.Unlock()
}

func (s *videoStreamSession) markWritten(offset int64, size int) {
	if size <= 0 {
		return
	}
	end := offset + int64(size)
	s.mu.Lock()
	s.intervals = append(s.intervals, byteInterval{start: offset, end: end})
	sort.Slice(s.intervals, func(i, j int) bool {
		return s.intervals[i].start < s.intervals[j].start
	})
	merged := s.intervals[:0]
	for _, item := range s.intervals {
		if len(merged) == 0 || item.start > merged[len(merged)-1].end {
			merged = append(merged, item)
			continue
		}
		if item.end > merged[len(merged)-1].end {
			merged[len(merged)-1].end = item.end
		}
	}
	s.intervals = merged
	s.cond.Broadcast()
	s.mu.Unlock()
}

func (s *videoStreamSession) waitFor(offset int64) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for {
		for _, item := range s.intervals {
			if item.start <= offset && item.end > offset {
				return item.end, nil
			}
		}
		if s.err != nil {
			return 0, s.err
		}
		if s.done {
			return 0, io.ErrUnexpectedEOF
		}
		s.cond.Wait()
	}
}

func (s *videoStreamSession) serveGrowingFile(w http.ResponseWriter, r *http.Request) {
	start, end, partial, err := parseByteRange(r.Header.Get("Range"), s.media.Size)
	if err != nil {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", s.media.Size))
		http.Error(w, "invalid range", http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if r.Method == http.MethodHead {
		writeVideoHeaders(w, s.media, start, end, partial)
		return
	}
	if _, waitErr := s.waitFor(start); waitErr != nil {
		http.Error(w, waitErr.Error(), http.StatusBadGateway)
		return
	}
	writeVideoHeaders(w, s.media, start, end, partial)
	w.WriteHeader(statusForPartial(partial))

	flusher, _ := w.(http.Flusher)
	pos := start
	buffer := make([]byte, 64*1024)
	for pos <= end {
		limit, waitErr := s.waitFor(pos)
		if waitErr != nil {
			return
		}
		readSize := end - pos + 1
		if readSize > int64(len(buffer)) {
			readSize = int64(len(buffer))
		}
		if available := limit - pos; readSize > available {
			readSize = available
		}
		if readSize <= 0 {
			return
		}
		n, readErr := s.file.ReadAt(buffer[:readSize], pos)
		if n > 0 {
			if _, writeErr := w.Write(buffer[:n]); writeErr != nil {
				return
			}
			pos += int64(n)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if readErr != nil && readErr != io.EOF {
			return
		}
	}
}

type trackingWriter struct {
	file    *os.File
	session *videoStreamSession
}

func (w *trackingWriter) WriteAt(p []byte, off int64) (int, error) {
	n, err := w.file.WriteAt(p, off)
	if n > 0 {
		w.session.markWritten(off, n)
	}
	return n, err
}

func writeVideoHeaders(w http.ResponseWriter, media *tmedia.Media, start, end int64, partial bool) {
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", videoContentType(media))
	w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	if partial {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, media.Size))
	}
}

func statusForPartial(partial bool) int {
	if partial {
		return http.StatusPartialContent
	}
	return http.StatusOK
}

func parseByteRange(header string, size int64) (start, end int64, partial bool, err error) {
	if header == "" {
		return 0, size - 1, false, nil
	}
	if !strings.HasPrefix(header, "bytes=") {
		return 0, 0, false, fmt.Errorf("unsupported range")
	}
	spec := strings.TrimSpace(strings.TrimPrefix(header, "bytes="))
	if strings.Contains(spec, ",") {
		return 0, 0, false, fmt.Errorf("multiple ranges are not supported")
	}
	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return 0, 0, false, fmt.Errorf("invalid range")
	}
	if parts[0] == "" {
		suffix, parseErr := strconv.ParseInt(parts[1], 10, 64)
		if parseErr != nil || suffix <= 0 {
			return 0, 0, false, fmt.Errorf("invalid suffix range")
		}
		if suffix > size {
			suffix = size
		}
		return size - suffix, size - 1, true, nil
	}
	start, err = strconv.ParseInt(parts[0], 10, 64)
	if err != nil || start < 0 || start >= size {
		return 0, 0, false, fmt.Errorf("invalid range start")
	}
	if parts[1] == "" {
		end = size - 1
	} else {
		end, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || end < start {
			return 0, 0, false, fmt.Errorf("invalid range end")
		}
		if end >= size {
			end = size - 1
		}
	}
	return start, end, true, nil
}

func videoExtension(media *tmedia.Media) string {
	ext := strings.ToLower(filepath.Ext(media.Name))
	switch ext {
	case ".mp4", ".webm", ".mov", ".m4v":
		return ext
	default:
		return ".mp4"
	}
}

func videoContentType(media *tmedia.Media) string {
	ext := videoExtension(media)
	if value := mime.TypeByExtension(ext); value != "" {
		return value
	}
	return "video/mp4"
}
