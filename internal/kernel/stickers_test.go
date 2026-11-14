package kernel

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

// newStickerTestService builds a Service with the sticker ref/cache plumbing
// initialized and a fake already-started loopback media server, so DTO mapping
// can be exercised without opening a listener or touching Telegram.
func newStickerTestService() *Service {
	return &Service{
		imageRefs:       newImageRefStore(64),
		stickerRefs:     make(map[string]*tg.Document),
		stickerSetCache: make(map[string]stickerSetCacheEntry),
		peerIndex:       make(map[string]string),
		mediaBaseURL:    "http://127.0.0.1:9/media/test/",
		thumbBase:       "http://127.0.0.1:9/thumb/test/",
		photoBase:       "http://127.0.0.1:9/photo/test/",
	}
}

func stickerFixture() *tg.Document {
	doc := &tg.Document{
		ID:            100,
		AccessHash:    200,
		FileReference: []byte{1, 2, 3, 0xff},
		Date:          1700000000,
		MimeType:      "image/webp",
		Size:          1234,
		DCID:          2,
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeSticker{
				Alt:        "😀",
				Stickerset: &tg.InputStickerSetID{ID: 42, AccessHash: 43},
			},
			&tg.DocumentAttributeImageSize{W: 512, H: 512},
		},
	}
	doc.SetThumbs([]tg.PhotoSizeClass{
		&tg.PhotoSize{Type: "m", W: 128, H: 128, Size: 500},
	})
	return doc
}

func gifFixture() *tg.Document {
	doc := &tg.Document{
		ID:            300,
		AccessHash:    301,
		FileReference: []byte{9, 8, 7},
		Date:          1700000100,
		MimeType:      "video/mp4",
		Size:          900000,
		DCID:          4,
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeAnimated{},
			&tg.DocumentAttributeVideo{Duration: 2.5, W: 320, H: 240},
		},
	}
	doc.SetThumbs([]tg.PhotoSizeClass{
		&tg.PhotoSizeProgressive{Type: "m", W: 100, H: 100, Sizes: []int{2000, 4000}},
	})
	return doc
}

func TestStickerDocRefRoundTrip(t *testing.T) {
	setRef := encodeStickerSetRef(7, 8)
	cases := []stickerDocRef{
		{ID: 1, Kind: stickerRefKindSticker, Source: stickerRefSourceRecent},
		{ID: 9223372036854775807, Kind: stickerRefKindGif, Source: stickerRefSourceGif},
		{ID: 2, Kind: stickerRefKindSticker, Source: stickerRefSourceSet, SetRef: setRef},
	}
	for _, want := range cases {
		token := encodeStickerDocRef(want)
		if token == "" {
			t.Fatalf("encodeStickerDocRef(%+v) returned empty token", want)
		}
		if !strings.HasPrefix(token, stickerDocRefPrefix) {
			t.Fatalf("token %q misses prefix", token)
		}
		got, err := decodeStickerDocRef(token)
		if err != nil {
			t.Fatalf("decodeStickerDocRef(%q) error: %v", token, err)
		}
		if got != want {
			t.Fatalf("round trip mismatch: got %+v want %+v", got, want)
		}
	}
}

func TestDecodeStickerDocRefRejectsMalformed(t *testing.T) {
	validSet := encodeStickerSetRef(1, 2)
	invalidJSON := base64.RawURLEncoding.EncodeToString([]byte("not json"))
	b64 := func(value string) string { return base64.RawURLEncoding.EncodeToString([]byte(value)) }
	cases := map[string]string{
		"empty":           "",
		"wrong prefix":    "doc1_AAAA",
		"missing payload": stickerDocRefPrefix,
		"bad base64":      stickerDocRefPrefix + "%%%",
		"not json":        stickerDocRefPrefix + invalidJSON,
		"missing id":      stickerDocRefPrefix + b64(`{"id":0,"kind":"sticker","source":"recent"}`),
		"unknown kind":    stickerDocRefPrefix + b64(`{"id":1,"kind":"video","source":"recent"}`),
		"unknown source":  stickerDocRefPrefix + b64(`{"id":1,"kind":"sticker","source":"faved"}`),
		"set without ref": stickerDocRefPrefix + b64(`{"id":1,"kind":"sticker","source":"set"}`),
		"set invalid ref": stickerDocRefPrefix + b64(`{"id":1,"kind":"sticker","source":"set","setRef":"sset1_AA"}`),
	}
	for name, token := range cases {
		if _, err := decodeStickerDocRef(token); err == nil {
			t.Fatalf("%s: expected error for token %q", name, token)
		}
	}
	// Sanity check that a valid set ref is accepted.
	if _, err := decodeStickerDocRef(stickerDocRefPrefix + b64(
		`{"id":1,"kind":"sticker","source":"set","setRef":"`+validSet+`"}`,
	)); err != nil {
		t.Fatalf("valid set ref rejected: %v", err)
	}
}

