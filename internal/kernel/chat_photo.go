package kernel

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/uploader"
	"github.com/gotd/td/tg"
)

const (
	// maxChatPhotoBytes is Telegram's photo upload limit (10 MB). The frontend
	// already centre-crops the picked image to a ≤800×800 JPEG, so a legitimate
	// avatar is a few hundred KB; the cap only rejects garbage.
	maxChatPhotoBytes = 10 << 20
	// chatPhotoPartSize is Web K's upload part size for media (512 KB).
	chatPhotoPartSize = 512 * 1024
	// chatPhotoUploadThreads matches the attachment uploader.
	chatPhotoUploadThreads = 4
	// chatPhotoUploadTimeout bounds decode+upload+editPhoto; an avatar is small
	// but it travels through the user's proxy.
	chatPhotoUploadTimeout = 90 * time.Second
)

// chatPhotoData is one decoded avatar payload with the image kind sniffed from
// its magic bytes.
type chatPhotoData struct {
	data []byte
	mime string
	// ext is the file extension used for the upload name (Telegram stores the
	// file under this name until it re-encodes it as a profile photo).
	ext string
}

// decodeChatPhoto parses the data URL the avatar editor produces
// (`data:image/jpeg;base64,…`) or bare base64, validates that it is a
// JPEG/PNG/WebP image with non-zero size below Telegram's limit, and returns
// the raw bytes ready for upload. Width/height are not checked: Telegram
// re-encodes the photo server-side and rejects degenerate images with its own
// error, which the caller surfaces as a normal failure.
func decodeChatPhoto(photoBase64 string) (chatPhotoData, error) {
	value := strings.TrimSpace(photoBase64)
	if value == "" {
		return chatPhotoData{}, fmt.Errorf("chat photo is empty")
	}
	if strings.HasPrefix(value, "data:") {
		comma := strings.IndexByte(value, ',')
		if comma < 0 {
			return chatPhotoData{}, fmt.Errorf("chat photo data URL has no payload")
		}
		header := value[len("data:"):comma]
		if !strings.HasSuffix(header, ";base64") {
			return chatPhotoData{}, fmt.Errorf("chat photo data URL is not base64 encoded")
		}
		value = value[comma+1:]
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return chatPhotoData{}, fmt.Errorf("chat photo is empty")
	}

	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		// Be tolerant of an unpadded payload; the canvas encoder always pads, but
		// a caller may hand over a hash-safe variant.
		data, err = base64.RawStdEncoding.DecodeString(value)
		if err != nil {
			return chatPhotoData{}, fmt.Errorf("chat photo is not valid base64")
		}
	}
	mime, ext, err := chatPhotoFormat(data)
	if err != nil {
		return chatPhotoData{}, err
	}
	return chatPhotoData{data: data, mime: mime, ext: ext}, nil
}

// chatPhotoFormat sniffs the image kind from the payload's magic bytes so a
// renamed or mislabelled file cannot be uploaded as a profile photo. Telegram
// only accepts JPEG/PNG for static chat photo uploads; WebP is sent by Web K
// too (it re-encodes it), so it is accepted here as well.
func chatPhotoFormat(data []byte) (mime string, ext string, err error) {
	if len(data) == 0 {
		return "", "", fmt.Errorf("chat photo is empty")
	}
	if len(data) > maxChatPhotoBytes {
		return "", "", fmt.Errorf("chat photo is larger than 10 MB")
	}
	switch {
	case bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg", ".jpg", nil
	case bytes.HasPrefix(data, []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}):
		return "image/png", ".png", nil
	case len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "image/webp", ".webp", nil
	default:
		return "", "", fmt.Errorf("chat photo must be a JPEG, PNG or WebP image")
	}
}

// chatPhotoTarget is the dispatch SetChatPhoto performs on the parsed peer:
// channels/supergroups edit their photo with channels.editPhoto, legacy basic
// groups with messages.editChatPhoto (the same split InviteToChannel makes).
type chatPhotoTarget struct {
	kind    string // "channel" or "chat"
	channel *tg.InputChannel
	chatID  int64
}

// chatPhotoTargetFor resolves which editPhoto RPC applies to a parsed peer id.
// Private users have no chat photo endpoint (profile photos are set through
// users/photos RPCs, not a chat), so they are rejected.
func chatPhotoTargetFor(peer tg.InputPeerClass) (chatPhotoTarget, error) {
	switch value := peer.(type) {
	case *tg.InputPeerChannel:
		return chatPhotoTarget{
			kind: "channel",
			channel: &tg.InputChannel{
				ChannelID:  value.ChannelID,
				AccessHash: value.AccessHash,
			},
		}, nil
	case *tg.InputPeerChat:
		return chatPhotoTarget{kind: "chat", chatID: value.ChatID}, nil
	default:
		return chatPhotoTarget{}, fmt.Errorf("chat photo: this peer type has no editable photo")
	}
}

// SetChatPhoto uploads a photo and applies it to an existing channel/supergroup
// or basic group. Telegram Web K does the same two-step right after creating a
// chat (`newChannel.tsx:52-58`, `newGroup.tsx:170-178`): Layer 233's
// channels.createChannel / messages.createChat take no photo, so the image is
// uploaded with upload.saveFilePart (uploader.Upload picks saveBigFilePart above
// 10 MB, which the size cap makes impossible here) and then referenced as
// InputChatUploadedPhoto by channels.editPhoto / messages.editChatPhoto.
// photoBase64 is the canvas data URL produced by the avatar editor.
//
// The dialog cache is invalidated on success so the next GetChats call picks up
// the new chat photo; a failure leaves the already-created chat untouched.
func (s *Service) SetChatPhoto(proxy, ntp, chatID, photoBase64 string) error {
	if strings.TrimSpace(chatID) == "" {
		return fmt.Errorf("invalid chat")
	}
	photo, err := decodeChatPhoto(photoBase64)
	if err != nil {
		return err
	}
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	target, err := chatPhotoTargetFor(peer)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), chatPhotoUploadTimeout)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		up := uploader.NewUploader(client.API()).
			WithThreads(chatPhotoUploadThreads).
			WithPartSize(chatPhotoPartSize)
		file, err := up.Upload(ctx, uploader.NewUpload(
			"avatar"+photo.ext,
			bytes.NewReader(photo.data),
			int64(len(photo.data)),
		))
		if err != nil {
			return readableRPCError("upload chat photo", err)
		}
		input := &tg.InputChatUploadedPhoto{File: file}
		switch target.kind {
		case "channel":
			_, err = client.API().ChannelsEditPhoto(ctx, &tg.ChannelsEditPhotoRequest{
				Channel: target.channel,
				Photo:   input,
			})
		default:
			_, err = client.API().MessagesEditChatPhoto(ctx, &tg.MessagesEditChatPhotoRequest{
				ChatID: target.chatID,
				Photo:  input,
			})
		}
		if err != nil {
			return readableRPCError("set chat photo", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	s.rememberPeer(peer)
	s.invalidateChatCaches(chatID)
	return nil
}
