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

// Round-3 sticker surfaces: server-side sticker search, the favorites list,
// install/uninstall/archive + featured sets. The read paths deliberately do not
// add another TTL cache: the existing pack/recent/saved-GIF caches already
// cover the picker tab, while search results, favorites and featured sets are
// cheap, change on their own schedule, and must reflect the server immediately
// after the picker's own mutations (install / fave / clear). Updates pushed by
// Telegram therefore need no extra invalidation hooks beyond the ones live.go
// already installs for the pack/recent/saved-GIF caches; the only caches these
// methods touch are the existing ones, dropped after every mutation.

const (
	// stickerSearchResultLimit matches Telegram Web K's SEARCH_STICKERS_LIMIT.
	stickerSearchResultLimit = 50
	// stickerSearchMaxLimit is the accepted upper bound of one search page.
	stickerSearchMaxLimit = 100
	// stickerSearchSetFetchLimit bounds how many non-installed sets found by a
	// search are resolved to full headers (each resolution is one
	// messages.getStickerSet call; the response carries the whole set).
	stickerSearchSetFetchLimit = 6
	// stickerSearchSetFetchTimeout is the per-set header budget.
	stickerSearchSetFetchTimeout = 12 * time.Second
)

// StickerSearchDTO is one page of messages.searchStickers results plus the
// sticker sets the returned documents belong to. Set headers of installed sets
// carry every field; a non-installed set is resolved with messages.getStickerSet
// when budget allows, otherwise only Ref/ID are returned and the caller can load
// it with GetStickerSet.
type StickerSearchDTO struct {
	Stickers []StickerDocDTO `json:"stickers"`
	Sets     []StickerSetDTO `json:"sets"`
}

// normalizeStickerSearchLimit clamps the caller's page size to the server's
// accepted range (Telegram Web K searches in pages of 50).
func normalizeStickerSearchLimit(limit int) int {
	switch {
	case limit <= 0:
		return stickerSearchResultLimit
	case limit > stickerSearchMaxLimit:
		return stickerSearchMaxLimit
	default:
		return limit
	}
}

// SearchStickers runs Telegram's AI sticker search (messages.searchStickers) and
// maps every returned document through the opaque-ref/media pipeline the picker
// already uses. Set information is derived from the documents' sticker
// attributes (DocumentAttributeSticker.Stickerset) and enriched from the
// installed pack list / messages.getStickerSet.
func (s *Service) SearchStickers(
	query string,
	limit int,
	proxy, ntp string,
) (*StickerSearchDTO, error) {
	query = truncateStickerSearchQuery(query)
	if query == "" {
		return &StickerSearchDTO{Stickers: []StickerDocDTO{}, Sets: []StickerSetDTO{}}, nil
	}
	limit = normalizeStickerSearchLimit(limit)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	resp, err := client.API().MessagesSearchStickers(ctx, &tg.MessagesSearchStickersRequest{
		Q:     query,
		Limit: limit,
	})
	if err != nil {
		return nil, readableRPCError("search stickers", err)
	}
	found, ok := resp.(*tg.MessagesFoundStickers)
	if !ok {
		// Hash 0 cannot answer messages.foundStickersNotModified, but stay
		// defensive: an empty page is the useful answer either way.
		return &StickerSearchDTO{Stickers: []StickerDocDTO{}, Sets: []StickerSetDTO{}}, nil
	}

	result := &StickerSearchDTO{
		Stickers: make([]StickerDocDTO, 0, len(found.Stickers)),
		Sets:     make([]StickerSetDTO, 0),
	}
	setOrder := make([]string, 0, 8)
	seenSets := make(map[string]struct{}, 8)
	for _, raw := range found.Stickers {
		doc, ok := raw.(*tg.Document)
		if !ok || !isStickerDocument(doc) {
			continue
		}
		visualKind := stickerDocKind(doc)
		token := encodeStickerDocRef(stickerDocRefForList(
			doc,
			stickerRefKindSticker,
			stickerRefSourceSearch,
			query,
		))
		if token == "" {
			continue
		}
		result.Stickers = append(result.Stickers, s.mapStickerDocWithToken(
			doc,
			visualKind,
			token,
			"",
			stickerThumbTargetPx,
			proxy,
			ntp,
		))
		if setRef := stickerSetRefOf(doc); setRef != "" {
			if _, ok := seenSets[setRef]; !ok {
				seenSets[setRef] = struct{}{}
				setOrder = append(setOrder, setRef)
			}
		}
	}

	result.Sets = s.searchStickerSetHeaders(ctx, client, setOrder, proxy, ntp)
	return result, nil
}