func TestStickerSetRefRoundTrip(t *testing.T) {
	cases := [][2]int64{
		{1, 2},
		{42, -43},
		{-9, -8},
		{9223372036854775807, -9223372036854775808},
	}
	for _, values := range cases {
		token := encodeStickerSetRef(values[0], values[1])
		if !strings.HasPrefix(token, stickerSetRefPrefix) {
			t.Fatalf("token %q misses prefix", token)
		}
		id, accessHash, err := decodeStickerSetRef(token)
		if err != nil {
			t.Fatalf("decode(%q) error: %v", token, err)
		}
		if id != values[0] || accessHash != values[1] {
			t.Fatalf("round trip %+v => (%d,%d)", values, id, accessHash)
		}
	}
	for _, token := range []string{
		"",
		"sset2_AA",
		stickerSetRefPrefix,
		stickerSetRefPrefix + "%%%",
		stickerSetRefPrefix + base64.RawURLEncoding.EncodeToString([]byte("short")),
		encodeStickerSetRef(0, 1),
	} {
		if _, _, err := decodeStickerSetRef(token); err == nil {
			t.Fatalf("expected error for token %q", token)
		}
	}
}

func TestStickerDocKind(t *testing.T) {
	stickerAttr := &tg.DocumentAttributeSticker{Alt: "🙂"}
	cases := []struct {
		name string
		doc  *tg.Document
		want string
	}{
		{"webp sticker", &tg.Document{ID: 1, MimeType: "image/webp", Attributes: []tg.DocumentAttributeClass{stickerAttr}}, "static"},
		{"png sticker", &tg.Document{ID: 1, MimeType: "image/png", Attributes: []tg.DocumentAttributeClass{stickerAttr}}, "static"},
		{"tgs sticker", &tg.Document{ID: 1, MimeType: "application/x-tgsticker", Attributes: []tg.DocumentAttributeClass{stickerAttr}}, "tgs"},
		{"webm sticker", &tg.Document{ID: 1, MimeType: "video/webm", Attributes: []tg.DocumentAttributeClass{stickerAttr}}, "webm"},
		{"mp4 animated", &tg.Document{ID: 1, MimeType: "video/mp4", Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeAnimated{}}}, "gif"},
		{"gif animated", &tg.Document{ID: 1, MimeType: "image/gif", Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeAnimated{}}}, "gif"},
		{"mp4 not animated", &tg.Document{ID: 1, MimeType: "video/mp4"}, ""},
		{"custom emoji", &tg.Document{
			ID:         1,
			MimeType:   "application/x-tgsticker",
			Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeCustomEmoji{Alt: "😀"}},
		}, ""},
		{"mask", &tg.Document{
			ID:         1,
			MimeType:   "image/webp",
			Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeSticker{Mask: true}},
		}, ""},
		{"empty doc", nil, ""},
	}
	for _, testCase := range cases {
		if got := stickerDocKind(testCase.doc); got != testCase.want {
			t.Fatalf("%s: got %q want %q", testCase.name, got, testCase.want)
		}
	}
}

func TestIsStickerAndGifDocuments(t *testing.T) {
	sticker := stickerFixture()
	if !isStickerDocument(sticker) || isGifDocument(sticker) {
		t.Fatalf("static sticker misclassified (sticker=%v gif=%v)", isStickerDocument(sticker), isGifDocument(sticker))
	}
	gif := gifFixture()
	if !isGifDocument(gif) || isStickerDocument(gif) {
		t.Fatalf("gif misclassified (sticker=%v gif=%v)", isStickerDocument(gif), isGifDocument(gif))
	}
	customEmoji := &tg.Document{
		MimeType:   "application/x-tgsticker",
		Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeCustomEmoji{Alt: "😀"}},
	}
	if isStickerDocument(customEmoji) || isGifDocument(customEmoji) {
		t.Fatalf("custom emoji treated as sticker/gif")
	}
}

func TestStickerEmojiAndSetRef(t *testing.T) {
	doc := stickerFixture()
	if got := stickerEmoji(doc); got != "😀" {
		t.Fatalf("stickerEmoji = %q", got)
	}
	wantSet := encodeStickerSetRef(42, 43)
	if got := stickerSetRefOf(doc); got != wantSet {
		t.Fatalf("stickerSetRefOf = %q want %q", got, wantSet)
	}
	unclaimed := &tg.Document{
		MimeType:   "image/webp",
		Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeSticker{Stickerset: &tg.InputStickerSetEmpty{}}},
	}
	if got := stickerSetRefOf(unclaimed); got != "" {
		t.Fatalf("unclaimed sticker set ref = %q", got)
	}
}

