package kernel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

// Round-3 GIF search: Telegram renders GIF search through an inline bot (chat
// config's gif_search_username, the classic default is @gif). The kernel resolves
// the bot, asks messages.getInlineBotResults for one page, and maps the returned
// documents through the same thumbnail/media pipeline the saved-GIF tab uses.
// Selecting a result is sent with messages.sendInlineBotResult (query id + result
// id), not by document, because that is the only handle the bot accepts.
//
// Saved/unsaved state uses messages.saveGif against a saved-GIF document ref;
// inline-result GIFs can also be saved while their document is still in the ref
// side map (they are dropped, not refreshed, once it is evicted).

const (
	// gifSearchBotUsername is the fallback GIF inline bot. The real one is
	// advertised by help.getConfig's gif_search_username; core clients fall back
	// to "gif" and this backend keeps the same default (the bot is stable).
	gifSearchBotUsername = "gif"
	// inlineGifRefPrefix marks the opaque handle of one inline GIF search result.
	// The picker calls SendInlineGif with this token as the result id.
	inlineGifRefPrefix = "ginl1_"
	// inlineGifThumbTargetPx is the GIF grid cell size (Web K uses 124 px).
	inlineGifThumbTargetPx = 124
)

// GifSearchPageDTO is one page of inline-bot GIF search results. QueryID must be
// passed back with the chosen ResultID when sending the GIF; NextOffset is empty
// once the bot has no further pages.
type GifSearchPageDTO struct {
	Gifs       []GifDTO `json:"gifs"`
	NextOffset string   `json:"nextOffset,omitempty"`
	QueryID    int64    `json:"queryId"`
}

// inlineGifRef is the opaque result handle embedded in GifDTO.Ref for search
// results. It carries everything messages.sendInlineBotResult needs, so the
// picker can treat Ref as the single durable handle of a cell.
type inlineGifRef struct {
	QueryID  int64  `json:"q"`
	ResultID string `json:"r"`
}

func encodeInlineGifRef(queryID int64, resultID string) string {
	if queryID == 0 || resultID == "" {
		return ""
	}
	raw, err := json.Marshal(inlineGifRef{QueryID: queryID, ResultID: resultID})
	if err != nil {
		return ""
	}
	return inlineGifRefPrefix + base64.RawURLEncoding.EncodeToString(raw)
}

func decodeInlineGifRef(value string) (inlineGifRef, error) {
	var ref inlineGifRef
	if !strings.HasPrefix(value, inlineGifRefPrefix) {
		return ref, fmt.Errorf("invalid gif search reference")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, inlineGifRefPrefix))
	if err != nil {
		return ref, fmt.Errorf("invalid gif search reference: %w", err)
	}
	if err := json.Unmarshal(raw, &ref); err != nil {
		return ref, fmt.Errorf("invalid gif search reference: %w", err)
	}
	if ref.QueryID == 0 || strings.TrimSpace(ref.ResultID) == "" {
		return ref, fmt.Errorf("invalid gif search reference")
	}
	return ref, nil
}

// SearchGifs returns one page of inline-bot GIF search results. An empty query
// means "no search", exactly like Telegram Web: the GIF tab then shows the saved
// GIFs instead.
func (s *Service) SearchGifs(
	query, offset string,
	proxy, ntp string,
) (*GifSearchPageDTO, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return &GifSearchPageDTO{Gifs: []GifDTO{}}, nil
	}
	offset = strings.TrimSpace(offset)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := s.ensureSession(ctx, proxy, ntp)
	if err != nil {
		return nil, err
	}
	s.noteMediaConfig(proxy, ntp)

	results, err := fetchGifInlineResults(ctx, client, query, offset)
	if err != nil {
		return nil, err
	}
	if results == nil {
		return &GifSearchPageDTO{Gifs: []GifDTO{}}, nil
	}
	page := &GifSearchPageDTO{
		Gifs:    make([]GifDTO, 0, len(results.Results)),
		QueryID: results.QueryID,
	}
	if next, ok := results.GetNextOffset(); ok {
		page.NextOffset = next
	}
	for _, raw := range results.Results {
		media, ok := raw.(*tg.BotInlineMediaResult)
		if !ok {
			continue
		}
		document, ok := media.GetDocument()
		if !ok {
			continue
		}
		doc, ok := document.(*tg.Document)
		if !ok {
			continue
		}
		item, ok := s.mapInlineGifDoc(doc, results.QueryID, media.ID, proxy, ntp)
		if !ok {
			continue
		}
		page.Gifs = append(page.Gifs, item)
	}
	return page, nil
}

