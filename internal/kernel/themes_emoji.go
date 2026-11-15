package kernel

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// Telegram Web K draws a small animated-emoji figure (house, chick, snowman,
// ...) at the bottom of every Appearance theme tile and plays its Lottie
// animation when the tile is clicked. The figures are the stickers of the
// account's animated-emoji set (messages.getStickerSet +
// InputStickerSetAnimatedEmoji): application/x-tgsticker documents whose bytes
// are a gzip-compressed Lottie JSON. They are served from the loopback media
// server exactly like theme patterns: the endpoint downloads and gunzips the
// document on the first request and keeps the decoded JSON in the byte-bounded
// image cache.
const (
	// animatedEmojiMax limits one GetAnimatedEmojiStickers call; the Appearance
	// strip only ever asks for the emoticons of its tiles.
	animatedEmojiMax = 32
	// animatedEmojiMIME is what the /emoji/ route answers with. lottie-web
	// parses either form, but a JSON content type keeps the WebView's network
	// panel and cache behaviour honest.
	animatedEmojiMIME = "application/json; charset=utf-8"
	// animatedEmojiVS16 is the emoji variation selector. Pack keys usually omit
	// it while the sticker attribute Alt may include it ("⛄" vs "⛄️"), so
	// lookups compare with it removed from both sides. Other variation selectors
	// and joiners (ZWJ sequences such as "👨‍🏫") are deliberately kept.
	animatedEmojiVS16 = "\ufe0f"
)

// AnimatedEmojiDTO is one animated-emoji sticker: the Lottie figure Web K draws
// at the bottom of an Appearance theme tile (house, chick, snowman, ...).
type AnimatedEmojiDTO struct {
	Emoticon string `json:"emoticon"`
	// URL is the loopback HTTP URL of the sticker's Lottie JSON (empty when the
	// animated-emoji set has no sticker for the emoticon).
	URL string `json:"url,omitempty"`
}

// GetAnimatedEmojiStickers resolves the animated-emoji stickers for the given
// emoticons and returns their loopback Lottie URLs. The sticker set metadata is
// loaded once per process; the sticker bytes are only downloaded when the
// WebView requests the returned URL (the method itself never downloads them).
// Unknown emoticons still get an entry, with an empty URL, so the UI can keep
// the request order.
func (s *Service) GetAnimatedEmojiStickers(
	proxy, ntp string,
	emoticons []string,
) ([]AnimatedEmojiDTO, error) {
	wanted := normalizeAnimatedEmojiRequest(emoticons)
	result := make([]AnimatedEmojiDTO, 0, len(wanted))
	if len(wanted) == 0 {
		return result, nil
	}

	documents, err := s.animatedEmojiDocumentMap(proxy, ntp)
	if err != nil {
		return nil, err
	}
	for _, emoticon := range wanted {
		item := AnimatedEmojiDTO{Emoticon: emoticon}
		if document := lookupAnimatedEmoji(documents, emoticon); document != nil {
			if id := s.registerAnimatedEmojiDocument(document, proxy, ntp); id != "" {
				item.URL = s.emojiURL(id)
			}
		}
		result = append(result, item)
	}
	return result, nil
}

// normalizeAnimatedEmojiRequest dedupes the requested emoticons, drops empty
// entries and caps the list at animatedEmojiMax while preserving input order.
func normalizeAnimatedEmojiRequest(emoticons []string) []string {
	wanted := make([]string, 0, len(emoticons))
	seen := make(map[string]struct{}, len(emoticons))
	for _, raw := range emoticons {
		emoticon := strings.TrimSpace(raw)
		if emoticon == "" {
			continue
		}
		if _, duplicate := seen[emoticon]; duplicate {
			continue
		}
		seen[emoticon] = struct{}{}
		wanted = append(wanted, emoticon)
		if len(wanted) >= animatedEmojiMax {
			break
		}
	}
	return wanted
}

