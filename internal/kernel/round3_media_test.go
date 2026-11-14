package kernel

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

// Round-3 backend-media unit tests: pure mapping/ref/token helpers for sticker
// search, favorites, featured sets, inline GIF search and the mini-app bridge.
// Nothing here touches the network; the Service is built with the same fake
// loopback media server the round-2 sticker tests use.

func b64JSON(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func TestNormalizeStickerSearchLimit(t *testing.T) {
	cases := map[int]int{
		0:                         stickerSearchResultLimit,
		-10:                       stickerSearchResultLimit,
		1:                         1,
		10:                        10,
		stickerSearchMaxLimit:     stickerSearchMaxLimit,
		stickerSearchMaxLimit + 1: stickerSearchMaxLimit,
	}
	for input, want := range cases {
		if got := normalizeStickerSearchLimit(input); got != want {
			t.Fatalf("normalizeStickerSearchLimit(%d) = %d want %d", input, got, want)
		}
	}
}

func TestTruncateStickerSearchQuery(t *testing.T) {
	if got := truncateStickerSearchQuery("  cat  "); got != "cat" {
		t.Fatalf("query trim = %q", got)
	}
	if got := truncateStickerSearchQuery("   "); got != "" {
		t.Fatalf("blank query = %q", got)
	}
	long := strings.Repeat("猫", stickerRefQueryLimit+20)
	got := truncateStickerSearchQuery(long)
	if runes := []rune(got); len(runes) != stickerRefQueryLimit {
		t.Fatalf("long query length = %d want %d", len(runes), stickerRefQueryLimit)
	}
}

func TestStickerDocRefForList(t *testing.T) {
	// Set-owned documents always refresh through messages.getStickerSet, even
	// when they were listed by search or the favorites list.
	setDoc := stickerFixture()
	setOwned := stickerDocRefForList(setDoc, stickerRefKindSticker, stickerRefSourceSearch, "cat")
	if setOwned.Source != stickerRefSourceSet || setOwned.SetRef == "" || setOwned.Query != "" {
		t.Fatalf("set-owned ref = %+v", setOwned)
	}
	decoded, err := decodeStickerDocRef(encodeStickerDocRef(setOwned))
	if err != nil || decoded != setOwned {
		t.Fatalf("set-owned round trip: %+v (%v)", decoded, err)
	}

	unclaimed := &tg.Document{
		ID:       7,
		MimeType: "image/webp",
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeSticker{
				Alt:        "🙂",
				Stickerset: &tg.InputStickerSetEmpty{},
			},
		},
	}
	searchRef := stickerDocRefForList(unclaimed, stickerRefKindSticker, stickerRefSourceSearch, "  happy cat  ")
	if searchRef.Source != stickerRefSourceSearch || searchRef.Query != "happy cat" {
		t.Fatalf("search ref = %+v", searchRef)
	}
	if _, err := decodeStickerDocRef(encodeStickerDocRef(searchRef)); err != nil {
		t.Fatalf("search ref token rejected: %v", err)
	}
	favRef := stickerDocRefForList(unclaimed, stickerRefKindSticker, stickerRefSourceFavorites, "")
	if favRef.Source != stickerRefSourceFavorites || favRef.Query != "" {
		t.Fatalf("favorites ref = %+v", favRef)
	}
	if _, err := decodeStickerDocRef(encodeStickerDocRef(favRef)); err != nil {
		t.Fatalf("favorites ref token rejected: %v", err)
	}
}

func TestDecodeStickerDocRefRequiresSearchQuery(t *testing.T) {
	if _, err := decodeStickerDocRef(
		stickerDocRefPrefix + b64JSON(`{"id":1,"kind":"sticker","source":"search"}`),
	); err == nil {
		t.Fatalf("search ref without query was accepted")
	}
	if _, err := decodeStickerDocRef(
		stickerDocRefPrefix + b64JSON(`{"id":1,"kind":"sticker","source":"favorites"}`),
	); err != nil {
		t.Fatalf("favorites ref rejected: %v", err)
	}
}