// mapInlineGifDoc converts one inline-bot GIF document into a picker cell and
// stores the document in the bounded ref side map so the result can be saved
// (messages.saveGif) without another bot round-trip.
func (s *Service) mapInlineGifDoc(
	doc *tg.Document,
	queryID int64,
	resultID string,
	proxy, ntp string,
) (GifDTO, bool) {
	resultID = strings.TrimSpace(resultID)
	if doc == nil || !isGifDocument(doc) || resultID == "" {
		return GifDTO{}, false
	}
	token := encodeInlineGifRef(queryID, resultID)
	if token == "" {
		return GifDTO{}, false
	}
	s.storeStickerDocRef(token, doc)
	thumbURL, streamURL, _ := s.stickerMediaURLs(doc, "gif", inlineGifThumbTargetPx, proxy, ntp)
	width, height := documentDimensions(doc)
	return GifDTO{
		Ref:       token,
		ID:        strconv.FormatInt(doc.ID, 10),
		ResultID:  resultID,
		ThumbURL:  thumbURL,
		StreamURL: streamURL,
		Mime:      doc.MimeType,
		W:         width,
		H:         height,
		Duration:  documentDuration(doc),
		SizeBytes: doc.Size,
	}, true
}

// fetchGifInlineResults asks the GIF inline bot for one page. A bot/user lookup
// failure caused by a stale cached input user clears the cache and resolves the
// bot once more before giving up.
func fetchGifInlineResults(
	ctx context.Context,
	client *telegram.Client,
	query, offset string,
) (*tg.MessagesBotResults, error) {
	newRequest := func(bot *tg.InputUser) *tg.MessagesGetInlineBotResultsRequest {
		return &tg.MessagesGetInlineBotResultsRequest{
			Bot:    bot,
			Peer:   &tg.InputPeerSelf{},
			Query:  query,
			Offset: offset,
		}
	}
	bot, err := resolveGifSearchBot(ctx, client)
	if err != nil {
		return nil, err
	}
	results, err := client.API().MessagesGetInlineBotResults(ctx, newRequest(bot))
	if err != nil && isStaleGifBotError(err) {
		invalidateGifSearchBotCache()
		if refreshed, resolveErr := resolveGifSearchBot(ctx, client); resolveErr == nil {
			results, err = client.API().MessagesGetInlineBotResults(ctx, newRequest(refreshed))
		}
	}
	if err != nil {
		return nil, readableRPCError("search gifs", err)
	}
	return results, nil
}

// gifSearchBotCache remembers the resolved @gif input user across the pages of
// one GIF search (every page is a separate getInlineBotResults call, and
// contacts.resolveUsername is a full round-trip). The input user carries an
// account-scoped access hash, so invalidateStickerCaches drops it on session
// reset; a stale entry that the server rejects is also dropped and resolved once
// more by SearchGifs.
var gifSearchBotCache struct {
	mu   sync.Mutex
	user *tg.InputUser
}

func cachedGifSearchBot() *tg.InputUser {
	gifSearchBotCache.mu.Lock()
	defer gifSearchBotCache.mu.Unlock()
	if gifSearchBotCache.user == nil {
		return nil
	}
	user := *gifSearchBotCache.user
	return &user
}

func storeGifSearchBot(user *tg.InputUser) {
	if user == nil {
		return
	}
	gifSearchBotCache.mu.Lock()
	gifSearchBotCache.user = user
	gifSearchBotCache.mu.Unlock()
}

func invalidateGifSearchBotCache() {
	gifSearchBotCache.mu.Lock()
	gifSearchBotCache.user = nil
	gifSearchBotCache.mu.Unlock()
}

// isStaleGifBotError reports whether an inline-bot failure may be caused by an
// outdated cached bot user (access hash rotated / bot temporarily unresolved).
func isStaleGifBotError(err error) bool {
	return tgerr.Is(
		err,
		tg.ErrBotInvalid,
		tg.ErrUserIDInvalid,
		tg.ErrPeerIDInvalid,
		tg.ErrInputUserDeactivated,
	)
}

// resolveGifSearchBot resolves the inline GIF search bot (@gif by default) into
// the TL input user messages.getInlineBotResults needs.
func resolveGifSearchBot(ctx context.Context, client *telegram.Client) (*tg.InputUser, error) {
	if user := cachedGifSearchBot(); user != nil {
		return user, nil
	}
	resp, err := client.API().ContactsResolveUsername(ctx, &tg.ContactsResolveUsernameRequest{
		Username: gifSearchBotUsername,
	})
	if err != nil {
		if tgerr.Is(err, tg.ErrUsernameNotOccupied) || tgerr.Is(err, tg.ErrUsernameInvalid) {
			return nil, fmt.Errorf("search gifs: the GIF search bot is not available")
		}
		return nil, readableRPCError("search gifs", err)
	}
	if resp != nil {
		for _, raw := range resp.Users {
			user, ok := raw.(*tg.User)
			if !ok || user.ID == 0 || !user.Bot {
				continue
			}
			if name, ok := user.GetUsername(); ok && strings.EqualFold(name, gifSearchBotUsername) {
				input := &tg.InputUser{UserID: user.ID, AccessHash: user.AccessHash}
				storeGifSearchBot(input)
				return input, nil
			}
		}
		for _, raw := range resp.Users {
			if user, ok := raw.(*tg.User); ok && user.ID != 0 && user.Bot {
				input := &tg.InputUser{UserID: user.ID, AccessHash: user.AccessHash}
				storeGifSearchBot(input)
				return input, nil
			}
		}
	}
	return nil, fmt.Errorf("search gifs: the GIF search bot is not available")
}