// animatedEmojiDocumentMap returns the cached emoticon->document map, loading
// the animated-emoji sticker set on the first call. Failures are not cached, so
// a later call can retry once the connection works again.
func (s *Service) animatedEmojiDocumentMap(proxy, ntp string) (map[string]*tg.Document, error) {
	s.animatedEmojiMu.Lock()
	defer s.animatedEmojiMu.Unlock()
	if s.animatedEmojiDocs != nil {
		return s.animatedEmojiDocs, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var documents map[string]*tg.Document
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().MessagesGetStickerSet(ctx, &tg.MessagesGetStickerSetRequest{
			Stickerset: &tg.InputStickerSetAnimatedEmoji{},
		})
		if err != nil {
			return readableRPCError("load animated emoji stickers", err)
		}
		set, ok := response.(*tg.MessagesStickerSet)
		if !ok || set == nil {
			return fmt.Errorf("load animated emoji stickers: unexpected result %T", response)
		}
		documents = buildAnimatedEmojiDocuments(set.Packs, set.Documents)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if documents == nil {
		documents = make(map[string]*tg.Document)
	}
	s.animatedEmojiDocs = documents
	return documents, nil
}

// buildAnimatedEmojiDocuments indexes the sticker set by emoticon. Packs are
// the authoritative source (the first document of the first pack for an
// emoticon wins); the sticker attribute Alt is used as a fallback key for the
// variation-selector mismatch, without overriding pack entries.
func buildAnimatedEmojiDocuments(
	packs []tg.StickerPack,
	rawDocuments []tg.DocumentClass,
) map[string]*tg.Document {
	byID := make(map[int64]*tg.Document, len(rawDocuments))
	for _, raw := range rawDocuments {
		document, ok := raw.(*tg.Document)
		if !ok || document == nil || document.ID == 0 {
			continue
		}
		byID[document.ID] = document
	}

	documents := make(map[string]*tg.Document, len(packs))
	for _, pack := range packs {
		if pack.Emoticon == "" || len(pack.Documents) == 0 {
			continue
		}
		if _, exists := documents[pack.Emoticon]; exists {
			continue
		}
		if document := byID[pack.Documents[0]]; document != nil {
			documents[pack.Emoticon] = document
		}
	}
	for _, raw := range rawDocuments {
		document, ok := raw.(*tg.Document)
		if !ok || document == nil {
			continue
		}
		alt := animatedEmojiAttributeAlt(document)
		if alt == "" {
			continue
		}
		if _, exists := documents[alt]; exists {
			continue
		}
		documents[alt] = document
	}
	return documents
}

// animatedEmojiAttributeAlt returns the emoji representation Telegram attaches
// to a sticker document, or "" when the document has no sticker attribute.
func animatedEmojiAttributeAlt(document *tg.Document) string {
	if document == nil {
		return ""
	}
	for _, attribute := range document.Attributes {
		if sticker, ok := attribute.(*tg.DocumentAttributeSticker); ok && sticker.Alt != "" {
			return sticker.Alt
		}
	}
	return ""
}

// lookupAnimatedEmoji finds the document for an emoticon: an exact match first,
// then a match after removing the emoji variation selector U+FE0F from both
// sides. Emoticons are compared as whole strings, so ZWJ sequences stay intact.
func lookupAnimatedEmoji(documents map[string]*tg.Document, emoticon string) *tg.Document {
	if document := documents[emoticon]; document != nil {
		return document
	}
	wanted := stripAnimatedEmojiVS16(emoticon)
	if document := documents[wanted]; document != nil {
		return document
	}
	for key, document := range documents {
		if stripAnimatedEmojiVS16(key) == wanted {
			return document
		}
	}
	return nil
}

func stripAnimatedEmojiVS16(emoticon string) string {
	return strings.ReplaceAll(emoticon, animatedEmojiVS16, "")
}

// registerAnimatedEmojiDocument stores an animated-emoji document behind an
// opaque ref and returns its id. Nothing is downloaded here: the /emoji/ route
// fetches the TGS bytes lazily on the first request.
func (s *Service) registerAnimatedEmojiDocument(document *tg.Document, proxy, ntp string) string {
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
		Name: "AnimatedSticker.tgs",
		Size: document.Size,
		DC:   document.DCID,
	}
	return s.emojiRefs.put(&imageRef{
		media: media,
		mime:  "application/x-tgsticker",
		proxy: proxy,
		ntp:   ntp,
	})
}

// emojiURL returns the loopback URL that serves a registered animated-emoji
// ref. It starts the shared media server (a loopback listener) but never
// downloads the sticker itself.
func (s *Service) emojiURL(id string) string {
	if id == "" {
		return ""
	}
	s.mediaServerMu.Lock()
	defer s.mediaServerMu.Unlock()
	if err := s.startMediaServerLocked(); err != nil {
		return ""
	}
	return s.emojiBase + id
}

// serveAnimatedEmoji is the /emoji/<token>/<ref> handler. The decoded Lottie
// JSON is cached without a TTL: the image cache is bounded by bytes and evicts
// on its own.
func (s *Service) serveAnimatedEmoji(id string, w http.ResponseWriter, r *http.Request) {
	ref := s.emojiRefs.get(id)
	if ref == nil {
		http.NotFound(w, r)
		return
	}
	key := "emoji:" + id
	if entry, ok := s.images.get(key); ok {
		writeImage(w, entry.data, animatedEmojiMIME, "private, max-age=604800, immutable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	data, err := s.fetchPatternDocument(ctx, ref)
	if err != nil || len(data) == 0 {
		http.NotFound(w, r)
		return
	}
	s.images.put(key, data, animatedEmojiMIME, 0)
	writeImage(w, data, animatedEmojiMIME, "private, max-age=604800, immutable")
}
