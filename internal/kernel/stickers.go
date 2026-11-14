package kernel

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
	"golang.org/x/sync/errgroup"
)

// Sticker/GIF picker backend. Reads use messages.getAllStickers /
// messages.getRecentStickers / messages.getStickerSet / messages.getSavedGifs;
// sending reuses messages.sendMedia with an existing inputDocument (no upload,
// exactly like Telegram Web K). Everything is cached in memory with a short TTL
// and invalidated from the live update dispatcher.

const (
	stickerSetsCacheTTL    = 5 * time.Minute
	recentStickersCacheTTL = 60 * time.Second
	stickerSetCacheTTL     = 30 * time.Minute
	savedGifsCacheTTL      = 60 * time.Second
	recentStickersLimit    = 20
	stickerRefStoreLimit   = 4096
)

// StickerDocDTO is one sticker document in the picker grid. Ref is the opaque
// token needed to send it; StreamURL/PhotoURL are loopback media URLs.
type StickerDocDTO struct {
	Ref       string `json:"ref"`
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Emoji     string `json:"emoji,omitempty"`
	SetID     string `json:"setId,omitempty"`
	ThumbURL  string `json:"thumbUrl,omitempty"`
	StreamURL string `json:"streamUrl,omitempty"`
	PhotoURL  string `json:"photoUrl,omitempty"`
	W         int    `json:"w,omitempty"`
	H         int    `json:"h,omitempty"`
	SizeBytes int64  `json:"sizeBytes,omitempty"`
}

// StickerSetDTO is one installed sticker set header (rail cover + section).
type StickerSetDTO struct {
	Ref       string `json:"ref"`
	ID        string `json:"id"`
	Title     string `json:"title"`
	ShortName string `json:"shortName,omitempty"`
	Count     int    `json:"count"`
	Official  bool   `json:"official,omitempty"`
	Archived  bool   `json:"archived,omitempty"`
	CoverURL  string `json:"coverUrl,omitempty"`
	CoverKind string `json:"coverKind,omitempty"`
}

// StickerPacksDTO is the sticker tab payload: recent row + installed sets.
type StickerPacksDTO struct {
	Recent []StickerDocDTO `json:"recent"`
	Sets   []StickerSetDTO `json:"sets"`
}

// StickerSetDetailDTO is one set with every document returned by
// messages.getStickerSet (the method is not paginated).
type StickerSetDetailDTO struct {
	Set      StickerSetDTO   `json:"set"`
	Stickers []StickerDocDTO `json:"stickers"`
}

// GifDTO is one saved GIF.
type GifDTO struct {
	Ref       string  `json:"ref"`
	ID        string  `json:"id"`
	ThumbURL  string  `json:"thumbUrl,omitempty"`
	StreamURL string  `json:"streamUrl"`
	Mime      string  `json:"mime,omitempty"`
	W         int     `json:"w,omitempty"`
	H         int     `json:"h,omitempty"`
	Duration  float64 `json:"duration,omitempty"`
	SizeBytes int64   `json:"sizeBytes,omitempty"`
}

// SavedGifsDTO is the GIF tab payload.
type SavedGifsDTO struct {
	Gifs []GifDTO `json:"gifs"`
}

type stickerSetsCacheEntry struct {
	sets []StickerSetDTO
	at   time.Time
}

type recentStickersCacheEntry struct {
	stickers []StickerDocDTO
	at       time.Time
}

type stickerSetCacheEntry struct {
	detail *StickerSetDetailDTO
	at     time.Time
}

type savedGifsCacheEntry struct {
	gifs []GifDTO
	at   time.Time
}

// ------------------------------------------------------------ ref side map

func (s *Service) storeStickerDocRef(token string, doc *tg.Document) {
	if token == "" || doc == nil {
		return
	}
	s.stickerRefsMu.Lock()
	defer s.stickerRefsMu.Unlock()
	if _, exists := s.stickerRefs[token]; !exists {
		s.stickerRefOrder = append(s.stickerRefOrder, token)
	}
	s.stickerRefs[token] = doc
	for len(s.stickerRefOrder) > stickerRefStoreLimit {
		oldest := s.stickerRefOrder[0]
		s.stickerRefOrder = s.stickerRefOrder[1:]
		delete(s.stickerRefs, oldest)
	}
}