func TestPickerThumb(t *testing.T) {
	target := stickerThumbTargetPx
	cases := []struct {
		name      string
		thumbs    []tg.PhotoSizeClass
		wantType  string
		wantOK    bool
		wantBytes int
	}{
		{
			name: "prefers m over x",
			thumbs: []tg.PhotoSizeClass{
				&tg.PhotoSize{Type: "x", W: 800, H: 800, Size: 120000},
				&tg.PhotoSize{Type: "m", W: 128, H: 128, Size: 4000},
			},
			wantType: "m", wantOK: true, wantBytes: 4000,
		},
		{
			name:      "only x",
			thumbs:    []tg.PhotoSizeClass{&tg.PhotoSize{Type: "x", W: 800, H: 800, Size: 120000}},
			wantType:  "x",
			wantOK:    true,
			wantBytes: 120000,
		},
		{
			name:      "progressive converted",
			thumbs:    []tg.PhotoSizeClass{&tg.PhotoSizeProgressive{Type: "p", W: 320, H: 320, Sizes: []int{1000, 2000}}},
			wantType:  "p",
			wantOK:    true,
			wantBytes: 2000,
		},
		{
			name:   "empty size ignored",
			thumbs: []tg.PhotoSizeClass{&tg.PhotoSizeEmpty{Type: "s"}},
			wantOK: false,
		},
		{
			name: "smaller fallback",
			thumbs: []tg.PhotoSizeClass{
				&tg.PhotoSize{Type: "s", W: 60, H: 60, Size: 900},
				&tg.PhotoSize{Type: "", W: 100, H: 100, Size: 1500},
			},
			wantType: "s", wantOK: true, wantBytes: 900,
		},
		{
			name:   "no thumbs",
			thumbs: nil,
			wantOK: false,
		},
	}
	for _, testCase := range cases {
		doc := &tg.Document{ID: 1}
		if len(testCase.thumbs) > 0 {
			doc.SetThumbs(testCase.thumbs)
		}
		got, ok := pickerThumb(doc, target)
		if ok != testCase.wantOK {
			t.Fatalf("%s: ok = %v want %v", testCase.name, ok, testCase.wantOK)
		}
		if !ok {
			continue
		}
		if got.Type != testCase.wantType || got.Size != testCase.wantBytes {
			t.Fatalf("%s: got type=%q size=%d want type=%q size=%d",
				testCase.name, got.Type, got.Size, testCase.wantType, testCase.wantBytes)
		}
	}
}

func TestStickerSetCoverMedia(t *testing.T) {
	cases := []struct {
		name     string
		thumb    tg.PhotoSizeClass
		wantKind string
		wantExt  string
	}{
		{"animated cover", &tg.PhotoSize{Type: "a", W: 100, H: 100, Size: 5000}, "tgs", ".tgs"},
		{"video cover", &tg.PhotoSize{Type: "v", W: 100, H: 100, Size: 6000}, "webm", ".webm"},
		{"static cover", &tg.PhotoSize{Type: "m", W: 100, H: 100, Size: 3000}, "static", ".webp"},
	}
	for _, testCase := range cases {
		set := &tg.StickerSet{
			ID:         42,
			AccessHash: 43,
			Thumbs:     []tg.PhotoSizeClass{testCase.thumb},
		}
		set.SetThumbDCID(2)
		set.SetThumbVersion(3)
		media, kind, ok := stickerSetCoverMedia(set)
		if !ok || kind != testCase.wantKind {
			t.Fatalf("%s: ok=%v kind=%q want %q", testCase.name, ok, kind, testCase.wantKind)
		}
		if !strings.HasSuffix(media.Name, testCase.wantExt) {
			t.Fatalf("%s: media name %q does not end with %q", testCase.name, media.Name, testCase.wantExt)
		}
		loc, ok := media.InputFileLoc.(*tg.InputStickerSetThumb)
		if !ok || loc.ThumbVersion != 3 {
			t.Fatalf("%s: unexpected location %#v", testCase.name, media.InputFileLoc)
		}
		if media.DC != 2 {
			t.Fatalf("%s: DC = %d", testCase.name, media.DC)
		}
	}

	if _, _, ok := stickerSetCoverMedia(&tg.StickerSet{ID: 1}); ok {
		t.Fatalf("set without thumbs must not produce a cover")
	}
	if _, _, ok := stickerSetCoverMedia(&tg.StickerSet{ID: 1, Thumbs: []tg.PhotoSizeClass{&tg.PhotoSizeEmpty{Type: "m"}}}); ok {
		t.Fatalf("empty thumb must not produce a cover")
	}
}