// searchStickerSetHeaders maps the sets owning the search results. Installed set
// headers come from the warm pack cache (or one getAllStickers call); the first
// few non-installed sets are resolved with messages.getStickerSet so the picker
// can show a title/count/cover and an "add" affordance.
func (s *Service) searchStickerSetHeaders(
	ctx context.Context,
	client *telegram.Client,
	setOrder []string,
	proxy, ntp string,
) []StickerSetDTO {
	if len(setOrder) == 0 {
		return []StickerSetDTO{}
	}
	installed := s.installedStickerSetIndex(ctx, client, proxy, ntp)

	headers := make(map[string]StickerSetDTO, len(setOrder))
	missing := make([]string, 0, len(setOrder))
	for _, ref := range setOrder {
		setID, _, err := decodeStickerSetRef(ref)
		if err != nil {
			continue
		}
		id := strconv.FormatInt(setID, 10)
		if header, ok := installed[id]; ok {
			headers[ref] = header
			continue
		}
		missing = append(missing, ref)
	}

	if count := min(len(missing), stickerSearchSetFetchLimit); count > 0 {
		fetched := make([]StickerSetDTO, count)
		group, groupCtx := errgroup.WithContext(ctx)
		group.SetLimit(4)
		for index := 0; index < count; index++ {
			index, ref := index, missing[index]
			group.Go(func() error {
				header, err := s.fetchStickerSetHeader(groupCtx, client, ref, proxy, ntp)
				if err != nil {
					// Best effort: the document entries still carry the set ref.
					return nil
				}
				header.Installed = false
				fetched[index] = header
				return nil
			})
		}
		_ = group.Wait()
		for index := 0; index < count; index++ {
			header := fetched[index]
			if header.Ref == "" {
				continue
			}
			headers[missing[index]] = header
		}
	}

	sets := make([]StickerSetDTO, 0, len(setOrder))
	for _, ref := range setOrder {
		if header, ok := headers[ref]; ok {
			sets = append(sets, header)
			continue
		}
		// Not resolvable within the budget: keep the handle so the client can
		// still group documents by set and load the detail on demand.
		setID, _, err := decodeStickerSetRef(ref)
		if err != nil {
			continue
		}
		sets = append(sets, StickerSetDTO{
			Ref: ref,
			ID:  strconv.FormatInt(setID, 10),
		})
	}
	return sets
}

// fetchStickerSetHeader loads one sticker set and maps its header. The response
// carries the whole set (messages.getStickerSet is not paginated); callers only
// use it for a handful of non-installed sets per search.
func (s *Service) fetchStickerSetHeader(
	ctx context.Context,
	client *telegram.Client,
	setRef, proxy, ntp string,
) (StickerSetDTO, error) {
	id, accessHash, err := decodeStickerSetRef(setRef)
	if err != nil {
		return StickerSetDTO{}, err
	}
	callCtx, cancel := context.WithTimeout(ctx, stickerSearchSetFetchTimeout)
	defer cancel()
	resp, err := client.API().MessagesGetStickerSet(callCtx, &tg.MessagesGetStickerSetRequest{
		Stickerset: &tg.InputStickerSetID{ID: id, AccessHash: accessHash},
		Hash:       0,
	})
	if err != nil {
		return StickerSetDTO{}, readableRPCError("load sticker set", err)
	}
	value, ok := resp.(*tg.MessagesStickerSet)
	if !ok {
		return StickerSetDTO{}, fmt.Errorf("load sticker set: unexpected result %T", resp)
	}
	set := value.Set
	coverURL, coverKind := s.stickerSetCoverURL(&set, proxy, ntp)
	return mapStickerSetHeader(&set, coverURL, coverKind), nil
}