func (s *Service) stickerDocByRef(token string) *tg.Document {
	s.stickerRefsMu.Lock()
	defer s.stickerRefsMu.Unlock()
	return s.stickerRefs[token]
}

// --------------------------------------------------------------- DTO mappers

// mapStickerDoc converts a document into the picker cell shape. source/setRef
// describe where the document was listed so an expired file_reference can be
// refreshed with a single refetch of that list.
func (s *Service) mapStickerDoc(
	doc *tg.Document,
	kind, source, setRef string,
	targetPx int,
	proxy, ntp string,
) (StickerDocDTO, bool) {
	if doc == nil {
		return StickerDocDTO{}, false
	}
	visualKind := stickerDocKind(doc)
	if kind == stickerRefKindSticker && visualKind != "static" && visualKind != "tgs" && visualKind != "webm" {
		return StickerDocDTO{}, false
	}
	if kind == stickerRefKindGif && visualKind != "gif" {
		return StickerDocDTO{}, false
	}
	token := encodeStickerDocRef(stickerDocRef{
		ID:     doc.ID,
		Kind:   kind,
		Source: source,
		SetRef: setRef,
	})
	if token == "" {
		return StickerDocDTO{}, false
	}
	s.storeStickerDocRef(token, doc)
	thumbURL, streamURL, photoURL := s.stickerMediaURLs(doc, visualKind, targetPx, proxy, ntp)
	width, height := documentDimensions(doc)
	setID := setRef
	if setID == "" {
		setID = stickerSetRefOf(doc)
	}
	return StickerDocDTO{
		Ref:       token,
		ID:        strconv.FormatInt(doc.ID, 10),
		Kind:      visualKind,
		Emoji:     stickerEmoji(doc),
		SetID:     setID,
		ThumbURL:  thumbURL,
		StreamURL: streamURL,
		PhotoURL:  photoURL,
		W:         width,
		H:         height,
		SizeBytes: doc.Size,
	}, true
}

func (s *Service) mapGifDoc(doc *tg.Document, proxy, ntp string) (GifDTO, bool) {
	if doc == nil || !isGifDocument(doc) {
		return GifDTO{}, false
	}
	token := encodeStickerDocRef(stickerDocRef{
		ID:     doc.ID,
		Kind:   stickerRefKindGif,
		Source: stickerRefSourceGif,
	})
	if token == "" {
		return GifDTO{}, false
	}
	s.storeStickerDocRef(token, doc)
	thumbURL, streamURL, _ := s.stickerMediaURLs(doc, "gif", 124, proxy, ntp)
	width, height := documentDimensions(doc)
	return GifDTO{
		Ref:       token,
		ID:        strconv.FormatInt(doc.ID, 10),
		ThumbURL:  thumbURL,
		StreamURL: streamURL,
		Mime:      doc.MimeType,
		W:         width,
		H:         height,
		Duration:  documentDuration(doc),
		SizeBytes: doc.Size,
	}, true
}

func mapStickerSetHeader(set *tg.StickerSet, coverURL, coverKind string) StickerSetDTO {
	return StickerSetDTO{
		Ref:       encodeStickerSetRef(set.ID, set.AccessHash),
		ID:        strconv.FormatInt(set.ID, 10),
		Title:     set.Title,
		ShortName: set.ShortName,
		Count:     set.Count,
		Official:  set.Official,
		Archived:  set.Archived,
		CoverURL:  coverURL,
		CoverKind: coverKind,
	}
}

// ------------------------------------------------------------------- caches

func cloneStickerDocs(source []StickerDocDTO) []StickerDocDTO {
	if len(source) == 0 {
		return []StickerDocDTO{}
	}
	return append([]StickerDocDTO(nil), source...)
}

func cloneStickerSets(source []StickerSetDTO) []StickerSetDTO {
	if len(source) == 0 {
		return []StickerSetDTO{}
	}
	return append([]StickerSetDTO(nil), source...)
}

func cloneGifs(source []GifDTO) []GifDTO {
	if len(source) == 0 {
		return []GifDTO{}
	}
	return append([]GifDTO(nil), source...)
}

