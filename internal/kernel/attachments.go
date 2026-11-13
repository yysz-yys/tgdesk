package kernel

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gotd/td/telegram/message"
	"github.com/gotd/td/telegram/message/styling"
	"github.com/gotd/td/telegram/uploader"
)

// maxAttachmentSize matches Telegram's 2 GB upload limit for regular accounts.
const maxAttachmentSize = int64(2 * 1024 * 1024 * 1024)

type uploadReporter struct {
	service *Service
	event   UploadEvent
	mu      sync.Mutex
	last    time.Time
}

func (r *uploadReporter) Chunk(ctx context.Context, state uploader.ProgressState) error {
	progress := 0.0
	if state.Total > 0 {
		progress = float64(state.Uploaded) / float64(state.Total)
	}
	r.mu.Lock()
	now := time.Now()
	if progress < 1 && now.Sub(r.last) < 120*time.Millisecond {
		r.mu.Unlock()
		return nil
	}
	r.last = now
	r.event.Uploaded = state.Uploaded
	if state.Total > 0 {
		r.event.Total = state.Total
	}
	r.event.Progress = progress
	event := r.event
	r.mu.Unlock()
	r.service.emitUpload(event)
	return nil
}

// SendAttachment uploads one local file and sends it to the chat. The returned
// error is the raw Telegram/IO error; the UI keeps the draft on failure.
func (s *Service) SendAttachment(
	chatID, filePath, caption string,
	replyToID int,
	proxy, ntp string,
) error {
	if strings.TrimSpace(chatID) == "" {
		return fmt.Errorf("invalid chat")
	}
	if strings.TrimSpace(filePath) == "" {
		return fmt.Errorf("no file selected")
	}
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("open attachment: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("attachment is not a regular file")
	}
	if info.Size() <= 0 {
		return fmt.Errorf("attachment is empty")
	}
	if info.Size() > maxAttachmentSize {
		return fmt.Errorf("attachment is larger than 2 GB")
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	s.rememberPeer(peer)

	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open attachment: %w", err)
	}
	defer file.Close()

	mimeType := detectAttachmentMime(file, filePath)
	_, _ = file.Seek(0, 0)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}

	name := filepath.Base(filePath)
	token, err := randomToken()
	if err != nil {
		return err
	}
	reporter := &uploadReporter{
		service: s,
		event: UploadEvent{
			ID:     token,
			ChatID: chatID,
			Name:   name,
			Total:  info.Size(),
		},
	}
	s.emitUpload(reporter.event)

	up := uploader.NewUploader(client.API()).
		WithThreads(4).
		WithPartSize(512 * 1024).
		WithProgress(reporter)
	sender := message.NewSender(client.API()).WithUploader(up).To(peer)
	builder := sender.CloneBuilder()
	caption = strings.TrimSpace(caption)
	if replyToID > 0 {
		builder = builder.Reply(replyToID)
	}

	fileRef, err := builder.Upload(message.FromFile(file)).AsInputFile(ctx)
	if err != nil {
		reporter.fail(err)
		return fmt.Errorf("upload attachment: %w", err)
	}

	var captionOptions []styling.StyledTextOption
	if caption != "" {
		captionOptions = append(captionOptions, styling.Plain(caption))
	}

	var option message.MediaOption
	photoMode := false
	switch {
	case strings.HasPrefix(mimeType, "image/") && mimeType != "image/gif" && mimeType != "image/webp":
		photoMode = true
		option = message.UploadedPhoto(fileRef, captionOptions...)
	case strings.HasPrefix(mimeType, "video/") &&
		(mimeType == "video/mp4" || mimeType == "video/webm" || mimeType == "video/quicktime"):
		option = message.UploadedDocument(fileRef, captionOptions...).
			MIME(mimeType).
			Filename(name).
			Video()
	case strings.HasPrefix(mimeType, "audio/"):
		option = message.UploadedDocument(fileRef, captionOptions...).
			MIME(mimeType).
			Filename(name).
			Audio()
	case mimeType == "image/gif":
		option = message.UploadedDocument(fileRef, captionOptions...).
			Filename(name).
			GIF()
	default:
		option = message.UploadedDocument(fileRef, captionOptions...).
			MIME(mimeType).
			Filename(name).
			ForceFile(true)
	}

	_, sendErr := builder.Media(ctx, option)
	if sendErr != nil && photoMode {
		// Telegram rejects some technically valid images (very small, unusual
		// dimensions) with IMAGE_PROCESS_FAILED. Re-send the already uploaded
		// file as a document instead of failing the whole attachment.
		document := message.UploadedDocument(fileRef, captionOptions...).
			MIME(mimeType).
			Filename(name).
			ForceFile(true)
		_, sendErr = builder.Media(ctx, document)
	}
	if sendErr != nil {
		reporter.fail(sendErr)
		return fmt.Errorf("send attachment: %w", sendErr)
	}

	reporter.event.Done = true
	reporter.event.Progress = 1
	reporter.event.Uploaded = info.Size()
	s.emitUpload(reporter.event)
	return nil
}

func (r *uploadReporter) fail(err error) {
	r.event.Failed = true
	r.event.Error = err.Error()
	r.service.emitUpload(r.event)
}

func detectAttachmentMime(file *os.File, path string) string {
	if value := mimeTypeByExtension(path); value != "" {
		return value
	}
	buffer := make([]byte, 512)
	n, _ := file.Read(buffer)
	if n > 0 {
		return http.DetectContentType(buffer[:n])
	}
	return "application/octet-stream"
}

func mimeTypeByExtension(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".mp3":
		return "audio/mpeg"
	case ".m4a":
		return "audio/mp4"
	case ".ogg", ".opus":
		return "audio/ogg"
	case ".pdf":
		return "application/pdf"
	case ".zip":
		return "application/zip"
	case ".txt":
		return "text/plain"
	}
	return ""
}