// GetFavedStickers returns the account's favorite stickers
// (messages.getFavedStickers). The list is not cached: Telegram pushes
// updateFavedStickers for changes made elsewhere, and the picker's own
// SetStickerFaved call is reflected on the next read.
func (s *Service) GetFavedStickers(proxy, ntp string) ([]StickerDocDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	resp, err := client.API().MessagesGetFavedStickers(ctx, 0)
	if err != nil {
		return nil, readableRPCError("load favorite stickers", err)
	}
	stickers := make([]StickerDocDTO, 0)
	if value, ok := resp.(*tg.MessagesFavedStickers); ok {
		stickers = make([]StickerDocDTO, 0, len(value.Stickers))
		for _, raw := range value.Stickers {
			doc, ok := raw.(*tg.Document)
			if !ok || !isStickerDocument(doc) {
				continue
			}
			token := encodeStickerDocRef(stickerDocRefForList(
				doc,
				stickerRefKindSticker,
				stickerRefSourceFavorites,
				"",
			))
			if token == "" {
				continue
			}
			stickers = append(stickers, s.mapStickerDocWithToken(
				doc,
				stickerDocKind(doc),
				token,
				"",
				stickerThumbTargetPx,
				proxy,
				ntp,
			))
		}
	}
	return stickers, nil
}

// SetStickerFaved marks or unmarks one sticker as a favorite
// (messages.faveSticker). The document ref is resolved from the bounded side map
// or re-fetched from its list when the picker already forgot it.
func (s *Service) SetStickerFaved(ref string, faved bool, proxy, ntp string) error {
	decoded, err := decodeStickerDocRef(ref)
	if err != nil {
		return err
	}
	if decoded.Kind != stickerRefKindSticker {
		return fmt.Errorf("invalid sticker reference")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		doc := s.stickerDocByRef(ref)
		if doc == nil {
			refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
			if refreshErr != nil {
				return refreshErr
			}
			doc = refreshed
			s.storeStickerDocRef(ref, doc)
		}
		faveErr := faveStickerDocument(ctx, client, doc, faved)
		if isFileReferenceError(faveErr) {
			refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
			if refreshErr != nil {
				return refreshErr
			}
			s.storeStickerDocRef(ref, refreshed)
			faveErr = faveStickerDocument(ctx, client, refreshed, faved)
		}
		if faveErr == nil {
			return nil
		}
		switch {
		case tgerr.Is(faveErr, tg.ErrStickersTooMuch):
			return fmt.Errorf("update favorite stickers: the favorites limit is reached")
		case tgerr.Is(faveErr, tg.ErrStickerIDInvalid):
			return fmt.Errorf("update favorite stickers: this sticker is no longer available")
		default:
			return readableRPCError("update favorite stickers", faveErr)
		}
	})
}

func faveStickerDocument(
	ctx context.Context,
	client *telegram.Client,
	doc *tg.Document,
	faved bool,
) error {
	if doc == nil || doc.ID == 0 {
		return fmt.Errorf("sticker is unavailable")
	}
	_, err := client.API().MessagesFaveSticker(ctx, &tg.MessagesFaveStickerRequest{
		ID: &tg.InputDocument{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
		},
		Unfave: !faved,
	})
	return err
}

// ClearRecentStickers empties the recent sticker row
// (messages.clearRecentStickers) and drops the cached row.
func (s *Service) ClearRecentStickers(proxy, ntp string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}
	s.noteMediaConfig(proxy, ntp)
	if _, err := client.API().MessagesClearRecentStickers(
		ctx,
		&tg.MessagesClearRecentStickersRequest{},
	); err != nil {
		return readableRPCError("clear recent stickers", err)
	}
	s.invalidateRecentStickersCache()
	return nil
}

// InstallStickerSet installs a set (messages.installStickerSet) and drops the
// cached installed-set list so the rail refetches it.
func (s *Service) InstallStickerSet(ref, proxy, ntp string) error {
	stickerset, err := stickerSetInput(ref)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}
	s.noteMediaConfig(proxy, ntp)
	if _, err := client.API().MessagesInstallStickerSet(ctx, &tg.MessagesInstallStickerSetRequest{
		Stickerset: stickerset,
	}); err != nil {
		return readableRPCError("install sticker set", err)
	}
	s.invalidateStickerSetsCache()
	return nil
}

// UninstallStickerSet removes a set (messages.uninstallStickerSet) and drops the
// cached installed-set list.
func (s *Service) UninstallStickerSet(ref, proxy, ntp string) error {
	stickerset, err := stickerSetInput(ref)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}
	s.noteMediaConfig(proxy, ntp)
	if _, err := client.API().MessagesUninstallStickerSet(ctx, stickerset); err != nil {
		return readableRPCError("remove sticker set", err)
	}
	s.invalidateStickerSetsCache()
	return nil
}

