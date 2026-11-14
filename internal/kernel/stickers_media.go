package kernel

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// Sticker/GIF media plumbing. The picker never sees raw Telegram file
// locations: the kernel mints opaque refs for documents and sets, keeps the
// actual *tg.Document (with its short-lived file_reference) in a bounded side
// map, and serves thumbnails/full documents through the existing loopback image
// server. A ref carries enough metadata (id, kind, list source) to re-fetch the
// document when its file_reference expires.

const (
	// stickerDocRefPrefix / stickerSetRefPrefix make the two token families
	// recognizable in logs and reject refs minted by other builds.
	stickerDocRefPrefix = "sdoc1_"
	stickerSetRefPrefix = "sset1_"

	// stickerRefKindSticker / stickerRefKindGif are the send kinds. The visual
	// document kind (static/tgs/webm/gif) lives on the DTO.
	stickerRefKindSticker = "sticker"
	stickerRefKindGif     = "gif"

	// Sticker list sources, used only to refresh an expired document ref.
	// Round 3 adds the server-side search and the favorites list; set-owned
	// results from either list keep source "set" so their reference is refreshed
	// through messages.getStickerSet.
	stickerRefSourceRecent    = "recent"
	stickerRefSourceSet       = "set"
	stickerRefSourceGif       = "gif"
	stickerRefSourceSearch    = "search"
	stickerRefSourceFavorites = "favorites"

	// stickerThumbTargetPx is the grid cell size the picker asks for (72 px
	// stickers, 124 px GIFs). Telegram serves ~100 px thumbs under type "m".
	stickerThumbTargetPx = 100
)

// stickerDocRef is the opaque document token payload. It is base64url-encoded
// JSON under a prefix, so it is DOM-safe and stable as a React key.
type stickerDocRef struct {
	ID     int64  `json:"id"`
	Kind   string `json:"kind"`             // "sticker" | "gif"
	Source string `json:"source"`           // "recent" | "set" | "gif" | "search" | "favorites"
	SetRef string `json:"setRef,omitempty"` // set token when Source == "set"
	Query  string `json:"q,omitempty"`      // search query when Source == "search"
}

// stickerRefQueryLimit bounds the query embedded in a search document token.
const stickerRefQueryLimit = 120

func encodeStickerDocRef(ref stickerDocRef) string {
	raw, err := json.Marshal(ref)
	if err != nil {
		return ""
	}
	return stickerDocRefPrefix + base64.RawURLEncoding.EncodeToString(raw)
}

func decodeStickerDocRef(value string) (stickerDocRef, error) {
	var ref stickerDocRef
	if !strings.HasPrefix(value, stickerDocRefPrefix) {
		return ref, fmt.Errorf("invalid sticker reference")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, stickerDocRefPrefix))
	if err != nil {
		return ref, fmt.Errorf("invalid sticker reference: %w", err)
	}
	if err := json.Unmarshal(raw, &ref); err != nil {
		return ref, fmt.Errorf("invalid sticker reference: %w", err)
	}
	if ref.ID == 0 {
		return ref, fmt.Errorf("invalid sticker reference: missing document id")
	}
	switch ref.Kind {
	case stickerRefKindSticker, stickerRefKindGif:
	default:
		return ref, fmt.Errorf("invalid sticker reference: unknown kind")
	}
	switch ref.Source {
	case stickerRefSourceRecent, stickerRefSourceSet, stickerRefSourceGif,
		stickerRefSourceSearch, stickerRefSourceFavorites:
	default:
		return ref, fmt.Errorf("invalid sticker reference: unknown source")
	}
	if ref.Source == stickerRefSourceSet {
		if _, _, err := decodeStickerSetRef(ref.SetRef); err != nil {
			return ref, fmt.Errorf("invalid sticker reference: %w", err)
		}
	}
	if ref.Source == stickerRefSourceSearch && strings.TrimSpace(ref.Query) == "" {
		return ref, fmt.Errorf("invalid sticker reference: missing search query")
	}
	return ref, nil
}

// stickerDocRefForList builds the token of one document listed by a picker
// source. Set-owned documents always refresh through messages.getStickerSet;
// only unclaimed search/favorites documents carry the list-specific source (and,
// for search, the query needed to find them again).
func stickerDocRefForList(doc *tg.Document, kind, source, query string) stickerDocRef {
	ref := stickerDocRef{ID: doc.ID, Kind: kind, Source: source}
	if setRef := stickerSetRefOf(doc); setRef != "" {
		ref.Source = stickerRefSourceSet
		ref.SetRef = setRef
		return ref
	}
	if source == stickerRefSourceSearch {
		ref.Query = truncateStickerSearchQuery(query)
	}
	return ref
}