func TestMapStickerDocWithTokenSearchSources(t *testing.T) {
	service := newStickerTestService()

	// Set-owned search result: the token must refresh through the set.
	doc := stickerFixture()
	token := encodeStickerDocRef(stickerDocRefForList(
		doc, stickerRefKindSticker, stickerRefSourceSearch, "cat",
	))
	item := service.mapStickerDocWithToken(doc, stickerDocKind(doc), token, "", stickerThumbTargetPx, "proxy", "ntp")
	if item.Ref != token || item.Kind != "static" || item.Emoji != "😀" {
		t.Fatalf("unexpected item: %+v", item)
	}
	if item.SetID != encodeStickerSetRef(42, 43) {
		t.Fatalf("setId = %q", item.SetID)
	}
	if !strings.Contains(item.ThumbURL, "/thumb/") || !strings.Contains(item.PhotoURL, "/photo/") {
		t.Fatalf("media urls missing: %+v", item)
	}
	if service.stickerDocByRef(token) != doc {
		t.Fatalf("document was not stored in the ref side map")
	}
	decoded, err := decodeStickerDocRef(item.Ref)
	if err != nil || decoded.Source != stickerRefSourceSet || decoded.SetRef != item.SetID {
		t.Fatalf("search ref decoded to %+v (%v)", decoded, err)
	}

	// Unclaimed search result: the token must carry the query for refresh.
	unclaimed := &tg.Document{
		ID:       9,
		MimeType: "image/webp",
		Size:     100,
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeSticker{Alt: "🙂", Stickerset: &tg.InputStickerSetEmpty{}},
		},
	}
	unclaimedToken := encodeStickerDocRef(stickerDocRefForList(
		unclaimed, stickerRefKindSticker, stickerRefSourceSearch, "happy cat",
	))
	unclaimedItem := service.mapStickerDocWithToken(
		unclaimed, stickerDocKind(unclaimed), unclaimedToken, "", stickerThumbTargetPx, "proxy", "ntp",
	)
	unclaimedRef, err := decodeStickerDocRef(unclaimedItem.Ref)
	if err != nil || unclaimedRef.Source != stickerRefSourceSearch || unclaimedRef.Query != "happy cat" {
		t.Fatalf("unclaimed search ref = %+v (%v)", unclaimedRef, err)
	}
}

func TestInlineGifRefRoundTrip(t *testing.T) {
	token := encodeInlineGifRef(12345, "result-7")
	if !strings.HasPrefix(token, inlineGifRefPrefix) {
		t.Fatalf("token %q misses prefix", token)
	}
	ref, err := decodeInlineGifRef(token)
	if err != nil || ref.QueryID != 12345 || ref.ResultID != "result-7" {
		t.Fatalf("decode = %+v (%v)", ref, err)
	}
	for name, value := range map[string]string{
		"empty":           "",
		"wrong prefix":    "ginl2_AAAA",
		"missing payload": inlineGifRefPrefix,
		"bad base64":      inlineGifRefPrefix + "%%%",
		"not json":        inlineGifRefPrefix + b64JSON("nope"),
		"missing query":   inlineGifRefPrefix + b64JSON(`{"q":0,"r":"x"}`),
		"missing result":  inlineGifRefPrefix + b64JSON(`{"q":1,"r":"  "}`),
	} {
		if _, err := decodeInlineGifRef(value); err == nil {
			t.Fatalf("%s: expected error for %q", name, value)
		}
	}
}

func TestResolveInlineGifResult(t *testing.T) {
	token := encodeInlineGifRef(99, "rid")
	queryID, resultID, err := resolveInlineGifResult(token, 5)
	if err != nil || queryID != 99 || resultID != "rid" {
		t.Fatalf("opaque ref = (%d,%q,%v)", queryID, resultID, err)
	}
	queryID, resultID, err = resolveInlineGifResult(" raw-id ", 5)
	if err != nil || queryID != 5 || resultID != "raw-id" {
		t.Fatalf("raw id = (%d,%q,%v)", queryID, resultID, err)
	}
	if _, _, err := resolveInlineGifResult("raw", 0); err == nil {
		t.Fatalf("raw id without query id was accepted")
	}
	if _, _, err := resolveInlineGifResult("   ", 5); err == nil {
		t.Fatalf("blank result id was accepted")
	}
	if _, _, err := resolveInlineGifResult(inlineGifRefPrefix+"broken", 5); err == nil {
		t.Fatalf("broken opaque ref was accepted")
	}
}

