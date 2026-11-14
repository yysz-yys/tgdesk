package kernel

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// The image pipeline mirrors how Telegram Web hands pictures to the browser:
// the UI gets a normal HTTP URL, the WebView loads it natively (with its own
// HTTP cache), and tgdesk never writes one JPEG per message next to the exe.
// Small images are additionally memoised in memory; full photos are streamed
// from MTProto on demand.

type imageRef struct {
	media *tmedia.Media
	mime  string
	proxy string
	ntp   string
}

type imageRefStore struct {
	mu    sync.Mutex
	refs  map[string]*imageRef
	order []string
	limit int
}

func newImageRefStore(limit int) *imageRefStore {
	if limit <= 0 {
		limit = 1024
	}
	return &imageRefStore{refs: make(map[string]*imageRef), limit: limit}
}

func mediaRefID(media *tmedia.Media) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf(
		"%d|%d|%s|%+v",
		media.DC,
		media.Size,
		media.Name,
		media.InputFileLoc,
	)))
	return hex.EncodeToString(sum[:16])
}

func (s *imageRefStore) put(ref *imageRef) string {
	id := mediaRefID(ref.media)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.refs[id]; !exists {
		s.order = append(s.order, id)
	}
	s.refs[id] = ref
	for len(s.order) > s.limit {
		oldest := s.order[0]
		s.order = s.order[1:]
		delete(s.refs, oldest)
	}
	return id
}

func (s *imageRefStore) get(id string) *imageRef {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refs[id]
}

type cachedImage struct {
	data    []byte
	mime    string
	expires time.Time
}

type imageCache struct {
	mu      sync.Mutex
	entries map[string]*cachedImage
	order   []string
	bytes   int64
	limit   int64
}

func newImageCache(limit int64) *imageCache {
	if limit <= 0 {
		limit = 32 << 20
	}
	return &imageCache{entries: make(map[string]*cachedImage), limit: limit}
}

func (c *imageCache) get(key string) (*cachedImage, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	if !entry.expires.IsZero() && time.Now().After(entry.expires) {
		c.removeLocked(key)
		return nil, false
	}
	c.touchLocked(key)
	return entry, true
}

func (c *imageCache) put(key string, data []byte, mimeType string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.removeLocked(key)
	entry := &cachedImage{data: data, mime: mimeType}
	if ttl > 0 {
		entry.expires = time.Now().Add(ttl)
	}
	c.entries[key] = entry
	c.order = append(c.order, key)
	c.bytes += int64(len(data))
	for c.bytes > c.limit && len(c.order) > 0 {
		oldest := c.order[0]
		c.order = c.order[1:]
		if old, ok := c.entries[oldest]; ok {
			c.bytes -= int64(len(old.data))
			delete(c.entries, oldest)
		}
	}
}

func (c *imageCache) touchLocked(key string) {
	for index, item := range c.order {
		if item == key {
			c.order = append(c.order[:index], c.order[index+1:]...)
			break
		}
	}
	c.order = append(c.order, key)
}

func (c *imageCache) removeLocked(key string) {
	if old, ok := c.entries[key]; ok {
		c.bytes -= int64(len(old.data))
		delete(c.entries, key)
	}
	for index, item := range c.order {
		if item == key {
			c.order = append(c.order[:index], c.order[index+1:]...)
			break
		}
	}
}

func (s *Service) noteMediaConfig(proxy, ntp string) {
	s.mediaConfigMu.Lock()
	s.mediaProxy = proxy
	s.mediaNTP = ntp
	s.mediaConfigMu.Unlock()
}

func (s *Service) mediaConfig() (string, string) {
	s.mediaConfigMu.RLock()
	defer s.mediaConfigMu.RUnlock()
	return s.mediaProxy, s.mediaNTP
}

func (s *Service) registerImage(media *tmedia.Media, proxy, ntp string) string {
	if media == nil || media.InputFileLoc == nil {
		return ""
	}
	return s.imageRefs.put(&imageRef{
		media: media,
		mime:  mediaMime(media),
		proxy: proxy,
		ntp:   ntp,
	})
}