func TestStickerDocumentMediaNames(t *testing.T) {
	cases := []struct {
		name    string
		doc     *tg.Document
		kind    string
		wantExt string
	}{
		{"tgs", &tg.Document{ID: 1, Size: 100, MimeType: "application/x-tgsticker"}, "tgs", ".tgs"},
		{"webm", &tg.Document{ID: 2, Size: 100, MimeType: "video/webm"}, "webm", ".webm"},
		{"gif mp4", &tg.Document{ID: 3, Size: 100, MimeType: "video/mp4"}, "gif", ".mp4"},
		{"gif legacy", &tg.Document{ID: 4, Size: 100, MimeType: "image/gif"}, "gif", ".gif"},
		{"static webp", &tg.Document{ID: 5, Size: 100, MimeType: "image/webp"}, "static", ".webp"},
		{"static png", &tg.Document{ID: 6, Size: 100, MimeType: "image/png"}, "static", ".png"},
	}
	for _, testCase := range cases {
		media, ok := stickerDocumentMedia(testCase.doc, testCase.kind)
		if !ok {
			t.Fatalf("%s: no media", testCase.name)
		}
		if !strings.HasSuffix(media.Name, testCase.wantExt) {
			t.Fatalf("%s: name %q misses %q", testCase.name, media.Name, testCase.wantExt)
		}
		loc, ok := media.InputFileLoc.(*tg.InputDocumentFileLocation)
		if !ok || loc.ThumbSize != "" {
			t.Fatalf("%s: full document location should have an empty ThumbSize", testCase.name)
		}
	}
	if _, ok := stickerDocumentMedia(&tg.Document{ID: 1, Size: 100}, "tgs"); !ok {
		t.Fatalf("document without thumbs should still produce full media")
	}
}

func TestMapStickerDocDTO(t *testing.T) {
	service := newStickerTestService()
	doc := stickerFixture()
	item, ok := service.mapStickerDoc(
		doc,
		stickerRefKindSticker,
		stickerRefSourceRecent,
		"",
		stickerThumbTargetPx,
		"proxy",
		"ntp",
	)
	if !ok {
		t.Fatalf("mapStickerDoc rejected a valid sticker")
	}
	if item.Kind != "static" || item.Emoji != "😀" {
		t.Fatalf("unexpected kind/emoji: %+v", item)
	}
	if item.W != 512 || item.H != 512 || item.SizeBytes != 1234 {
		t.Fatalf("unexpected dimensions/size: %+v", item)
	}
	if !strings.Contains(item.ThumbURL, "/thumb/") || !strings.Contains(item.PhotoURL, "/photo/") {
		t.Fatalf("static sticker should carry thumb+photo urls: %+v", item)
	}
	if item.StreamURL != "" {
		t.Fatalf("static sticker must not expose a stream URL: %+v", item)
	}
	if item.SetID != encodeStickerSetRef(42, 43) {
		t.Fatalf("setId = %q", item.SetID)
	}
	decoded, err := decodeStickerDocRef(item.Ref)
	if err != nil || decoded.ID != doc.ID || decoded.Kind != stickerRefKindSticker || decoded.Source != stickerRefSourceRecent {
		t.Fatalf("bad ref %q (%+v, %v)", item.Ref, decoded, err)
	}
	if service.stickerDocByRef(item.Ref) != doc {
		t.Fatalf("document ref was not stored in the side map")
	}

	customEmoji := &tg.Document{
		ID:         9,
		MimeType:   "application/x-tgsticker",
		Attributes: []tg.DocumentAttributeClass{&tg.DocumentAttributeCustomEmoji{Alt: "😀"}},
	}
	if _, ok := service.mapStickerDoc(customEmoji, stickerRefKindSticker, stickerRefSourceRecent, "", 100, "", ""); ok {
		t.Fatalf("custom emoji must not map to a sticker")
	}
	if _, ok := service.mapStickerDoc(doc, stickerRefKindGif, stickerRefSourceGif, "", 100, "", ""); ok {
		t.Fatalf("sticker must not map to a gif")
	}
}