func (s *Service) cachedStickerSets() ([]StickerSetDTO, bool) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	entry := s.stickerSetsCache
	if entry == nil || time.Since(entry.at) >= stickerSetsCacheTTL {
		return nil, false
	}
	return cloneStickerSets(entry.sets), true
}

func (s *Service) storeStickerSets(sets []StickerSetDTO) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.stickerSetsCache = &stickerSetsCacheEntry{sets: cloneStickerSets(sets), at: time.Now()}
}

func (s *Service) cachedRecentStickers() ([]StickerDocDTO, bool) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	entry := s.recentCache
	if entry == nil || time.Since(entry.at) >= recentStickersCacheTTL {
		return nil, false
	}
	return cloneStickerDocs(entry.stickers), true
}

func (s *Service) storeRecentStickers(stickers []StickerDocDTO) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.recentCache = &recentStickersCacheEntry{stickers: cloneStickerDocs(stickers), at: time.Now()}
}

func (s *Service) cachedStickerSet(ref string) (*StickerSetDetailDTO, bool) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	entry, ok := s.stickerSetCache[ref]
	if !ok || time.Since(entry.at) >= stickerSetCacheTTL || entry.detail == nil {
		return nil, false
	}
	detail := *entry.detail
	detail.Stickers = cloneStickerDocs(entry.detail.Stickers)
	return &detail, true
}

func (s *Service) storeStickerSet(ref string, detail *StickerSetDetailDTO) {
	if ref == "" || detail == nil {
		return
	}
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	if s.stickerSetCache == nil {
		s.stickerSetCache = make(map[string]stickerSetCacheEntry)
	}
	if len(s.stickerSetCache) > 64 {
		for key, entry := range s.stickerSetCache {
			if time.Since(entry.at) >= stickerSetCacheTTL {
				delete(s.stickerSetCache, key)
			}
		}
	}
	clone := *detail
	clone.Stickers = cloneStickerDocs(detail.Stickers)
	s.stickerSetCache[ref] = stickerSetCacheEntry{detail: &clone, at: time.Now()}
}

func (s *Service) cachedSavedGifs() ([]GifDTO, bool) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	entry := s.savedGifsCache
	if entry == nil || time.Since(entry.at) >= savedGifsCacheTTL {
		return nil, false
	}
	return cloneGifs(entry.gifs), true
}

func (s *Service) storeSavedGifs(gifs []GifDTO) {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.savedGifsCache = &savedGifsCacheEntry{gifs: cloneGifs(gifs), at: time.Now()}
}

// invalidateStickerSetsCache drops the installed-set list and every cached set
// detail (UpdateStickerSets / UpdateNewStickerSet / order updates).
func (s *Service) invalidateStickerSetsCache() {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.stickerSetsCache = nil
	s.stickerSetCache = make(map[string]stickerSetCacheEntry)
}

// invalidateRecentStickersCache drops the recent row (UpdateRecentStickers and
// after every sticker send, because the server order changes).
func (s *Service) invalidateRecentStickersCache() {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.recentCache = nil
}

// invalidateSavedGifsCache drops the saved-GIF list (UpdateSavedGifs and after
// every GIF send).
func (s *Service) invalidateSavedGifsCache() {
	s.stickerCacheMu.Lock()
	defer s.stickerCacheMu.Unlock()
	s.savedGifsCache = nil
}

// invalidateStickerCaches is the session-reset hook: the refs and DTO caches
// belong to the previous account.
func (s *Service) invalidateStickerCaches() {
	s.invalidateStickerSetsCache()
	s.invalidateRecentStickersCache()
	s.invalidateSavedGifsCache()
	s.stickerRefsMu.Lock()
	s.stickerRefs = make(map[string]*tg.Document)
	s.stickerRefOrder = nil
	s.stickerRefsMu.Unlock()
}

// --------------------------------------------------------------- public API