func (s *Service) imageURL(id string, full bool) string {
	if id == "" {
		return ""
	}
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()
	if err := s.startMediaServerLocked(); err != nil {
		return ""
	}
	if full {
		return s.photoBase + id
	}
	return s.thumbBase + id
}

// avatarURL returns the loopback URL for a peer photo. The URL is stable for
// the lifetime of the process so the WebView can reuse its HTTP cache.
func (s *Service) avatarURL(chatID string) string {
	if strings.TrimSpace(chatID) == "" {
		return ""
	}
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()
	if err := s.startMediaServerLocked(); err != nil {
		return ""
	}
	encoded := base64.RawURLEncoding.EncodeToString([]byte(chatID))
	return s.avatarBase + encoded
}

// avatarURLFromEntity builds a profile-photo location straight from the
// entity embedded in a dialog/history response. Telegram accepts
// inputPeerPhotoFileLocation for that, so the avatar can be requested by the
// WebView without any users.getFullUser/channels.getFullChannel warm-up call.
func (s *Service) avatarURLFromEntity(
	peer tg.InputPeerClass,
	photoID int64,
	dc int,
	proxy, ntp string,
) string {
	if peer == nil || photoID == 0 {
		return ""
	}
	media := &tmedia.Media{
		InputFileLoc: &tg.InputPeerPhotoFileLocation{
			Peer:    peer,
			PhotoID: photoID,
		},
		Name: fmt.Sprintf("avatar_%d.jpg", photoID),
		DC:   dc,
	}
	return s.imageURL(s.registerImage(media, proxy, ntp), false)
}

func (s *Service) userAvatarURL(
	peer *tg.InputPeerUser,
	user *tg.User,
	proxy, ntp string,
) string {
	if peer == nil || user == nil {
		return ""
	}
	photo, ok := user.Photo.(*tg.UserProfilePhoto)
	if !ok || photo == nil {
		return ""
	}
	return s.avatarURLFromEntity(peer, photo.PhotoID, photo.DCID, proxy, ntp)
}

func (s *Service) chatAvatarURL(
	peer *tg.InputPeerChat,
	chat *tg.Chat,
	proxy, ntp string,
) string {
	if peer == nil || chat == nil {
		return ""
	}
	photo, ok := chat.Photo.(*tg.ChatPhoto)
	if !ok || photo == nil {
		return ""
	}
	return s.avatarURLFromEntity(peer, photo.PhotoID, photo.DCID, proxy, ntp)
}

func (s *Service) channelAvatarURL(
	peer *tg.InputPeerChannel,
	channel *tg.Channel,
	proxy, ntp string,
) string {
	if peer == nil || channel == nil {
		return ""
	}
	photo, ok := channel.Photo.(*tg.ChatPhoto)
	if !ok || photo == nil {
		return ""
	}
	return s.avatarURLFromEntity(peer, photo.PhotoID, photo.DCID, proxy, ntp)
}

// peerAvatarURL resolves the photo of the chat itself.
func (s *Service) peerAvatarURL(
	peer tg.InputPeerClass,
	users map[int64]*tg.User,
	chats map[int64]*tg.Chat,
	channels map[int64]*tg.Channel,
	proxy, ntp string,
) string {
	switch p := peer.(type) {
	case *tg.InputPeerUser:
		return s.userAvatarURL(p, users[p.UserID], proxy, ntp)
	case *tg.InputPeerChat:
		return s.chatAvatarURL(p, chats[p.ChatID], proxy, ntp)
	case *tg.InputPeerChannel:
		return s.channelAvatarURL(p, channels[p.ChannelID], proxy, ntp)
	default:
		return ""
	}
}

// senderAvatarURL resolves the photo of the user/channel that sent a message.
func (s *Service) senderAvatarURL(
	from tg.PeerClass,
	users map[int64]*tg.User,
	chats map[int64]*tg.Chat,
	channels map[int64]*tg.Channel,
	proxy, ntp string,
) string {
	switch p := from.(type) {
	case *tg.PeerUser:
		user := users[p.UserID]
		if user == nil {
			return ""
		}
		return s.userAvatarURL(
			&tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash},
			user,
			proxy,
			ntp,
		)
	case *tg.PeerChat:
		chat := chats[p.ChatID]
		if chat == nil {
			return ""
		}
		return s.chatAvatarURL(&tg.InputPeerChat{ChatID: chat.ID}, chat, proxy, ntp)
	case *tg.PeerChannel:
		channel := channels[p.ChannelID]
		if channel == nil {
			return ""
		}
		return s.channelAvatarURL(
			&tg.InputPeerChannel{
				ChannelID:  channel.ID,
				AccessHash: channel.AccessHash,
			},
			channel,
			proxy,
			ntp,
		)
	default:
		return ""
	}
}