func TestMapGifDocDTO(t *testing.T) {
	service := newStickerTestService()
	item, ok := service.mapGifDoc(gifFixture(), "proxy", "ntp")
	if !ok {
		t.Fatalf("mapGifDoc rejected a valid gif")
	}
	if item.Mime != "video/mp4" || item.Duration != 2.5 || item.W != 320 || item.H != 240 {
		t.Fatalf("unexpected gif dto: %+v", item)
	}
	if !strings.Contains(item.ThumbURL, "/thumb/") || !strings.Contains(item.StreamURL, "/photo/") {
		t.Fatalf("gif should carry thumb+stream urls: %+v", item)
	}
	decoded, err := decodeStickerDocRef(item.Ref)
	if err != nil || decoded.Kind != stickerRefKindGif || decoded.Source != stickerRefSourceGif {
		t.Fatalf("bad gif ref %q (%+v, %v)", item.Ref, decoded, err)
	}
}

func TestMapStickerSetHeaderDTO(t *testing.T) {
	set := &tg.StickerSet{
		ID:         55,
		AccessHash: 66,
		Title:      "Cats",
		ShortName:  "cats",
		Count:      12,
		Official:   true,
		Archived:   true,
	}
	header := mapStickerSetHeader(set, "http://cover", "static")
	if header.Title != "Cats" || header.ShortName != "cats" || header.Count != 12 || !header.Official || !header.Archived {
		t.Fatalf("unexpected header: %+v", header)
	}
	if header.CoverURL != "http://cover" || header.CoverKind != "static" {
		t.Fatalf("cover mismatch: %+v", header)
	}
	id, accessHash, err := decodeStickerSetRef(header.Ref)
	if err != nil || id != 55 || accessHash != 66 {
		t.Fatalf("set ref %q does not decode: (%d,%d,%v)", header.Ref, id, accessHash, err)
	}
}

func TestStickerCachesAndInvalidation(t *testing.T) {
	service := newStickerTestService()
	setRef := encodeStickerSetRef(1, 2)

	service.storeStickerSets([]StickerSetDTO{{Ref: setRef, Title: "x"}})
	if sets, ok := service.cachedStickerSets(); !ok || len(sets) != 1 {
		t.Fatalf("sticker set cache not hit")
	}
	service.invalidateStickerSetsCache()
	if _, ok := service.cachedStickerSets(); ok {
		t.Fatalf("sticker set cache survived invalidation")
	}

	service.storeRecentStickers([]StickerDocDTO{{Ref: "r"}})
	if recent, ok := service.cachedRecentStickers(); !ok || len(recent) != 1 {
		t.Fatalf("recent cache not hit")
	}
	service.invalidateRecentStickersCache()
	if _, ok := service.cachedRecentStickers(); ok {
		t.Fatalf("recent cache survived invalidation")
	}

	service.storeSavedGifs([]GifDTO{{Ref: "g"}})
	if gifs, ok := service.cachedSavedGifs(); !ok || len(gifs) != 1 {
		t.Fatalf("gifs cache not hit")
	}
	service.invalidateSavedGifsCache()
	if _, ok := service.cachedSavedGifs(); ok {
		t.Fatalf("gifs cache survived invalidation")
	}

	service.storeStickerSet(setRef, &StickerSetDetailDTO{Set: StickerSetDTO{Ref: setRef}, Stickers: []StickerDocDTO{{Ref: "s"}}})
	if detail, ok := service.cachedStickerSet(setRef); !ok || len(detail.Stickers) != 1 {
		t.Fatalf("sticker set detail cache not hit")
	}
	service.invalidateStickerSetsCache()
	if _, ok := service.cachedStickerSet(setRef); ok {
		t.Fatalf("sticker set detail cache survived invalidation")
	}

	service.storeStickerDocRef("ref", stickerFixture())
	if service.stickerDocByRef("ref") == nil {
		t.Fatalf("document ref store broken")
	}
	service.invalidateStickerCaches()
	if service.stickerDocByRef("ref") != nil {
		t.Fatalf("document refs survived session cache reset")
	}
}

func TestStickerRefSideMapBound(t *testing.T) {
	service := newStickerTestService()
	service.storeStickerDocRef("first", &tg.Document{ID: 1})
	for index := 0; index < stickerRefStoreLimit; index++ {
		service.storeStickerDocRef(
			encodeStickerDocRef(stickerDocRef{
				ID:     int64(index + 2),
				Kind:   stickerRefKindSticker,
				Source: stickerRefSourceRecent,
			}),
			&tg.Document{ID: int64(index + 2)},
		)
	}
	if service.stickerDocByRef("first") != nil {
		t.Fatalf("oldest document ref was not evicted")
	}
	if len(service.stickerRefs) > stickerRefStoreLimit {
		t.Fatalf("side map grew beyond its bound: %d", len(service.stickerRefs))
	}
}