// ArchiveStickerSet archives or unarchives a set (messages.toggleStickerSets)
// and drops the cached installed-set list.
func (s *Service) ArchiveStickerSet(ref string, archived bool, proxy, ntp string) error {
	stickerset, err := stickerSetInput(ref)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return err
	}
	s.noteMediaConfig(proxy, ntp)
	if _, err := client.API().MessagesToggleStickerSets(ctx, &tg.MessagesToggleStickerSetsRequest{
		Archive:     archived,
		Unarchive:   !archived,
		Stickersets: []tg.InputStickerSetClass{stickerset},
	}); err != nil {
		return readableRPCError("archive sticker set", err)
	}
	s.invalidateStickerSetsCache()
	return nil
}

// GetFeaturedStickerSets returns the featured/new sticker sets
// (messages.getFeaturedStickers) with their covers. The list is uncached: it is
// a store/showcase read, not part of the picker's hot path.
func (s *Service) GetFeaturedStickerSets(proxy, ntp string) ([]StickerSetDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	resp, err := client.API().MessagesGetFeaturedStickers(ctx, 0)
	if err != nil {
		return nil, readableRPCError("load featured sticker sets", err)
	}
	value, ok := resp.(*tg.MessagesFeaturedStickers)
	if !ok {
		return []StickerSetDTO{}, nil
	}
	sets := make([]StickerSetDTO, 0, len(value.Sets))
	for _, raw := range value.Sets {
		header, ok := s.mapFeaturedStickerSet(raw, proxy, ntp)
		if !ok {
			continue
		}
		sets = append(sets, header)
	}
	return sets, nil
}

// mapFeaturedStickerSet maps one messages.featuredStickers set union entry,
// using the set thumbnail when present and the preview sticker document as the
// cover fallback (Web A does the same for sets without a cover thumbnail).
func (s *Service) mapFeaturedStickerSet(
	covered tg.StickerSetCoveredClass,
	proxy, ntp string,
) (StickerSetDTO, bool) {
	set, coverDoc, ok := stickerSetCoveredParts(covered)
	if !ok || set == nil {
		return StickerSetDTO{}, false
	}
	if set.Masks || set.Emojis || set.ID == 0 {
		return StickerSetDTO{}, false
	}
	coverURL, coverKind := s.stickerSetCoverURL(set, proxy, ntp)
	if coverURL == "" && coverDoc != nil {
		kind := stickerDocKind(coverDoc)
		if kind == "" {
			kind = "static"
		}
		thumbURL, _, photoURL := s.stickerMediaURLs(coverDoc, kind, stickerThumbTargetPx, proxy, ntp)
		switch {
		case thumbURL != "":
			coverURL, coverKind = thumbURL, kind
		case photoURL != "":
			coverURL, coverKind = photoURL, kind
		}
	}
	return mapStickerSetHeader(set, coverURL, coverKind), true
}

// stickerSetCoveredParts unwraps the three stickerSetCovered variants into the
// set plus one preview document.
func stickerSetCoveredParts(covered tg.StickerSetCoveredClass) (*tg.StickerSet, *tg.Document, bool) {
	switch value := covered.(type) {
	case *tg.StickerSetCovered:
		set := value.Set
		doc, _ := value.Cover.(*tg.Document)
		return &set, doc, true
	case *tg.StickerSetMultiCovered:
		set := value.Set
		for _, raw := range value.Covers {
			if doc, ok := raw.(*tg.Document); ok {
				return &set, doc, true
			}
		}
		return &set, nil, true
	case *tg.StickerSetFullCovered:
		set := value.Set
		for _, raw := range value.Documents {
			if doc, ok := raw.(*tg.Document); ok {
				return &set, doc, true
			}
		}
		return &set, nil, true
	}
	return nil, nil, false
}

// stickerSetInput decodes an opaque set ref into the TL input constructor.
func stickerSetInput(ref string) (tg.InputStickerSetClass, error) {
	id, accessHash, err := decodeStickerSetRef(ref)
	if err != nil {
		return nil, err
	}
	return &tg.InputStickerSetID{ID: id, AccessHash: accessHash}, nil
}