// truncateStickerSearchQuery keeps a search token bounded (and valid even when
// the caller sent a very long query).
func truncateStickerSearchQuery(query string) string {
	query = strings.TrimSpace(query)
	runes := []rune(query)
	if len(runes) > stickerRefQueryLimit {
		return string(runes[:stickerRefQueryLimit])
	}
	return query
}

// encodeStickerSetRef builds the opaque installed-set token from the set id and
// access hash (fixed 16-byte big-endian payload).
func encodeStickerSetRef(id, accessHash int64) string {
	var raw [16]byte
	binary.BigEndian.PutUint64(raw[0:8], uint64(id))
	binary.BigEndian.PutUint64(raw[8:16], uint64(accessHash))
	return stickerSetRefPrefix + base64.RawURLEncoding.EncodeToString(raw[:])
}

func decodeStickerSetRef(value string) (id, accessHash int64, err error) {
	if !strings.HasPrefix(value, stickerSetRefPrefix) {
		return 0, 0, fmt.Errorf("invalid sticker set reference")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, stickerSetRefPrefix))
	if err != nil || len(raw) != 16 {
		return 0, 0, fmt.Errorf("invalid sticker set reference")
	}
	id = int64(binary.BigEndian.Uint64(raw[0:8]))
	accessHash = int64(binary.BigEndian.Uint64(raw[8:16]))
	if id == 0 {
		return 0, 0, fmt.Errorf("invalid sticker set reference")
	}
	return id, accessHash, nil
}

// ---------------------------------------------------------- classification

// stickerDocKind classifies a document exactly like Telegram Web K's
// appDocsManager: TGS (gzip Lottie), WebM video sticker, static WebP/PNG or an
// animated GIF/MP4. Empty means "not a sticker/GIF document".
func stickerDocKind(doc *tg.Document) string {
	if doc == nil || doc.ID == 0 {
		return ""
	}
	if hasCustomEmojiAttribute(doc) || isMaskDocument(doc) {
		return ""
	}
	switch doc.MimeType {
	case "application/x-tgsticker":
		return "tgs"
	case "video/webm":
		return "webm"
	case "image/webp", "image/png":
		return "static"
	}
	if isAnimatedDocument(doc) {
		switch doc.MimeType {
		case "video/mp4", "image/gif":
			return "gif"
		}
	}
	return ""
}

// isStickerDocument reports whether a document is a sendable sticker (not a
// custom emoji and not a mask).
func isStickerDocument(doc *tg.Document) bool {
	if doc == nil || hasCustomEmojiAttribute(doc) || isMaskDocument(doc) {
		return false
	}
	_, ok := stickerAttribute(doc)
	if !ok {
		return false
	}
	switch stickerDocKind(doc) {
	case "static", "tgs", "webm":
		return true
	default:
		return false
	}
}

// isGifDocument reports whether a document is an animated GIF-style document
// (Telegram stores GIFs as MP4, legacy accounts may still have image/gif).
func isGifDocument(doc *tg.Document) bool {
	if doc == nil || hasCustomEmojiAttribute(doc) || isMaskDocument(doc) {
		return false
	}
	if stickerDocKind(doc) != "gif" {
		return false
	}
	_, sticker := stickerAttribute(doc)
	return !sticker
}

func isAnimatedDocument(doc *tg.Document) bool {
	if doc == nil {
		return false
	}
	for _, attr := range doc.Attributes {
		if _, ok := attr.(*tg.DocumentAttributeAnimated); ok {
			return true
		}
	}
	return false
}

func hasCustomEmojiAttribute(doc *tg.Document) bool {
	if doc == nil {
		return false
	}
	for _, attr := range doc.Attributes {
		if _, ok := attr.(*tg.DocumentAttributeCustomEmoji); ok {
			return true
		}
	}
	return false
}

func stickerAttribute(doc *tg.Document) (*tg.DocumentAttributeSticker, bool) {
	if doc == nil {
		return nil, false
	}
	for _, attr := range doc.Attributes {
		if sticker, ok := attr.(*tg.DocumentAttributeSticker); ok {
			return sticker, true
		}
	}
	return nil, false
}

func isMaskDocument(doc *tg.Document) bool {
	sticker, ok := stickerAttribute(doc)
	return ok && sticker.Mask
}

// stickerEmoji returns the DocumentAttributeSticker alt (the sticker's emoji).
func stickerEmoji(doc *tg.Document) string {
	sticker, ok := stickerAttribute(doc)
	if !ok {
		return ""
	}
	return sticker.Alt
}

