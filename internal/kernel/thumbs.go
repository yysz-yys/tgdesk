package kernel

import (
	"context"
	"fmt"
	"strings"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// Image helpers shared by the loopback image server. Thumbnails, avatars and
// full photos are never written to disk; the server resolves them on demand and
// relies on the WebView HTTP cache plus a bounded in-memory cache.

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
		return documentThumbMedia(doc)
	case *tg.MessageMediaWebPage:
		page, ok := m.Webpage.(*tg.WebPage)
		if !ok {
			return nil, false
		}
		photo, ok := page.Photo.(*tg.Photo)
		if !ok {
			return nil, false
		}
		return photoThumb(photo)
	case *tg.MessageMediaGame:
		photo, ok := m.Game.Photo.(*tg.Photo)
		if !ok {
			return nil, false
		}
		return photoThumb(photo)
	default:
		return nil, false
	}
}

// documentThumbMedia chooses a real thumbnail size. tdl's GetDocumentThumb
// keeps the first *PhotoSize even when the document only carries progressive or
// stripped thumbs, which produces an empty thumb type and an invalid
// upload.getFile request (the image then hangs instead of failing).
func documentThumbMedia(doc *tg.Document) (*tmedia.Media, bool) {
	thumbs, ok := doc.GetThumbs()
	if !ok {
		return nil, false
	}
	var (
		chosen      *tg.PhotoSize
		smallest    *tg.PhotoSize
		progressive *tg.PhotoSize
	)
	for _, thumb := range thumbs {
		switch value := thumb.(type) {
		case *tg.PhotoSize:
			if value.Size <= 0 || value.Type == "" {
				continue
			}
			if smallest == nil || value.Size < smallest.Size {
				smallest = value
			}
			if value.Size <= 160*1024 && (chosen == nil || value.Size > chosen.Size) {
				chosen = value
			}
		case *tg.PhotoSizeProgressive:
			if len(value.Sizes) == 0 || value.Type == "" {
				continue
			}
			progressive = &tg.PhotoSize{
				Type: value.Type,
				W:    value.W,
				H:    value.H,
				Size: value.Sizes[len(value.Sizes)-1],
			}
		}
	}
	if chosen == nil {
		chosen = smallest
	}
	if chosen == nil {
		chosen = progressive
	}
	if chosen == nil {
		return nil, false
	}
	return &tmedia.Media{
		InputFileLoc: &tg.InputDocumentFileLocation{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
			ThumbSize:     chosen.Type,
		},
		Name: fmt.Sprintf("%d_%s.jpg", doc.ID, chosen.Type),
		Size: int64(chosen.Size),
		DC:   doc.DCID,
		Date: int64(doc.Date),
	}, true
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
	return photoSizeMedia(photo, chosen)
}

// avatarThumb picks a small profile-photo size for the full-avatar fallback.
func avatarThumb(photo *tg.Photo) (*tmedia.Media, bool) {
	var (
		smallest  *tg.PhotoSize
		preferred *tg.PhotoSize
	)
	for _, size := range photo.Sizes {
		var candidate *tg.PhotoSize
		switch value := size.(type) {
		case *tg.PhotoSize:
			candidate = value
		case *tg.PhotoSizeProgressive:
			if len(value.Sizes) == 0 {
				continue
			}
			candidate = &tg.PhotoSize{
				Type: value.Type,
				W:    value.W,
				H:    value.H,
				Size: value.Sizes[len(value.Sizes)-1],
			}
		}
		if candidate == nil || candidate.Size <= 0 {
			continue
		}
		if smallest == nil || candidate.Size < smallest.Size {
			smallest = candidate
		}
		if candidate.Size <= 24*1024 && (preferred == nil || candidate.Size > preferred.Size) {
			preferred = candidate
		}
	}
	if preferred == nil {
		preferred = smallest
	}
	return photoSizeMedia(photo, preferred)
}

func photoSizeMedia(photo *tg.Photo, chosen *tg.PhotoSize) (*tmedia.Media, bool) {
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

func fullPhotoMedia(photo *tg.Photo) (*tmedia.Media, bool) {
	if photo == nil {
		return nil, false
	}
	var chosen *tg.PhotoSize
	for _, size := range photo.Sizes {
		switch value := size.(type) {
		case *tg.PhotoSize:
			if value.Size > 0 && (chosen == nil || value.Size > chosen.Size) {
				chosen = value
			}
		case *tg.PhotoSizeProgressive:
			if len(value.Sizes) == 0 {
				continue
			}
			last := value.Sizes[len(value.Sizes)-1]
			if last > 0 && (chosen == nil || last > chosen.Size) {
				chosen = &tg.PhotoSize{Type: value.Type, W: value.W, H: value.H, Size: last}
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
		},
		Name: fmt.Sprintf("%d.jpg", photo.ID),
		Size: int64(chosen.Size),
		DC:   photo.DCID,
		Date: int64(photo.Date),
	}, true
}

// messageFullPhotoMedia returns the full-size photo attached to a webpage or
// game preview so the frontend can render a wide preview instead of a tiny
// 76 px thumbnail.
func messageFullPhotoMedia(msg *tg.Message) (*tmedia.Media, bool) {
	switch media := msg.Media.(type) {
	case *tg.MessageMediaWebPage:
		page, ok := media.Webpage.(*tg.WebPage)
		if !ok {
			return nil, false
		}
		photo, ok := page.Photo.(*tg.Photo)
		if !ok {
			return nil, false
		}
		return fullPhotoMedia(photo)
	case *tg.MessageMediaGame:
		photo, ok := media.Game.Photo.(*tg.Photo)
		if !ok {
			return nil, false
		}
		return fullPhotoMedia(photo)
	default:
		return nil, false
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
