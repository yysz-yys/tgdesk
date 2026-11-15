package kernel

import (
	"context"
	"encoding/base64"
	"encoding/hex"
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

// Stripped thumbnails are the tiny JPEG previews Telegram embeds in the message
// itself (photoStrippedSize / photoCachedSize bytes) instead of making the
// client fetch them. Telegram Web paints them immediately, blurred, while the
// real preview downloads; serving them inline is what makes opening a photo
// chat feel instant. The reconstruction follows the public stripped-thumbnail
// format (see https://core.telegram.org/api/files#stripped-thumbnails).
const strippedJPEGHeaderHex = "ffd8ffe000104a46494600010100000100010000ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58ca5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc00011080000000003012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00"

var strippedJPEGHeader = func() []byte {
	header, err := hex.DecodeString(strippedJPEGHeaderHex)
	if err != nil {
		return nil
	}
	return header
}()

var strippedJPEGTail = []byte{0xff, 0xd9}

// strippedThumbJPEG rebuilds the progressive JPEG preview from a
// photoStrippedSize payload. The payload starts with 0x01, then two bytes that
// patch the origin quantisation table, then the JPEG scan body; the rest of the
// frame header is fixed. Payloads without the 0x01 marker are already complete
// JPEGs (photoCachedSize-style) and are returned unchanged.
func strippedThumbJPEG(payload []byte) []byte {
	if len(payload) == 0 {
		return nil
	}
	if payload[0] != 0x01 {
		return payload
	}
	if len(payload) <= 3 || len(strippedJPEGHeader) == 0 {
		return nil
	}
	out := make([]byte, 0, len(strippedJPEGHeader)+len(payload)-3+len(strippedJPEGTail))
	out = append(out, strippedJPEGHeader...)
	out = append(out, payload[3:]...)
	out = append(out, strippedJPEGTail...)
	if len(out) > 166 {
		out[164] = payload[1]
		out[166] = payload[2]
	}
	return out
}

// inlinePreviewJPEG returns the complete inline preview carried by a photo or
// thumbnail list, preferring the fully cached size (a complete JPEG) over the
// stripped one.
func inlinePreviewJPEG(sizes []tg.PhotoSizeClass) []byte {
	var stripped []byte
	for _, size := range sizes {
		switch value := size.(type) {
		case *tg.PhotoCachedSize:
			if len(value.Bytes) > 0 {
				return value.Bytes
			}
		case *tg.PhotoStrippedSize:
			if stripped == nil {
				stripped = strippedThumbJPEG(value.Bytes)
			}
		}
	}
	return stripped
}

func photoInlinePreview(photo *tg.Photo) []byte {
	if photo == nil {
		return nil
	}
	return inlinePreviewJPEG(photo.Sizes)
}

func documentInlinePreview(doc *tg.Document) []byte {
	if doc == nil {
		return nil
	}
	return inlinePreviewJPEG(doc.Thumbs)
}

// messagePlaceholderURL returns the inline data URL of the tiny blurred preview
// Telegram already ships inside the message, so the UI can paint a photo (and
// video poster) before the thumbnail request completes. It is a data URL on
// purpose: no loopback request is needed for the first paint, and the value is
// valid across restarts so the local snapshot cache can keep it.
func messagePlaceholderURL(msg *tg.Message) string {
	if msg == nil {
		return ""
	}
	var jpeg []byte
	switch media := msg.Media.(type) {
	case *tg.MessageMediaPhoto:
		photo, ok := media.Photo.(*tg.Photo)
		if ok {
			jpeg = photoInlinePreview(photo)
		}
	case *tg.MessageMediaDocument:
		doc, ok := media.Document.(*tg.Document)
		if ok {
			jpeg = documentInlinePreview(doc)
		}
	case *tg.MessageMediaWebPage:
		page, ok := media.Webpage.(*tg.WebPage)
		if ok {
			photo, ok := page.Photo.(*tg.Photo)
			if ok {
				jpeg = photoInlinePreview(photo)
			}
		}
	case *tg.MessageMediaGame:
		photo, ok := media.Game.Photo.(*tg.Photo)
		if ok {
			jpeg = photoInlinePreview(photo)
		}
	}
	if len(jpeg) == 0 {
		return ""
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(jpeg)
}

// mediaDCsOfMessages lists the data centers that hold the files referenced by a
// history page: photo and document media live in the DC they were uploaded to,
// so a single page can require several media connections. The list feeds the
// background warm-up that connects those DCs before the UI requests the images.
func mediaDCsOfMessages(messages []tg.MessageClass) []int {
	var dcs []int
	appendMedia := func(media tg.MessageMediaClass) {
		switch value := media.(type) {
		case *tg.MessageMediaPhoto:
			if photo, ok := value.Photo.(*tg.Photo); ok && photo.DCID > 0 {
				dcs = append(dcs, photo.DCID)
			}
		case *tg.MessageMediaDocument:
			if doc, ok := value.Document.(*tg.Document); ok && doc.DCID > 0 {
				dcs = append(dcs, doc.DCID)
			}
		case *tg.MessageMediaWebPage:
			if page, ok := value.Webpage.(*tg.WebPage); ok {
				if photo, ok := page.Photo.(*tg.Photo); ok && photo.DCID > 0 {
					dcs = append(dcs, photo.DCID)
				}
			}
		case *tg.MessageMediaGame:
			if photo, ok := value.Game.Photo.(*tg.Photo); ok && photo.DCID > 0 {
				dcs = append(dcs, photo.DCID)
			}
		}
	}
	for _, raw := range messages {
		if message, ok := raw.(*tg.Message); ok && message.Media != nil {
			appendMedia(message.Media)
		}
	}
	return dcs
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
