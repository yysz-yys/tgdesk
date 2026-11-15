package kernel

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// Theme pattern wallpapers (the doodles Telegram tiles over a chat background)
// are documents with mime type application/x-tgwallpattern whose bytes are a
// gzip-compressed SVG. They are served from the loopback media server so the
// WebView can paint them with a plain <img>/CSS background: download and
// decompression happen on the first request and the decoded SVG then lives in
// the byte-bounded image cache.
const (
	// upload.getFile wants Limit to be a multiple of 4096. A theme pattern is a
	// few kilobytes, but chunking keeps large patterns working and avoids relying
	// on a single response covering the whole document.
	patternChunkSize = int64(512 * 1024)
	// patternMaxBytes caps the decompressed size so a malformed document cannot
	// balloon memory.
	patternMaxBytes = int64(8 << 20)
)

// registerPatternDocument stores a theme pattern document behind an opaque ref
// and returns its id. Nothing is downloaded here: the endpoint fetches the
// document lazily on the first request.
func (s *Service) registerPatternDocument(document *tg.Document, proxy, ntp string) string {
	if document == nil || document.ID == 0 || document.Size <= 0 {
		return ""
	}
	media := &tmedia.Media{
		InputFileLoc: &tg.InputDocumentFileLocation{
			ID:            document.ID,
			AccessHash:    document.AccessHash,
			FileReference: document.FileReference,
			ThumbSize:     "",
		},
		Name: themePatternName(document),
		Size: document.Size,
		DC:   document.DCID,
	}
	return s.patternRefs.put(&imageRef{
		media: media,
		mime:  "image/svg+xml",
		proxy: proxy,
		ntp:   ntp,
	})
}

// patternURL returns the loopback URL that serves a registered pattern ref. It
// starts the shared media server (a loopback listener) but never downloads the
// document itself.
func (s *Service) patternURL(id string) string {
	if id == "" {
		return ""
	}
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()
	if err := s.startMediaServerLocked(); err != nil {
		return ""
	}
	return s.patternBase + id
}

// themePatternName picks the document filename used to give the cached pattern
// a stable name. Telegram sends the doodles as pattern.svg but the attribute is
// optional.
func themePatternName(document *tg.Document) string {
	if document == nil {
		return "pattern.svg"
	}
	for _, attribute := range document.Attributes {
		switch value := attribute.(type) {
		case *tg.DocumentAttributeFilename:
			if strings.HasSuffix(strings.ToLower(value.FileName), ".svg") {
				return value.FileName
			}
		}
	}
	return "pattern.svg"
}

// decodePatternDocument turns the stored document bytes into the SVG the
// WebView can render: Telegram gzips the pattern (magic 1f 8b); plain data is
// returned unchanged.
func decodePatternDocument(data []byte) ([]byte, error) {
	if len(data) < 2 || data[0] != 0x1f || data[1] != 0x8b {
		return data, nil
	}
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("open gzipped pattern: %w", err)
	}
	defer func() {
		_ = reader.Close()
	}()
	decoded, err := io.ReadAll(io.LimitReader(reader, patternMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("gunzip pattern: %w", err)
	}
	if int64(len(decoded)) > patternMaxBytes {
		return nil, fmt.Errorf("pattern is larger than %d bytes", patternMaxBytes)
	}
	return decoded, nil
}

// fetchPatternDocument downloads the whole pattern document with 4096-aligned
// upload.getFile chunks and decompresses it.
func (s *Service) fetchPatternDocument(ctx context.Context, ref *imageRef) ([]byte, error) {
	client, err := s.sessionPoolClient(ctx, ref.proxy, ref.ntp, ref.media.DC)
	if err != nil {
		return nil, err
	}
	size := ref.media.Size
	if size <= 0 {
		return nil, fmt.Errorf("pattern document has no size")
	}
	raw := make([]byte, 0, size)
	for offset := int64(0); offset < size; offset += patternChunkSize {
		limit := patternChunkSize
		if remaining := size - offset; remaining < limit {
			limit = remaining
		}
		// upload.getFile only accepts 4096-multiple limits, so round the final
		// partial chunk up; the server still returns at most the remaining bytes.
		limit = (limit + 4095) / 4096 * 4096
		response, fetchErr := client.UploadGetFile(ctx, &tg.UploadGetFileRequest{
			Location:     ref.media.InputFileLoc,
			Offset:       offset,
			Limit:        int(limit),
			Precise:      true,
			CDNSupported: false,
		})
		if fetchErr != nil {
			return nil, fetchErr
		}
		file, ok := response.(*tg.UploadFile)
		if !ok || len(file.Bytes) == 0 {
			if offset == 0 {
				return nil, fmt.Errorf("theme pattern is not directly available")
			}
			break
		}
		raw = append(raw, file.Bytes...)
		if int64(len(file.Bytes)) < limit || int64(len(raw)) >= size {
			break
		}
	}
	if int64(len(raw)) > size {
		raw = raw[:size]
	}
	return decodePatternDocument(raw)
}

// servePattern is the /pattern/<token>/<ref> handler. The decoded SVG is cached
// without a TTL: the image cache is bounded by bytes and evicts on its own.
func (s *Service) servePattern(id string, w http.ResponseWriter, r *http.Request) {
	ref := s.patternRefs.get(id)
	if ref == nil {
		http.NotFound(w, r)
		return
	}
	key := "pattern:" + id
	if entry, ok := s.images.get(key); ok {
		writeImage(w, entry.data, "image/svg+xml", "private, max-age=604800, immutable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	data, err := s.fetchPatternDocument(ctx, ref)
	if err != nil || len(data) == 0 {
		http.NotFound(w, r)
		return
	}
	s.images.put(key, data, "image/svg+xml", 0)
	writeImage(w, data, "image/svg+xml", "private, max-age=604800, immutable")
}