func TestMapInlineGifDoc(t *testing.T) {
	service := newStickerTestService()
	doc := gifFixture()
	item, ok := service.mapInlineGifDoc(doc, 777, "rid-1", "proxy", "ntp")
	if !ok {
		t.Fatalf("mapInlineGifDoc rejected a valid gif")
	}
	if item.ResultID != "rid-1" || item.ID != "300" {
		t.Fatalf("unexpected gif dto: %+v", item)
	}
	if item.Mime != "video/mp4" || item.Duration != 2.5 || item.W != 320 || item.H != 240 {
		t.Fatalf("unexpected gif metadata: %+v", item)
	}
	if !strings.Contains(item.ThumbURL, "/thumb/") || !strings.Contains(item.StreamURL, "/photo/") {
		t.Fatalf("gif media urls missing: %+v", item)
	}
	ref, err := decodeInlineGifRef(item.Ref)
	if err != nil || ref.QueryID != 777 || ref.ResultID != "rid-1" {
		t.Fatalf("inline ref = %+v (%v)", ref, err)
	}
	if service.stickerDocByRef(item.Ref) != doc {
		t.Fatalf("inline gif document was not stored in the ref side map")
	}

	if _, ok := service.mapInlineGifDoc(stickerFixture(), 1, "rid", "proxy", "ntp"); ok {
		t.Fatalf("sticker document mapped as inline gif")
	}
	if _, ok := service.mapInlineGifDoc(doc, 1, "  ", "proxy", "ntp"); ok {
		t.Fatalf("empty result id mapped as inline gif")
	}
	if _, ok := service.mapInlineGifDoc(doc, 0, "rid", "proxy", "ntp"); ok {
		t.Fatalf("zero query id mapped as inline gif")
	}
}

func TestMapStickerSetHeaderInstalled(t *testing.T) {
	installedSet := &tg.StickerSet{ID: 5, AccessHash: 6, Title: "Installed"}
	installedSet.SetInstalledDate(1700000000)
	if header := mapStickerSetHeader(installedSet, "", ""); !header.Installed {
		t.Fatalf("installed set not flagged: %+v", header)
	}
	plain := &tg.StickerSet{ID: 7, AccessHash: 8, Title: "Plain"}
	if header := mapStickerSetHeader(plain, "", ""); header.Installed {
		t.Fatalf("plain set flagged installed: %+v", header)
	}
}

func TestMapInstalledStickerSets(t *testing.T) {
	service := newStickerTestService()
	normal := &tg.StickerSet{
		ID:         21,
		AccessHash: 22,
		Title:      "Cats",
		ShortName:  "cats",
		Count:      3,
		Official:   true,
	}
	normal.SetThumbs([]tg.PhotoSizeClass{&tg.PhotoSize{Type: "m", W: 100, H: 100, Size: 3000}})
	normal.SetThumbDCID(2)
	normal.SetThumbVersion(1)
	maskSet := &tg.StickerSet{ID: 11, AccessHash: 12, Title: "Masks", Masks: true}
	emojiSet := &tg.StickerSet{ID: 13, AccessHash: 14, Title: "Emoji", Emojis: true}

	sets := service.mapInstalledStickerSets(
		[]tg.StickerSet{*maskSet, *emojiSet, *normal},
		"proxy",
		"ntp",
	)
	if len(sets) != 1 {
		t.Fatalf("filtered sets = %d want 1", len(sets))
	}
	header := sets[0]
	if header.ID != "21" || header.Title != "Cats" || !header.Official || !header.Installed || header.Count != 3 {
		t.Fatalf("unexpected installed header: %+v", header)
	}
	if header.CoverKind != "static" || !strings.Contains(header.CoverURL, "/thumb/") {
		t.Fatalf("unexpected installed cover: %+v", header)
	}
	if id, accessHash, err := decodeStickerSetRef(header.Ref); err != nil || id != 21 || accessHash != 22 {
		t.Fatalf("installed ref = (%d,%d,%v)", id, accessHash, err)
	}
}