// messageImageURLs registers the thumbnail (and, for photos, the full image)
// referenced by a message. It is called while mapping history so the UI never
// needs a second Telegram RPC just to discover an image.
func (s *Service) messageImageURLs(msg *tg.Message, proxy, ntp string) (thumb, photo string) {
	if thumbMedia, ok := messageThumbMedia(msg); ok {
		thumb = s.imageURL(s.registerImage(thumbMedia, proxy, ntp), false)
	}
	if full, ok := messageFullPhotoMedia(msg); ok {
		photo = s.imageURL(s.registerImage(full, proxy, ntp), true)
		return thumb, photo
	}
	if media, ok := tmedia.GetMedia(msg); ok && media != nil {
		photo = s.imageURL(s.registerImage(media, proxy, ntp), true)
	}
	return thumb, photo
}
func (s *Service) serveThumb(id string, w http.ResponseWriter, r *http.Request) {
	ref := s.imageRefs.get(id)
	if ref == nil {
		http.NotFound(w, r)
		return
	}
	key := "thumb:" + id
	if entry, ok := s.images.get(key); ok {
		writeImage(w, entry.data, entry.mime, "private, max-age=86400")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	data, mimeType, err := s.fetchImageRef(ctx, ref)
	if err != nil || len(data) == 0 {
		http.NotFound(w, r)
		return
	}
	s.images.put(key, data, mimeType, time.Hour)
	writeImage(w, data, mimeType, "private, max-age=86400")
}

func (s *Service) serveAvatar(encoded string, w http.ResponseWriter, r *http.Request) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(raw) == 0 {
		http.NotFound(w, r)
		return
	}
	chatID := string(raw)
	key := "avatar:" + chatID
	if entry, ok := s.images.get(key); ok {
		if len(entry.data) == 0 {
			http.NotFound(w, r)
			return
		}
		writeImage(w, entry.data, entry.mime, "private, max-age=600")
		return
	}

	proxy, ntp := s.mediaConfig()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	data, mimeType, err := s.fetchAvatarImage(ctx, chatID, proxy, ntp)
	if err != nil || len(data) == 0 {
		// Cache the miss briefly: groups often contain many messages from the
		// same user and none of them should trigger a full-user RPC.
		s.images.put(key, nil, "", 2*time.Minute)
		http.NotFound(w, r)
		return
	}
	s.images.put(key, data, mimeType, 10*time.Minute)
	writeImage(w, data, mimeType, "private, max-age=600")
}

