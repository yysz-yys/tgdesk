package kernel

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
)

// testAnimatedEmojiDocument builds one document shaped like the animated-emoji
// sticker set returns them: an application/x-tgsticker TGS document whose
// sticker attribute Alt is the emoji (variation selector included, as Telegram
// sometimes sends it).
func testAnimatedEmojiDocument(id int64, alt string) *tg.Document {
	return &tg.Document{
		ID:            id,
		AccessHash:    id + 5000,
		FileReference: []byte{0xde, 0xad, 0xbe, 0xef},
		MimeType:      "application/x-tgsticker",
		Size:          4096,
		DCID:          1,
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeSticker{Alt: alt},
			&tg.DocumentAttributeImageSize{W: 512, H: 512},
			&tg.DocumentAttributeFilename{FileName: "AnimatedSticker.tgs"},
		},
	}
}

// seedAnimatedEmojiDocs installs a pre-built emoticon->document map so tests
// exercise the lookup/registration path without any network call.
func seedAnimatedEmojiDocs(service *Service, documents map[string]*tg.Document) {
	service.animatedEmojiMu.Lock()
	service.animatedEmojiDocs = documents
	service.animatedEmojiMu.Unlock()
}

func TestBuildAnimatedEmojiDocumentsPackAndAlt(t *testing.T) {
	chick := testAnimatedEmojiDocument(101, "🐥")
	firstChick := testAnimatedEmojiDocument(102, "🐥")
	// The snowman pack key omits U+FE0F while the Alt carries it.
	snowman := testAnimatedEmojiDocument(103, "⛄️")
	// Alt-only document: the set has no pack entry for the diamond.
	diamond := testAnimatedEmojiDocument(104, "💎")
	// A document without a sticker attribute (and no pack) stays unindexed.
	unattributed := &tg.Document{
		ID:         105,
		AccessHash: 5105,
		MimeType:   "application/x-tgsticker",
		Size:       4096,
		DCID:       1,
	}

	packs := []tg.StickerPack{
		// The first document of the pack wins, even when the pack lists more.
		{Emoticon: "🐥", Documents: []int64{chick.ID, firstChick.ID}},
		// A duplicate pack for the same emoticon is ignored.
		{Emoticon: "🐥", Documents: []int64{firstChick.ID}},
		{Emoticon: "⛄", Documents: []int64{snowman.ID}},
		// Pack entries pointing at a document missing from the set are skipped.
		{Emoticon: "🌷", Documents: []int64{999999}},
		// Empty emoticons/packs are ignored.
		{Emoticon: "", Documents: []int64{chick.ID}},
		{Emoticon: "🎮"},
	}
	documents := buildAnimatedEmojiDocuments(
		packs,
		[]tg.DocumentClass{chick, firstChick, snowman, diamond, unattributed},
	)

	// Pack keys plus the Alt-only keys (🐥 and ⛄ Alt duplicates collapse).
	if len(documents) != 4 {
		t.Fatalf("documents = %d entries (%v), want 4", len(documents), animatedEmojiKeys(documents))
	}
	if got := documents["🐥"]; got != chick {
		t.Fatalf("chick = %#v, want the first document of the pack", got)
	}
	if got := documents["⛄"]; got != snowman {
		t.Fatalf("snowman pack key = %#v", got)
	}
	if got := documents["⛄️"]; got != snowman {
		t.Fatalf("snowman Alt key = %#v", got)
	}
	if got := documents["💎"]; got != diamond {
		t.Fatalf("diamond Alt key = %#v", got)
	}
	if _, ok := documents["🌷"]; ok {
		t.Fatal("pack with a missing document must not be indexed")
	}
	for _, document := range documents {
		if document == unattributed {
			t.Fatal("a document without a pack/Alt key must not be indexed")
		}
	}
}

func animatedEmojiKeys(documents map[string]*tg.Document) []string {
	keys := make([]string, 0, len(documents))
	for key := range documents {
		keys = append(keys, key)
	}
	return keys
}

func TestLookupAnimatedEmojiVariationSelector(t *testing.T) {
	chick := testAnimatedEmojiDocument(201, "🐥")
	snowman := testAnimatedEmojiDocument(202, "⛄️")
	teacher := testAnimatedEmojiDocument(203, "👨‍🏫")
	house := testAnimatedEmojiDocument(204, "🏠")

	documents := map[string]*tg.Document{
		"🐥":   chick,
		"⛄":   snowman,
		"⛄️":  snowman,
		"👨‍🏫": teacher,
		"🏠":   house,
	}
	cases := []struct {
		emoticon string
		want     *tg.Document
	}{
		{"🐥", chick},
		{"⛄", snowman},   // exact pack key
		{"⛄️", snowman},  // U+FE0F on the request side
		{"👨‍🏫", teacher}, // ZWJ sequence stays one emoticon
		{"🏠️", house},    // request with VS16, map key without
		{"🦄", nil},
	}
	for _, testCase := range cases {
		if got := lookupAnimatedEmoji(documents, testCase.emoticon); got != testCase.want {
			t.Fatalf("lookup %q = %#v, want %#v", testCase.emoticon, got, testCase.want)
		}
	}

	// The reverse variation-selector direction also works: the only key carries
	// U+FE0F while the request does not.
	altOnly := map[string]*tg.Document{"⛄️": snowman}
	if got := lookupAnimatedEmoji(altOnly, "⛄"); got != snowman {
		t.Fatalf("lookup without VS16 = %#v, want snowman", got)
	}

	// Stripping only removes U+FE0F: the ZWJ sequence is preserved, and a plain
	// "man" request must not collapse into the teacher sequence.
	if got := stripAnimatedEmojiVS16("👨‍🏫"); got != "👨‍🏫" {
		t.Fatalf("ZWJ sequence changed to %q", got)
	}
	man := testAnimatedEmojiDocument(205, "👨")
	if got := lookupAnimatedEmoji(map[string]*tg.Document{"👨": man}, "👨‍🏫"); got != nil {
		t.Fatalf("teacher lookup matched %#v", got)
	}
}