// stickerSetRefOf extracts the owning set reference of a sticker document.
// Unclaimed stickers carry inputStickerSetEmpty and have no set.
func stickerSetRefOf(doc *tg.Document) string {
	sticker, ok := stickerAttribute(doc)
	if !ok {
		return ""
	}
	set, ok := sticker.Stickerset.(*tg.InputStickerSetID)
	if !ok || set.ID == 0 {
		return ""
	}
	return encodeStickerSetRef(set.ID, set.AccessHash)
}

// documentDimensions reads the declared size of a document (video attribute
// first, image size otherwise).
func documentDimensions(doc *tg.Document) (width, height int) {
	if doc == nil {
		return 0, 0
	}
	for _, attr := range doc.Attributes {
		switch value := attr.(type) {
		case *tg.DocumentAttributeVideo:
			if value.W > 0 && value.H > 0 {
				return value.W, value.H
			}
		case *tg.DocumentAttributeImageSize:
			if value.W > 0 && value.H > 0 {
				return value.W, value.H
			}
		}
	}
	return 0, 0
}

// documentDuration reads the video/GIF duration in seconds.
func documentDuration(doc *tg.Document) float64 {
	if doc == nil {
		return 0
	}
	for _, attr := range doc.Attributes {
		if video, ok := attr.(*tg.DocumentAttributeVideo); ok {
			return video.Duration
		}
	}
	return 0
}

// --------------------------------------------------------------- thumbnails

// pickerThumb picks a still thumbnail for a small grid cell without the
// message-bubble policy of documentThumbMedia (which prefers the largest thumb
// under 160 KB and can pick an 800 px image). Preference order:
//  1. type "m" (~100 px, what Telegram Web uses for the grid);
//  2. the smallest candidate at least target-ish in its longest side;
//  3. the largest candidate below that;
//  4. whatever valid candidate remains.
//
// Progressive thumbs are converted to their final size; stripped/empty thumbs
// are ignored (they cannot be fetched with InputDocumentFileLocation).
func pickerThumb(doc *tg.Document, targetPx int) (*tg.PhotoSize, bool) {
	if targetPx <= 0 {
		targetPx = stickerThumbTargetPx
	}
	thumbs, ok := doc.GetThumbs()
	if !ok || len(thumbs) == 0 {
		return nil, false
	}

	var candidates []*tg.PhotoSize
	var preferredM *tg.PhotoSize
	for _, thumb := range thumbs {
		var candidate *tg.PhotoSize
		switch value := thumb.(type) {
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
		default:
			continue
		}
		if candidate == nil || candidate.Size <= 0 || candidate.Type == "" {
			continue
		}
		candidates = append(candidates, candidate)
		if candidate.Type == "m" && (preferredM == nil || candidate.Size < preferredM.Size) {
			preferredM = candidate
		}
	}
	if len(candidates) == 0 {
		return nil, false
	}
	if preferredM != nil && preferredM.Size <= 160*1024 {
		return preferredM, true
	}

	var (
		atLeast *tg.PhotoSize
		below   *tg.PhotoSize
	)
	for _, candidate := range candidates {
		longest := candidate.W
		if candidate.H > longest {
			longest = candidate.H
		}
		if longest == 0 {
			// No dimensions: fall back to file size as a rough proxy.
			longest = int(candidate.Size)
		}
		if longest >= targetPx {
			if atLeast == nil || longest < latestLongest(atLeast) ||
				(longest == latestLongest(atLeast) && candidate.Size < atLeast.Size) {
				atLeast = candidate
			}
		} else {
			if below == nil || longest > latestLongest(below) ||
				(longest == latestLongest(below) && candidate.Size > below.Size) {
				below = candidate
			}
		}
	}
	if atLeast != nil {
		return atLeast, true
	}
	if below != nil {
		return below, true
	}
	return candidates[0], true
}

func latestLongest(size *tg.PhotoSize) int {
	if size == nil {
		return 0
	}
	if size.H > size.W {
		return size.H
	}
	return size.W
}

// stickerThumbMedia builds the loopback media for a document thumbnail.
func stickerThumbMedia(doc *tg.Document, targetPx int) (*tmedia.Media, bool) {
	thumb, ok := pickerThumb(doc, targetPx)
	if !ok {
		return nil, false
	}
	return &tmedia.Media{
		InputFileLoc: &tg.InputDocumentFileLocation{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
			ThumbSize:     thumb.Type,
		},
		Name: fmt.Sprintf("%d_%s.jpg", doc.ID, thumb.Type),
		Size: int64(thumb.Size),
		DC:   doc.DCID,
		Date: int64(doc.Date),
	}, true
}