func (s *Service) servePhoto(id string, w http.ResponseWriter, r *http.Request) {
	ref := s.imageRefs.get(id)
	if ref == nil {
		http.NotFound(w, r)
		return
	}
	media := ref.media
	if media.Size <= 0 {
		http.NotFound(w, r)
		return
	}

	start, end, partial, err := parseByteRange(r.Header.Get("Range"), media.Size)
	if err != nil {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", media.Size))
		http.Error(w, "invalid range", http.StatusRequestedRangeNotSatisfiable)
		return
	}
	mimeType := ref.mime
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "private, max-age=604800, immutable")
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	if partial {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, media.Size))
		w.WriteHeader(http.StatusPartialContent)
	}
	if r.Method == http.MethodHead {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	client, err := s.sessionPoolClient(ctx, ref.proxy, ref.ntp, media.DC)
	if err != nil {
		if !partial {
			http.Error(w, "media unavailable", http.StatusBadGateway)
		}
		return
	}

	const chunkLimit = int64(1024 * 1024)
	const align = int64(4096)
	pos := start
	for pos <= end {
		offset := pos / align * align
		limit := chunkLimit
		if remaining := media.Size - offset; limit > remaining {
			limit = remaining
		}
		limit = limit / align * align
		if limit < align {
			limit = align
		}
		result, fetchErr := client.UploadGetFile(ctx, &tg.UploadGetFileRequest{
			Location:     media.InputFileLoc,
			Offset:       offset,
			Limit:        int(limit),
			Precise:      true,
			CDNSupported: false,
		})
		if fetchErr != nil {
			return
		}
		file, ok := result.(*tg.UploadFile)
		if !ok || len(file.Bytes) == 0 {
			return
		}
		from := int(pos - offset)
		if from >= len(file.Bytes) {
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
		pos += available
	}
}

func (s *Service) fetchImageRef(ctx context.Context, ref *imageRef) ([]byte, string, error) {
	client, err := s.sessionPoolClient(ctx, ref.proxy, ref.ntp, ref.media.DC)
	if err != nil {
		return nil, "", err
	}
	limit := ref.media.Size
	const align = 4096
	if limit <= 0 {
		limit = 64 * 1024
	}
	limit = (limit + align - 1) / align * align
	if limit > 4*1024*1024 {
		limit = 4 * 1024 * 1024
	}
	result, err := client.UploadGetFile(ctx, &tg.UploadGetFileRequest{
		Location:     ref.media.InputFileLoc,
		Offset:       0,
		Limit:        int(limit),
		Precise:      true,
		CDNSupported: false,
	})
	if err != nil {
		return nil, "", err
	}
	file, ok := result.(*tg.UploadFile)
	if !ok || len(file.Bytes) == 0 {
		return nil, "", fmt.Errorf("image is not directly available")
	}
	data := file.Bytes
	mimeType := ref.mime
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	return data, mimeType, nil
}

func (s *Service) fetchAvatarImage(ctx context.Context, chatID, proxy, ntp string) ([]byte, string, error) {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, "", err
	}
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, "", err
	}
	photo, err := chatPhoto(ctx, client, peer)
	if err != nil || photo == nil {
		return nil, "", err
	}
	thumb, ok := avatarThumb(photo)
	if !ok {
		return nil, "", nil
	}
	return s.fetchImageRef(ctx, &imageRef{
		media: thumb,
		mime:  mediaMime(thumb),
		proxy: proxy,
		ntp:   ntp,
	})
}

func (s *Service) sessionPoolClient(
	ctx context.Context,
	proxy, ntp string,
	dc int,
) (*tg.Client, error) {
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.sessionMu.Lock()
	session := s.session
	s.sessionMu.Unlock()
	if session == nil || session.pool == nil {
		return client.API(), nil
	}
	return session.pool.Client(ctx, dc), nil
}

// GetSelfAvatarURL resolves the signed-in user's profile photo URL. An empty
// result means "use initials"; the URL itself is served by the loopback server.
func (s *Service) GetSelfAvatarURL(proxy, ntp string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return "", err
	}
	self, err := client.Self(ctx)
	if err != nil {
		return "", fmt.Errorf("fetch self: %w", err)
	}
	if self == nil || self.ID == 0 {
		return "", nil
	}
	s.noteMediaConfig(proxy, ntp)
	return s.userAvatarURL(
		&tg.InputPeerUser{UserID: self.ID, AccessHash: self.AccessHash},
		self,
		proxy,
		ntp,
	), nil
}

func writeImage(w http.ResponseWriter, data []byte, mimeType, cacheControl string) {
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	// Sticker/GIF picker thumbs and full documents are fetched by the WebView
	// from this loopback server; a cross-origin read (canvas export, non-iframe
	// preview hosts) would otherwise be blocked.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}

func mediaMime(media *tmedia.Media) string {
	if media == nil {
		return ""
	}
	ext := strings.ToLower(filepath.Ext(media.Name))
	if value := mime.TypeByExtension(ext); value != "" && value != "application/octet-stream" {
		return value
	}
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg", ".oga", ".opus":
		return "audio/ogg"
	case ".m4a":
		return "audio/mp4"
	case ".flac":
		return "audio/flac"
	case ".wav":
		return "audio/wav"
	case ".tgs":
		return "application/x-tgsticker"
	case ".json":
		return "application/json"
	}
	return ""
}