// resolveInlineGifResult accepts either the opaque GifDTO.Ref handle or a raw
// inline result id; the opaque handle also carries the query id it belongs to,
// which lets the client pass a stale page query id safely.
func resolveInlineGifResult(resultID string, queryID int64) (int64, string, error) {
	resultID = strings.TrimSpace(resultID)
	if resultID == "" {
		return queryID, "", fmt.Errorf("send gif: missing inline result id")
	}
	if strings.HasPrefix(resultID, inlineGifRefPrefix) {
		ref, err := decodeInlineGifRef(resultID)
		if err != nil {
			return queryID, "", err
		}
		return ref.QueryID, ref.ResultID, nil
	}
	if queryID <= 0 {
		return queryID, "", fmt.Errorf("send gif: the search results have expired, search again")
	}
	return queryID, resultID, nil
}

// SendInlineGif sends one GIF search result with messages.sendInlineBotResult.
// resultID is normally the opaque GifDTO.Ref handle (the frontend stores no raw
// result ids); a raw inline result id is accepted together with queryID.
func (s *Service) SendInlineGif(
	chatID string,
	queryID int64,
	resultID string,
	replyToID int,
	proxy, ntp string,
) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}
	resolvedQueryID, inlineResultID, err := resolveInlineGifResult(resultID, queryID)
	if err != nil {
		return err
	}
	s.rememberPeer(peer)

	// Chat sends are serialized on the shared session, like SendMessage/SendGif.
	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	randomID := time.Now().UnixNano()
	if randomID < 0 {
		randomID = -randomID
	}
	request := &tg.MessagesSendInlineBotResultRequest{
		Peer:       peer,
		QueryID:    resolvedQueryID,
		ID:         inlineResultID,
		RandomID:   randomID,
		ClearDraft: true,
	}
	if replyToID > 0 {
		request.SetReplyTo(&tg.InputReplyToMessage{ReplyToMsgID: replyToID})
	}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		_, sendErr := client.API().MessagesSendInlineBotResult(ctx, request)
		return sendErr
	})
	if err != nil {
		switch {
		case tgerr.Is(err, tg.ErrQueryIDInvalid):
			return fmt.Errorf("send gif: the search results have expired, search again")
		case tgerr.Is(err, tg.ErrResultIDInvalid):
			return fmt.Errorf("send gif: this GIF is no longer available")
		default:
			return stickerSendError(stickerRefKindGif, err)
		}
	}
	// A sent GIF that is also in the saved list is moved to its front by the
	// server; like Web K let the next read refetch the order.
	s.invalidateSavedGifsCache()
	return nil
}

// SetGifSaved adds or removes a GIF from the saved-GIF list
// (messages.saveGif). ref is either a saved-GIF document ref or the opaque
// handle of a search result that is still in the session ref map.
func (s *Service) SetGifSaved(ref string, saved bool, proxy, ntp string) error {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return fmt.Errorf("invalid gif reference")
	}
	var (
		decoded    stickerDocRef
		inlineRef  bool
		savedRefOK bool
	)
	if strings.HasPrefix(ref, inlineGifRefPrefix) {
		if _, err := decodeInlineGifRef(ref); err != nil {
			return err
		}
		inlineRef = true
	} else {
		decodedRef, err := decodeStickerDocRef(ref)
		if err != nil {
			return err
		}
		if decodedRef.Kind != stickerRefKindGif {
			return fmt.Errorf("invalid gif reference")
		}
		decoded = decodedRef
		savedRefOK = true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	return s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		doc := s.stickerDocByRef(ref)
		if doc == nil && !inlineRef {
			refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
			if refreshErr != nil {
				return refreshErr
			}
			s.storeStickerDocRef(ref, refreshed)
			doc = refreshed
		}
		if doc == nil {
			return fmt.Errorf("save gif: this GIF is no longer available; search again")
		}
		saveErr := saveGifDocument(ctx, client, doc, saved)
		if isFileReferenceError(saveErr) && savedRefOK {
			refreshed, refreshErr := s.refreshStickerDoc(ctx, client, decoded)
			if refreshErr != nil {
				return refreshErr
			}
			s.storeStickerDocRef(ref, refreshed)
			saveErr = saveGifDocument(ctx, client, refreshed, saved)
		}
		if saveErr != nil {
			if tgerr.Is(saveErr, tg.ErrGifIDInvalid) {
				return fmt.Errorf("save gif: this GIF is no longer available")
			}
			return readableRPCError("save gif", saveErr)
		}
		// Both directions change the saved-GIF list; the next read refetches it.
		s.invalidateSavedGifsCache()
		return nil
	})
}

func saveGifDocument(
	ctx context.Context,
	client *telegram.Client,
	doc *tg.Document,
	saved bool,
) error {
	if doc == nil || doc.ID == 0 {
		return fmt.Errorf("gif is unavailable")
	}
	_, err := client.API().MessagesSaveGif(ctx, &tg.MessagesSaveGifRequest{
		ID: &tg.InputDocument{
			ID:            doc.ID,
			AccessHash:    doc.AccessHash,
			FileReference: doc.FileReference,
		},
		Unsave: !saved,
	})
	return err
}