// stickerDocumentMedia builds the full-document file location used for TGS /
// WebM / GIF playback. The name extension drives the Content-Type returned by
// mediaMime, which <video> requires.
func stickerDocumentMedia(doc *tg.Document, kind string) (*tmedia.Media, bool) {
	if doc == nil || doc.ID == 0 || doc.Size <= 0 {
		return nil, false
	}
	ext := ".bin"
	switch kind {
	case "tgs":
		ext = ".tgs"
	case "webm":
		ext = ".webm"
	case "gif":
		switch doc.MimeType {
		case "video/mp4":
			ext = ".mp4"
		case "image/gif":
			ext = ".gif"
		default:
			ext = ".mp4"
		}
	case "static":
		switch doc.MimeType {
		case "image/webp":
			ext = ".webp"
		case "image/png":
			ext = ".png"
		default:
			ext = ".jpg"
		}
	}
	return &tmedia.Media{
		InputFileLoc: &tg.InputDocumentFileLocation{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
		},
		Name: fmt.Sprintf("%d%s", doc.ID, ext),
		Size: doc.Size,
		DC:   doc.DCID,
		Date: int64(doc.Date),
	}, true
}

// stickerSetCoverMedia builds the InputStickerSetThumb location of a set cover.
// The thumb type encodes the format: "a" = TGS, "v" = WebM, anything else is a
// static WebP/JPEG.
func stickerSetCoverMedia(set *tg.StickerSet) (*tmedia.Media, string, bool) {
	if set == nil || set.ID == 0 || len(set.Thumbs) == 0 {
		return nil, "", false
	}
	size, ok := photoSizeForCover(set.Thumbs[0])
	if !ok {
		return nil, "", false
	}
	// Set cover bytes are WebP/TGS/WebM (not document JPEG thumbs): the
	// thumbnail type encodes the format and the extension drives mediaMime.
	kind := "static"
	ext := ".webp"
	switch size.Type {
	case "a":
		kind, ext = "tgs", ".tgs"
	case "v":
		kind, ext = "webm", ".webm"
	}
	version, _ := set.GetThumbVersion()
	dc, _ := set.GetThumbDCID()
	return &tmedia.Media{
		InputFileLoc: &tg.InputStickerSetThumb{
			Stickerset:   &tg.InputStickerSetID{ID: set.ID, AccessHash: set.AccessHash},
			ThumbVersion: version,
		},
		Name: fmt.Sprintf("set_%d%s", set.ID, ext),
		Size: int64(size.Size),
		DC:   dc,
	}, kind, true
}

func photoSizeForCover(raw tg.PhotoSizeClass) (*tg.PhotoSize, bool) {
	switch value := raw.(type) {
	case *tg.PhotoSize:
		if value.Size > 0 && value.Type != "" {
			return value, true
		}
	case *tg.PhotoSizeProgressive:
		if len(value.Sizes) == 0 || value.Type == "" {
			return nil, false
		}
		return &tg.PhotoSize{
			Type: value.Type,
			W:    value.W,
			H:    value.H,
			Size: value.Sizes[len(value.Sizes)-1],
		}, true
	}
	return nil, false
}

// stickerSetCoverURL registers the set cover (or returns an empty string when
// the set carries no thumbnail, in which case the caller falls back to the
// first sticker of the set).
func (s *Service) stickerSetCoverURL(set *tg.StickerSet, proxy, ntp string) (coverURL, coverKind string) {
	media, kind, ok := stickerSetCoverMedia(set)
	if !ok {
		return "", ""
	}
	return s.imageURL(s.registerImage(media, proxy, ntp), false), kind
}

// stickerMediaURLs registers the picker thumbnail and the full document for one
// sticker/GIF. static stickers get the full document as PhotoURL so the cell can
// fall back to an <img> when Telegram provided no still thumb.
func (s *Service) stickerMediaURLs(
	doc *tg.Document,
	kind string,
	targetPx int,
	proxy, ntp string,
) (thumbURL, streamURL, photoURL string) {
	if thumb, ok := stickerThumbMedia(doc, targetPx); ok {
		thumbURL = s.imageURL(s.registerImage(thumb, proxy, ntp), false)
	}
	if full, ok := stickerDocumentMedia(doc, kind); ok {
		streamURL = s.imageURL(s.registerImage(full, proxy, ntp), true)
	}
	switch kind {
	case "static":
		photoURL = streamURL
		streamURL = ""
	}
	return thumbURL, streamURL, photoURL
}