func TestGetAnimatedEmojiStickersOfflineLookup(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()
	chick := testAnimatedEmojiDocument(301, "🐥")
	snowman := testAnimatedEmojiDocument(302, "⛄️")
	seedAnimatedEmojiDocs(service, map[string]*tg.Document{
		"🐥": chick,
		"⛄": snowman,
	})

	items, err := service.GetAnimatedEmojiStickers("", "", []string{
		"🐥",
		"🦄",   // not in the set: DTO with an empty URL
		"🐥",   // duplicate
		" ⛄ ", // trimmed, matched through the VS16 fallback
		"",
	})
	if err != nil {
		t.Fatalf("get animated emoji stickers: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("items = %#v, want 3", items)
	}
	if items[0].Emoticon != "🐥" || items[0].URL == "" {
		t.Fatalf("chick = %#v", items[0])
	}
	if items[1].Emoticon != "🦄" || items[1].URL != "" {
		t.Fatalf("missing emoticon DTO = %#v, want an empty URL", items[1])
	}
	if items[2].Emoticon != "⛄" || items[2].URL == "" {
		t.Fatalf("snowman = %#v", items[2])
	}
	for _, item := range items {
		if item.URL == "" {
			continue
		}
		if !strings.HasPrefix(item.URL, "http://127.0.0.1:") || !strings.Contains(item.URL, "/emoji/") {
			t.Fatalf("emoji URL = %q, want a loopback /emoji/ URL", item.URL)
		}
	}

	// Laziness: resolving the stickers registers refs and returns URLs but must
	// not download a single byte (the decoded cache stays untouched).
	service.images.mu.Lock()
	defer service.images.mu.Unlock()
	for key := range service.images.entries {
		if strings.HasPrefix(key, "emoji:") {
			t.Fatalf("GetAnimatedEmojiStickers downloaded sticker bytes (%q)", key)
		}
	}
}

func TestGetAnimatedEmojiStickersDedupeCapOrder(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()
	// An empty (but loaded) map keeps the call offline.
	seedAnimatedEmojiDocs(service, map[string]*tg.Document{})

	emoticons := make([]string, 0, 60)
	for index := 0; index < 40; index++ {
		emoticons = append(emoticons, fmt.Sprintf("e%02d", index))
	}
	// Interleave duplicates that must be dropped before the cap is applied.
	for index := 0; index < 40; index += 2 {
		emoticons = append(emoticons, fmt.Sprintf("e%02d", index))
	}

	items, err := service.GetAnimatedEmojiStickers("", "", emoticons)
	if err != nil {
		t.Fatalf("get animated emoji stickers: %v", err)
	}
	if len(items) != animatedEmojiMax {
		t.Fatalf("items = %d, want cap %d", len(items), animatedEmojiMax)
	}
	for index, item := range items {
		want := fmt.Sprintf("e%02d", index)
		if item.Emoticon != want {
			t.Fatalf("items[%d] = %q, want %q", index, item.Emoticon, want)
		}
	}

	empty, err := service.GetAnimatedEmojiStickers("", "", nil)
	if err != nil {
		t.Fatalf("empty request: %v", err)
	}
	if len(empty) != 0 || empty == nil {
		t.Fatalf("empty request = %#v, want a non-nil empty slice", empty)
	}
}

func TestRegisterAnimatedEmojiDocument(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	if id := service.registerAnimatedEmojiDocument(nil, "", ""); id != "" {
		t.Fatalf("nil document ref = %q, want empty", id)
	}
	if id := service.registerAnimatedEmojiDocument(&tg.Document{}, "", ""); id != "" {
		t.Fatalf("document without id/size ref = %q, want empty", id)
	}
	if url := service.emojiURL(""); url != "" {
		t.Fatalf("empty ref URL = %q, want empty", url)
	}

	document := testAnimatedEmojiDocument(401, "🏠")
	id := service.registerAnimatedEmojiDocument(document, "http://proxy", "ntp")
	if id == "" {
		t.Fatal("emoji ref is empty")
	}
	if again := service.registerAnimatedEmojiDocument(document, "http://proxy", "ntp"); again != id {
		t.Fatalf("emoji ref not stable: %q vs %q", id, again)
	}

	url := service.emojiURL(id)
	if !strings.HasPrefix(url, "http://127.0.0.1:") || !strings.Contains(url, "/emoji/") || !strings.HasSuffix(url, "/"+id) {
		t.Fatalf("emoji URL = %q", url)
	}

	ref := service.emojiRefs.get(id)
	if ref == nil {
		t.Fatal("registered emoji ref not found")
	}
	if ref.mime != "application/x-tgsticker" || ref.proxy != "http://proxy" || ref.ntp != "ntp" {
		t.Fatalf("emoji ref = %#v", ref)
	}
	if ref.media == nil || ref.media.Name != "AnimatedSticker.tgs" || ref.media.Size != document.Size || ref.media.DC != document.DCID {
		t.Fatalf("emoji media = %#v", ref.media)
	}
	location, ok := ref.media.InputFileLoc.(*tg.InputDocumentFileLocation)
	if !ok || location.ID != document.ID || location.AccessHash != document.AccessHash || location.ThumbSize != "" {
		t.Fatalf("emoji file location = %#v", ref.media.InputFileLoc)
	}
}

// TestServeAnimatedEmojiCachedJSON drives the /emoji/ handler with a fake
// registered imageRef and a pre-seeded decoded cache so the JSON response path
// is exercised without any network (fetchPatternDocument must not run).
func TestServeAnimatedEmojiCachedJSON(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	document := testAnimatedEmojiDocument(501, "🐥")
	id := service.emojiRefs.put(&imageRef{
		media: &tmedia.Media{
			InputFileLoc: &tg.InputDocumentFileLocation{
				ID:            document.ID,
				AccessHash:    document.AccessHash,
				FileReference: document.FileReference,
				ThumbSize:     "",
			},
			Name: "AnimatedSticker.tgs",
			Size: document.Size,
			DC:   document.DCID,
		},
		mime: "application/x-tgsticker",
	})
	if id == "" {
		t.Fatal("emoji ref is empty")
	}
	payload := []byte(`{"tgs":1,"v":"5.5.2","fr":60,"ip":0,"op":60,"w":512,"h":512,"layers":[]}`)
	service.images.put("emoji:"+id, payload, animatedEmojiMIME, 0)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/emoji/token/"+id, nil)
	service.serveAnimatedEmoji(id, recorder, request)
	response := recorder.Result()
	defer func() {
		_ = response.Body.Close()
	}()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
	if got := response.Header.Get("Content-Type"); got != animatedEmojiMIME {
		t.Fatalf("Content-Type = %q, want %q", got, animatedEmojiMIME)
	}
	if got := response.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("CORS = %q, want *", got)
	}
	if got := response.Header.Get("Cache-Control"); got != "private, max-age=604800, immutable" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := response.Header.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("nosniff = %q", got)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, payload) {
		t.Fatalf("body = %q, want the cached Lottie JSON", body)
	}

	// Unknown refs are 404 and never touch the network.
	recorder = httptest.NewRecorder()
	service.serveAnimatedEmoji("unknown", recorder, httptest.NewRequest(http.MethodGet, "/emoji/token/unknown", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unknown ref status = %d, want 404", recorder.Code)
	}
}