func TestStickerSetCoveredParts(t *testing.T) {
	set := tg.StickerSet{ID: 3, AccessHash: 4, Title: "Set"}
	doc := stickerFixture()

	gotSet, gotDoc, ok := stickerSetCoveredParts(&tg.StickerSetCovered{Set: set, Cover: doc})
	if !ok || gotSet.ID != 3 || gotDoc != doc {
		t.Fatalf("covered variant unwrap: %+v %v %v", gotSet, gotDoc, ok)
	}
	_, gotDoc, ok = stickerSetCoveredParts(&tg.StickerSetMultiCovered{
		Set:    set,
		Covers: []tg.DocumentClass{doc},
	})
	if !ok || gotDoc != doc {
		t.Fatalf("multi covered variant unwrap: %v %v", gotDoc, ok)
	}
	_, gotDoc, ok = stickerSetCoveredParts(&tg.StickerSetFullCovered{
		Set:       set,
		Documents: []tg.DocumentClass{doc},
	})
	if !ok || gotDoc != doc {
		t.Fatalf("full covered variant unwrap: %v %v", gotDoc, ok)
	}
	if _, _, ok := stickerSetCoveredParts(nil); ok {
		t.Fatalf("nil covered variant was accepted")
	}
}

func TestMapFeaturedStickerSet(t *testing.T) {
	service := newStickerTestService()

	set := &tg.StickerSet{ID: 31, AccessHash: 32, Title: "Featured", Count: 9}
	set.SetThumbs([]tg.PhotoSizeClass{&tg.PhotoSize{Type: "m", W: 100, H: 100, Size: 4000}})
	set.SetThumbDCID(2)
	set.SetThumbVersion(3)
	header, ok := service.mapFeaturedStickerSet(&tg.StickerSetCovered{Set: *set}, "proxy", "ntp")
	if !ok || header.Title != "Featured" || header.Count != 9 {
		t.Fatalf("featured header = %+v (%v)", header, ok)
	}
	if header.CoverKind != "static" || !strings.Contains(header.CoverURL, "/thumb/") {
		t.Fatalf("featured cover = %+v", header)
	}
	if header.Installed {
		t.Fatalf("featured set without installed date flagged installed")
	}

	// No set thumbnail: the preview sticker document becomes the cover.
	bare := &tg.StickerSet{ID: 41, AccessHash: 42, Title: "Bare", Count: 1}
	bare.SetInstalledDate(1700000100)
	fallback, ok := service.mapFeaturedStickerSet(&tg.StickerSetFullCovered{
		Set:       *bare,
		Documents: []tg.DocumentClass{stickerFixture()},
	}, "proxy", "ntp")
	if !ok {
		t.Fatalf("featured fallback rejected")
	}
	if !fallback.Installed {
		t.Fatalf("featured set with installed date not flagged: %+v", fallback)
	}
	if !strings.Contains(fallback.CoverURL, "/thumb/") || fallback.CoverKind != "static" {
		t.Fatalf("featured fallback cover = %+v", fallback)
	}

	maskCovered := &tg.StickerSetCovered{Set: tg.StickerSet{ID: 51, AccessHash: 52, Masks: true}}
	if _, ok := service.mapFeaturedStickerSet(maskCovered, "proxy", "ntp"); ok {
		t.Fatalf("mask set mapped as featured")
	}
}

func TestSearchStickerSetHeadersUsesInstalledIndex(t *testing.T) {
	service := newStickerTestService()
	installed := StickerSetDTO{
		Ref:       encodeStickerSetRef(42, 43),
		ID:        "42",
		Title:     "Cats",
		Count:     2,
		Installed: true,
	}
	service.storeStickerSets([]StickerSetDTO{installed})

	// Cache is warm, so no client is needed and no RPC happens.
	sets := service.searchStickerSetHeaders(context.Background(), nil, []string{installed.Ref}, "proxy", "ntp")
	if len(sets) != 1 || sets[0].Title != "Cats" || !sets[0].Installed {
		t.Fatalf("installed search header = %+v", sets)
	}
	if got := service.searchStickerSetHeaders(context.Background(), nil, nil, "proxy", "ntp"); got == nil || len(got) != 0 {
		t.Fatalf("empty set order = %#v", got)
	}
}