// GetStickerPacks returns the recent sticker row (max 20) and the installed
// sticker sets in server order, with mask and custom-emoji sets filtered out.
func (s *Service) GetStickerPacks(proxy, ntp string) (*StickerPacksDTO, error) {
	sets, setsOK := s.cachedStickerSets()
	recent, recentOK := s.cachedRecentStickers()
	if setsOK && recentOK {
		return &StickerPacksDTO{Recent: recent, Sets: sets}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	var (
		fetchedSets   []tg.StickerSet
		fetchedRecent []tg.DocumentClass
	)
	group, groupCtx := errgroup.WithContext(ctx)
	if !setsOK {
		group.Go(func() error {
			resp, err := client.API().MessagesGetAllStickers(groupCtx, 0)
			if err != nil {
				return readableRPCError("load sticker packs", err)
			}
			if value, ok := resp.(*tg.MessagesAllStickers); ok {
				fetchedSets = value.Sets
			}
			return nil
		})
	}
	if !recentOK {
		group.Go(func() error {
			resp, err := client.API().MessagesGetRecentStickers(
				groupCtx,
				&tg.MessagesGetRecentStickersRequest{Hash: 0},
			)
			if err != nil {
				return readableRPCError("load recent stickers", err)
			}
			if value, ok := resp.(*tg.MessagesRecentStickers); ok {
				fetchedRecent = value.Stickers
			}
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}

	if !setsOK {
		sets = make([]StickerSetDTO, 0, len(fetchedSets))
		for index := range fetchedSets {
			set := &fetchedSets[index]
			if set.Masks || set.Emojis || set.ID == 0 {
				continue
			}
			coverURL, coverKind := s.stickerSetCoverURL(set, proxy, ntp)
			sets = append(sets, mapStickerSetHeader(set, coverURL, coverKind))
		}
		s.storeStickerSets(sets)
	}
	if !recentOK {
		recent = make([]StickerDocDTO, 0, recentStickersLimit)
		for _, raw := range fetchedRecent {
			if len(recent) >= recentStickersLimit {
				break
			}
			doc, ok := raw.(*tg.Document)
			if !ok || !isStickerDocument(doc) {
				continue
			}
			item, ok := s.mapStickerDoc(
				doc,
				stickerRefKindSticker,
				stickerRefSourceRecent,
				"",
				stickerThumbTargetPx,
				proxy,
				ntp,
			)
			if !ok {
				continue
			}
			recent = append(recent, item)
		}
		s.storeRecentStickers(recent)
	}
	return &StickerPacksDTO{Recent: cloneStickerDocs(recent), Sets: cloneStickerSets(sets)}, nil
}

// GetStickerSet loads every document of one installed set (messages.getStickerSet
// is not paginated). The returned set header carries a cover URL even when the
// set has no dedicated thumbnail: the first sticker's still thumb is used.
func (s *Service) GetStickerSet(ref, proxy, ntp string) (*StickerSetDetailDTO, error) {
	id, accessHash, err := decodeStickerSetRef(ref)
	if err != nil {
		return nil, err
	}
	if cached, ok := s.cachedStickerSet(ref); ok {
		return cached, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	resp, err := client.API().MessagesGetStickerSet(ctx, &tg.MessagesGetStickerSetRequest{
		Stickerset: &tg.InputStickerSetID{ID: id, AccessHash: accessHash},
		Hash:       0,
	})
	if err != nil {
		return nil, readableRPCError("load sticker set", err)
	}
	value, ok := resp.(*tg.MessagesStickerSet)
	if !ok {
		// NotModified is impossible with hash 0, but stay defensive.
		if cached, ok := s.cachedStickerSet(ref); ok {
			return cached, nil
		}
		return nil, fmt.Errorf("load sticker set: unexpected result %T", resp)
	}

	set := value.Set
	coverURL, coverKind := s.stickerSetCoverURL(&set, proxy, ntp)
	detail := &StickerSetDetailDTO{
		Set:      mapStickerSetHeader(&set, coverURL, coverKind),
		Stickers: make([]StickerDocDTO, 0, len(value.Documents)),
	}
	for _, raw := range value.Documents {
		doc, ok := raw.(*tg.Document)
		if !ok || !isStickerDocument(doc) {
			continue
		}
		item, ok := s.mapStickerDoc(
			doc,
			stickerRefKindSticker,
			stickerRefSourceSet,
			ref,
			stickerThumbTargetPx,
			proxy,
			ntp,
		)
		if !ok {
			continue
		}
		detail.Stickers = append(detail.Stickers, item)
	}
	if detail.Set.CoverURL == "" && len(detail.Stickers) > 0 {
		first := detail.Stickers[0]
		if first.ThumbURL != "" {
			detail.Set.CoverURL = first.ThumbURL
			detail.Set.CoverKind = first.Kind
		}
	}
	s.storeStickerSet(ref, detail)
	return detail, nil
}

// GetSavedGifs returns the account's saved GIFs (messages.getSavedGifs).
func (s *Service) GetSavedGifs(proxy, ntp string) (*SavedGifsDTO, error) {
	if cached, ok := s.cachedSavedGifs(); ok {
		return &SavedGifsDTO{Gifs: cached}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	resp, err := client.API().MessagesGetSavedGifs(ctx, 0)
	if err != nil {
		return nil, readableRPCError("load saved gifs", err)
	}
	gifs := make([]GifDTO, 0)
	if value, ok := resp.(*tg.MessagesSavedGifs); ok {
		gifs = make([]GifDTO, 0, len(value.Gifs))
		for _, raw := range value.Gifs {
			doc, ok := raw.(*tg.Document)
			if !ok {
				continue
			}
			item, ok := s.mapGifDoc(doc, proxy, ntp)
			if !ok {
				continue
			}
			gifs = append(gifs, item)
		}
	}
	s.storeSavedGifs(gifs)
	return &SavedGifsDTO{Gifs: cloneGifs(gifs)}, nil
}

// SendSticker sends an existing sticker document (no upload) to the chat.
func (s *Service) SendSticker(chatID, ref string, replyToID int, proxy, ntp string) error {
	return s.sendStickerDocument(chatID, ref, replyToID, stickerRefKindSticker, proxy, ntp)
}

// SendGif sends an existing saved GIF document (no upload) to the chat.
func (s *Service) SendGif(chatID, ref string, replyToID int, proxy, ntp string) error {
	return s.sendStickerDocument(chatID, ref, replyToID, stickerRefKindGif, proxy, ntp)
}

func (s *Service) sendStickerDocument(
	chatID, ref string,
	replyToID int,
	expectedKind, proxy, ntp string,
) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	decoded, err := decodeStickerDocRef(ref)
	if err != nil {
		return err
	}
	if decoded.Kind != expectedKind {
		return fmt.Errorf("invalid %s reference", expectedKind)
	}
	s.rememberPeer(peer)

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		doc := s.stickerDocByRef(ref)
		if doc == nil {
			refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
			if refreshErr != nil {
				return refreshErr
			}
			doc = refreshed
			s.storeStickerDocRef(ref, doc)
		}
		sendErr := s.sendStickerMedia(ctx, client, peer, doc, replyToID, expectedKind)
		if sendErr == nil {
			return nil
		}
		if !isFileReferenceError(sendErr) {
			return stickerSendError(expectedKind, sendErr)
		}
		// file_reference expired: refetch the source list once and retry.
		refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
		if refreshErr != nil {
			return refreshErr
		}
		s.storeStickerDocRef(ref, refreshed)
		if retryErr := s.sendStickerMedia(ctx, client, peer, refreshed, replyToID, expectedKind); retryErr != nil {
			return stickerSendError(expectedKind, retryErr)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if expectedKind == stickerRefKindSticker {
		s.invalidateRecentStickersCache()
	} else {
		s.invalidateSavedGifsCache()
	}
	return nil
}

func (s *Service) sendStickerMedia(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
	doc *tg.Document,
	replyToID int,
	kind string,
) error {
	if doc == nil || doc.ID == 0 {
		return fmt.Errorf("sticker is unavailable")
	}
	randomID := time.Now().UnixNano()
	if randomID < 0 {
		randomID = -randomID
	}
	request := &tg.MessagesSendMediaRequest{
		Peer: peer,
		Media: &tg.InputMediaDocument{ID: &tg.InputDocument{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
		}},
		Message:                "",
		RandomID:               randomID,
		UpdateStickersetsOrder: kind == stickerRefKindSticker,
	}
	if replyToID > 0 {
		request.ReplyTo = &tg.InputReplyToMessage{ReplyToMsgID: replyToID}
	}
	_, err := client.API().MessagesSendMedia(ctx, request)
	return err
}

// refreshStickerDoc re-fetches the list the document was shown from and returns
// the updated document (new file_reference). It does not touch the DTO caches;
// the next picker open refetches them anyway.
func (s *Service) refreshStickerDoc(
	ctx context.Context,
	client *telegram.Client,
	decoded stickerDocRef,
) (*tg.Document, error) {
	callCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	switch decoded.Source {
	case stickerRefSourceRecent:
		resp, err := client.API().MessagesGetRecentStickers(
			callCtx,
			&tg.MessagesGetRecentStickersRequest{Hash: 0},
		)
		if err != nil {
			return nil, readableRPCError("refresh recent stickers", err)
		}
		if value, ok := resp.(*tg.MessagesRecentStickers); ok {
			if doc := findDocument(value.Stickers, decoded.ID); doc != nil {
				return doc, nil
			}
		}
	case stickerRefSourceGif:
		resp, err := client.API().MessagesGetSavedGifs(callCtx, 0)
		if err != nil {
			return nil, readableRPCError("refresh saved gifs", err)
		}
		if value, ok := resp.(*tg.MessagesSavedGifs); ok {
			if doc := findDocument(value.Gifs, decoded.ID); doc != nil {
				return doc, nil
			}
		}
	case stickerRefSourceSet:
		setID, accessHash, err := decodeStickerSetRef(decoded.SetRef)
		if err != nil {
			return nil, err
		}
		resp, err := client.API().MessagesGetStickerSet(callCtx, &tg.MessagesGetStickerSetRequest{
			Stickerset: &tg.InputStickerSetID{ID: setID, AccessHash: accessHash},
			Hash:       0,
		})
		if err != nil {
			return nil, readableRPCError("refresh sticker set", err)
		}
		if value, ok := resp.(*tg.MessagesStickerSet); ok {
			if doc := findDocument(value.Documents, decoded.ID); doc != nil {
				return doc, nil
			}
		}
	default:
		return nil, fmt.Errorf("invalid sticker reference source")
	}
	return nil, fmt.Errorf("this sticker is no longer available; reopen the picker")
}

func findDocument(documents []tg.DocumentClass, id int64) *tg.Document {
	for _, raw := range documents {
		if doc, ok := raw.(*tg.Document); ok && doc.ID == id {
			return doc
		}
	}
	return nil
}

func isFileReferenceError(err error) bool {
	return tgerr.Is(
		err,
		tg.ErrFileReferenceExpired,
		tg.ErrFileReferenceInvalid,
		tg.ErrFileReferenceEmpty,
	)
}

// stickerSendError turns the common send failures into readable, actionable
// messages: slow mode and rights restrictions are server errors, not client
// checks, so the exact Telegram answer is surfaced.
func stickerSendError(kind string, err error) error {
	action := "send sticker"
	noun := "stickers"
	if kind == stickerRefKindGif {
		action = "send gif"
		noun = "GIFs"
	}
	if delay, ok := tgerr.AsFloodWait(err); ok {
		seconds := int(delay.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Errorf("%s: too many requests, retry in %d seconds", action, seconds)
	}
	if rpcErr, ok := tgerr.AsType(err, tg.ErrSlowmodeWait); ok {
		seconds := rpcErr.Argument
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Errorf("%s: slow mode is enabled, retry in %d seconds", action, seconds)
	}
	switch {
	case tgerr.Is(err, tg.ErrChatSendStickersForbidden):
		return fmt.Errorf("%s: sending stickers is not allowed in this chat", action)
	case tgerr.Is(err, tg.ErrChatSendGifsForbidden):
		return fmt.Errorf("%s: sending GIFs is not allowed in this chat", action)
	case tgerr.Is(err, tg.ErrChatSendMediaForbidden):
		return fmt.Errorf("%s: sending %s is not allowed in this chat", action, noun)
	case tgerr.Is(err, tg.ErrChatWriteForbidden):
		return fmt.Errorf("%s: you cannot post in this chat", action)
	case tgerr.Is(err, tg.ErrChatAdminRequired):
		return fmt.Errorf("%s: you need to be an administrator to post in this chat", action)
	case tgerr.Is(err, tg.ErrChannelPrivate):
		return fmt.Errorf("%s: this chat is not available", action)
	case tgerr.Is(err, tg.ErrPeerIDInvalid):
		return fmt.Errorf("%s: this chat is not available", action)
	case tgerr.Is(err, tg.ErrUserBannedInChannel):
		return fmt.Errorf("%s: you are banned in this chat", action)
	}
	return fmt.Errorf("%s: %w", action, err)
}