// TestAnimatedEmojiRouteServesCachedDocument checks the media-server wiring for
// the /emoji/ prefix end to end. The document bytes are pre-seeded, so the
// loopback request is answered from the cache without touching Telegram.
func TestAnimatedEmojiRouteServesCachedDocument(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	document := testAnimatedEmojiDocument(601, "⛄")
	id := service.registerAnimatedEmojiDocument(document, "", "")
	payload := []byte(`{"tgs":1,"layers":[]}`)
	service.images.put("emoji:"+id, payload, animatedEmojiMIME, 0)

	url := service.emojiURL(id)
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = response.Body.Close()
	}()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}
	if got := response.Header.Get("Content-Type"); got != animatedEmojiMIME {
		t.Fatalf("Content-Type = %q, want %q", got, animatedEmojiMIME)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, payload) {
		t.Fatalf("body = %q", body)
	}

	unknown, err := http.Get(service.emojiBase + "deadbeef")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = unknown.Body.Close()
	}()
	if unknown.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown ref status = %d, want 404", unknown.StatusCode)
	}
}

// TestAnimatedEmojiDTOJSONShape pins the JSON contract the Web K frontend
// consumes: {"emoticon":...,"url":...} with the url omitted when unknown.
func TestAnimatedEmojiDTOJSONShape(t *testing.T) {
	found, err := json.Marshal(AnimatedEmojiDTO{
		Emoticon: "🐥",
		URL:      "http://127.0.0.1:1234/emoji/token/abc",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"emoticon":"🐥","url":"http://127.0.0.1:1234/emoji/token/abc"}`
	if string(found) != want {
		t.Fatalf("found DTO JSON = %s, want %s", found, want)
	}

	missing, err := json.Marshal(AnimatedEmojiDTO{Emoticon: "🦄"})
	if err != nil {
		t.Fatal(err)
	}
	if string(missing) != `{"emoticon":"🦄"}` {
		t.Fatalf("missing DTO JSON = %s, want url omitted", missing)
	}
}
