package kernel

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/dcpool"
	coretclient "github.com/iyear/tdl/core/tclient"
	"github.com/iyear/tdl/core/tmedia"
	"github.com/iyear/tdl/core/util/tutil"
	"tgdesk/internal/paths"
)

// GetMessageThumb returns a JPEG thumbnail for a photo/video message as a
// base64 payload. Telegram Desktop shows thumbnails in the chat list and media
// panel; tgdesk fetches only the small Telegram thumb size, never the full file.
func (s *Service) GetMessageThumb(chatID string, messageID int, proxy, ntp string) (string, error) {
	if strings.TrimSpace(chatID) == "" || messageID <= 0 {
		return "", fmt.Errorf("invalid message")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
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
	thumb, ok := messageThumbMedia(msg)
	if !ok {
		return "", nil
	}

	cacheDir := filepath.Join(paths.Data(), "thumbs")
	if err := os.MkdirAll(cacheDir, 0o700); err != nil {
		return "", err
	}
	cacheName := fmt.Sprintf("%s_%d_%s.jpg", safeFilePart(chatID), msg.ID, safeFilePart(thumbType(thumb)))
	return downloadThumb(ctx, client, thumb, filepath.Join(cacheDir, cacheName))
}

// GetChatAvatar returns the current profile photo of a user, group or channel
// as a small JPEG base64 payload. Photos are cached per photo ID so changing an
// avatar invalidates the previous file without any extra metadata call.
func (s *Service) GetChatAvatar(chatID, proxy, ntp string) (string, error) {
	if strings.TrimSpace(chatID) == "" {
		return "", fmt.Errorf("invalid chat")
	}

	peer, err := parsePeerID(chatID)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return "", err
	}

	photo, err := chatPhoto(ctx, client, peer)
	if err != nil || photo == nil {
		return "", err
	}
	thumb, ok := photoThumb(photo)
	if !ok {
		return "", nil
	}

	cacheDir := filepath.Join(paths.Data(), "avatars")
	if err := os.MkdirAll(cacheDir, 0o700); err != nil {
		return "", err
	}
	cacheName := fmt.Sprintf("%s_%d.jpg", safeFilePart(chatID), photo.ID)
	return downloadThumb(ctx, client, thumb, filepath.Join(cacheDir, cacheName))
}

func downloadThumb(
	ctx context.Context,
	client *telegram.Client,
	thumb *tmedia.Media,
	cachePath string,
) (string, error) {
	if data, readErr := os.ReadFile(cachePath); readErr == nil && len(data) > 0 {
		return base64.StdEncoding.EncodeToString(data), nil
	}

	limit := int(thumb.Size)
	const align = 4096
	if limit <= 0 {
		limit = 64 * 1024
	}
	limit = (limit + align - 1) / align * align

	pool := dcpool.NewPool(client, 1, coretclient.NewDefaultMiddlewares(ctx, time.Minute)...)
	defer pool.Close()
	dc := pool.Client(ctx, thumb.DC)
	res, err := dc.UploadGetFile(ctx, &tg.UploadGetFileRequest{
		Location: thumb.InputFileLoc,
		Offset:   0,
		Limit:    limit,
		Precise:  true,
	})
	if err != nil {
		return "", err
	}
	file, ok := res.(*tg.UploadFile)
	if !ok || len(file.Bytes) == 0 {
		return "", fmt.Errorf("thumbnail is not directly available")
	}
	if err := os.WriteFile(cachePath, file.Bytes, 0o600); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(file.Bytes), nil
}

func chatPhoto(ctx context.Context, client *telegram.Client, peer tg.InputPeerClass) (*tg.Photo, error) {
	var class tg.PhotoClass
	switch value := peer.(type) {
	case *tg.InputPeerUser:
		full, err := client.API().UsersGetFullUser(ctx, &tg.InputUser{
			UserID:     value.UserID,
			AccessHash: value.AccessHash,
		})
		if err != nil {
			return nil, err
		}
		photo, ok := full.FullUser.GetProfilePhoto()
		if !ok {
			photo, ok = full.FullUser.GetFallbackPhoto()
		}
		if !ok {
			return nil, nil
		}
		class = photo
	case *tg.InputPeerChat:
		full, err := client.API().MessagesGetFullChat(ctx, value.ChatID)
		if err != nil {
			return nil, err
		}
		chat, ok := full.FullChat.(*tg.ChatFull)
		if !ok {
			return nil, nil
		}
		photo, ok := chat.GetChatPhoto()
		if !ok {
			return nil, nil
		}
		class = photo
	case *tg.InputPeerChannel:
		full, err := client.API().ChannelsGetFullChannel(ctx, &tg.InputChannel{
			ChannelID:  value.ChannelID,
			AccessHash: value.AccessHash,
		})
		if err != nil {
			return nil, err
		}
		channel, ok := full.FullChat.(*tg.ChannelFull)
		if !ok {
			return nil, nil
		}
		photo := channel.GetChatPhoto()
		if photo == nil {
			return nil, nil
		}
		class = photo
	default:
		return nil, nil
	}

	photo, ok := class.(*tg.Photo)
	if !ok || photo == nil {
		return nil, nil
	}
	return photo, nil
}

func messageThumbMedia(msg *tg.Message) (*tmedia.Media, bool) {
	media, ok := msg.GetMedia()
	if !ok {
		return nil, false
	}
	switch m := media.(type) {
	case *tg.MessageMediaPhoto:
		photo, ok := m.Photo.(*tg.Photo)
		if !ok {
			return nil, false
		}
		return photoThumb(photo)
	case *tg.MessageMediaDocument:
		doc, ok := m.Document.(*tg.Document)
		if !ok {
			return nil, false
		}
		return tmedia.GetDocumentThumb(doc)
	default:
		return nil, false
	}
}

func photoThumb(photo *tg.Photo) (*tmedia.Media, bool) {
	var chosen *tg.PhotoSize
	for _, size := range photo.Sizes {
		switch value := size.(type) {
		case *tg.PhotoSize:
			if value.Size <= 0 {
				continue
			}
			if chosen == nil || (value.Size <= 160*1024 && value.Size > chosen.Size) {
				chosen = value
			}
		case *tg.PhotoSizeProgressive:
			if len(value.Sizes) == 0 {
				continue
			}
			if chosen == nil {
				chosen = &tg.PhotoSize{Type: value.Type, W: value.W, H: value.H, Size: value.Sizes[len(value.Sizes)-1]}
			}
		}
	}
	if chosen == nil {
		return nil, false
	}
	return &tmedia.Media{
		InputFileLoc: &tg.InputPhotoFileLocation{
			ID:            photo.ID,
			AccessHash:    photo.AccessHash,
			FileReference: photo.FileReference,
			ThumbSize:     chosen.Type,
		},
		Name: fmt.Sprintf("%d_%s.jpg", photo.ID, chosen.Type),
		Size: int64(chosen.Size),
		DC:   photo.DCID,
		Date: int64(photo.Date),
	}, true
}

func thumbType(media *tmedia.Media) string {
	switch loc := media.InputFileLoc.(type) {
	case *tg.InputPhotoFileLocation:
		return loc.ThumbSize
	case *tg.InputDocumentFileLocation:
		return loc.ThumbSize
	default:
		return "thumb"
	}
}

func safeFilePart(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			builder.WriteRune(r)
		}
	}
	if builder.Len() == 0 {
		return "message"
	}
	return builder.String()
}