func TestStickerSetInput(t *testing.T) {
	input, err := stickerSetInput(encodeStickerSetRef(42, -43))
	if err != nil {
		t.Fatalf("stickerSetInput error: %v", err)
	}
	id, ok := input.(*tg.InputStickerSetID)
	if !ok || id.ID != 42 || id.AccessHash != -43 {
		t.Fatalf("unexpected input: %#v", input)
	}
	for _, value := range []string{"", "bad", stickerSetRefPrefix + "%%"} {
		if _, err := stickerSetInput(value); err == nil {
			t.Fatalf("expected error for set ref %q", value)
		}
	}
}

func TestWebViewBotInputUser(t *testing.T) {
	user, err := webViewBotInputUser("user:777:-888")
	if err != nil || user.UserID != 777 || user.AccessHash != -888 {
		t.Fatalf("bot input user = %+v (%v)", user, err)
	}
	for _, value := range []string{"", "user:777", "chat:5:0", "channel:9:10", "user:0:0", "bogus:1:2"} {
		if _, err := webViewBotInputUser(value); err == nil {
			t.Fatalf("expected error for bot peer %q", value)
		}
	}
}

func TestWebViewBridgeValidation(t *testing.T) {
	service := newStickerTestService()
	validChat := "user:1:2"
	validBot := "user:2:3"

	if err := service.SendWebViewData("bad", validBot, 1, "x", "", ""); err == nil {
		t.Fatalf("invalid chat id accepted")
	}
	if err := service.SendWebViewData(validChat, "chat:3:0", 1, "x", "", ""); err == nil {
		t.Fatalf("non-user bot peer accepted")
	}
	if err := service.SendWebViewData(
		validChat, validBot, 1, strings.Repeat("x", maxWebViewDataBytes+1), "", "",
	); err == nil {
		t.Fatalf("oversized webview payload accepted")
	}
	if err := service.SendWebViewData(validChat, validBot, -1, "x", "", ""); err == nil {
		t.Fatalf("negative query id accepted")
	}
	if err := service.ProlongWebView("bad", validBot, 1, "", ""); err == nil {
		t.Fatalf("invalid prolong chat id accepted")
	}
	if err := service.ProlongWebView(validChat, "chat:3:0", 1, "", ""); err == nil {
		t.Fatalf("non-user prolong bot peer accepted")
	}
	if err := service.ProlongWebView(validChat, validBot, 0, "", ""); err == nil {
		t.Fatalf("zero prolong query id accepted")
	}
}

func TestFaveAndSaveGifRejectMissingDocument(t *testing.T) {
	if err := faveStickerDocument(context.Background(), nil, nil, true); err == nil {
		t.Fatalf("fave without document accepted")
	}
	if err := saveGifDocument(context.Background(), nil, nil, true); err == nil {
		t.Fatalf("save without document accepted")
	}
}

func TestSetGifSavedValidation(t *testing.T) {
	service := newStickerTestService()
	if err := service.SetGifSaved("", true, "", ""); err == nil {
		t.Fatalf("empty gif ref accepted")
	}
	if err := service.SetGifSaved("nonsense", true, "", ""); err == nil {
		t.Fatalf("unknown gif ref accepted")
	}
	stickerToken := encodeStickerDocRef(stickerDocRef{
		ID: 1, Kind: stickerRefKindSticker, Source: stickerRefSourceRecent,
	})
	if err := service.SetGifSaved(stickerToken, true, "", ""); err == nil {
		t.Fatalf("sticker ref accepted as gif ref")
	}
	if err := service.SetGifSaved(inlineGifRefPrefix+"%%", true, "", ""); err == nil {
		t.Fatalf("malformed inline gif ref accepted")
	}
}

func TestSetStickerFavedValidation(t *testing.T) {
	service := newStickerTestService()
	if err := service.SetStickerFaved("", true, "", ""); err == nil {
		t.Fatalf("empty sticker ref accepted")
	}
	gifToken := encodeStickerDocRef(stickerDocRef{
		ID: 1, Kind: stickerRefKindGif, Source: stickerRefSourceGif,
	})
	if err := service.SetStickerFaved(gifToken, true, "", ""); err == nil {
		t.Fatalf("gif ref accepted as sticker ref")
	}
}
