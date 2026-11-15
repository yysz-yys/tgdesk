package kernel

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/gotd/td/tg"
)

// testGlobalChatTheme builds one theme shaped like the ones account.getChatThemes
// returns: a tinted (night) variant followed by a classic (day) variant.
func testGlobalChatTheme() tg.Theme {
	return tg.Theme{
		ID:         1001,
		AccessHash: 55,
		Slug:       "chicken",
		Title:      "🐥 Chat Theme",
		Emoticon:   "🐥",
		Settings: []tg.ThemeSettings{
			{
				BaseTheme:         &tg.BaseThemeTinted{},
				AccentColor:       0x11aabb,
				OutboxAccentColor: 0x223344,
				MessageColors:     []int{0x010101},
				Wallpaper: &tg.WallPaper{
					ID:   77,
					Slug: "chicken-night",
					Settings: tg.WallPaperSettings{
						BackgroundColor: 0x111111,
						Intensity:       -45,
						Emoticon:        "🌙",
						Blur:            true,
					},
					Document: &tg.Document{
						ID:         5001,
						AccessHash: 6001,
						Size:       3000,
						DCID:       2,
						MimeType:   "application/x-tgwallpattern",
					},
				},
			},
			{
				BaseTheme:         &tg.BaseThemeClassic{},
				AccentColor:       0xffaa00,
				OutboxAccentColor: 0xffbb00,
				MessageColors:     []int{0x112233, 0x445566},
				Wallpaper: &tg.WallPaperNoFile{
					ID: 88,
					Settings: tg.WallPaperSettings{
						BackgroundColor:       0x222222,
						SecondBackgroundColor: 0x333333,
						Intensity:             45,
						Emoticon:              "☀️",
					},
				},
			},
		},
	}
}

func TestMapChatThemesGlobalVariants(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	themes := service.mapChatThemes([]tg.Theme{testGlobalChatTheme()}, "", "")
	if len(themes) != 1 {
		t.Fatalf("themes = %d, want 1", len(themes))
	}
	item := themes[0]
	if item.ID != 1001 || item.AccessHash != 55 || item.Slug != "chicken" {
		t.Fatalf("identity = %#v", item)
	}
	if item.Title != "🐥 Chat Theme" || item.Emoticon != "🐥" {
		t.Fatalf("title/emoticon = %q/%q", item.Title, item.Emoticon)
	}
	if len(item.Settings) != 2 {
		t.Fatalf("settings = %d, want 2", len(item.Settings))
	}

	night := item.Settings[0]
	if night.BaseTheme != "tinted" || !night.Dark {
		t.Fatalf("night variant = %#v", night)
	}
	if night.Accent != 0x11aabb || night.OutboxAccent != 0x223344 {
		t.Fatalf("night accents = %#x/%#x", night.Accent, night.OutboxAccent)
	}
	if len(night.MessageColors) != 1 || night.MessageColors[0] != 0x010101 {
		t.Fatalf("night message colors = %v", night.MessageColors)
	}
	if night.Wallpaper == nil {
		t.Fatal("night wallpaper missing")
	}
	if !night.Wallpaper.Dark || !night.Wallpaper.Pattern {
		t.Fatalf("night wallpaper flags = %#v", night.Wallpaper)
	}
	if night.Wallpaper.Intensity != -45 {
		t.Fatalf("night intensity = %d, want -45", night.Wallpaper.Intensity)
	}
	if len(night.Wallpaper.Colors) != 1 || night.Wallpaper.Colors[0] != 0x111111 {
		t.Fatalf("night wallpaper colors = %v", night.Wallpaper.Colors)
	}
	if night.Wallpaper.Emoticon != "🌙" || !night.Wallpaper.Blur {
		t.Fatalf("night wallpaper decor = %#v", night.Wallpaper)
	}
	if night.Wallpaper.PatternURL == "" ||
		!strings.HasPrefix(night.Wallpaper.PatternURL, "http://127.0.0.1:") ||
		!strings.Contains(night.Wallpaper.PatternURL, "/pattern/") {
		t.Fatalf("night pattern URL = %q", night.Wallpaper.PatternURL)
	}

	day := item.Settings[1]
	if day.BaseTheme != "classic" || day.Dark {
		t.Fatalf("day variant = %#v", day)
	}
	if day.Accent != 0xffaa00 || day.OutboxAccent != 0xffbb00 {
		t.Fatalf("day accents = %#x/%#x", day.Accent, day.OutboxAccent)
	}
	if len(day.MessageColors) != 2 || day.MessageColors[0] != 0x112233 || day.MessageColors[1] != 0x445566 {
		t.Fatalf("day message colors = %v", day.MessageColors)
	}
	if day.Wallpaper == nil || day.Wallpaper.PatternURL != "" {
		t.Fatalf("day wallpaper = %#v", day.Wallpaper)
	}
	if day.Wallpaper.Intensity != 45 || day.Wallpaper.Dark {
		t.Fatalf("day wallpaper intensity/dark = %#v", day.Wallpaper)
	}
	if len(day.Wallpaper.Colors) != 2 || day.Wallpaper.Colors[0] != 0x222222 || day.Wallpaper.Colors[1] != 0x333333 {
		t.Fatalf("day wallpaper colors = %v", day.Wallpaper.Colors)
	}

	// The legacy single-variant fields mirror the classic (day) palette even
	// though it was not the first settings entry.
	if item.BaseTheme != "classic" || item.Accent != 0xffaa00 || item.OutboxAccent != 0xffbb00 {
		t.Fatalf("legacy variant = %#v", item)
	}
	if len(item.MessageColors) != 2 || item.MessageColors[0] != 0x112233 {
		t.Fatalf("legacy message colors = %v", item.MessageColors)
	}
	if item.Wallpaper == nil || item.Wallpaper.Intensity != 45 {
		t.Fatalf("legacy wallpaper = %#v", item.Wallpaper)
	}
}

func TestMapChatThemesLegacyFieldsFallBackToFirstVariant(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	theme := tg.Theme{
		ID:    7,
		Title: "Only Night",
		Settings: []tg.ThemeSettings{{
			BaseTheme:     &tg.BaseThemeTinted{},
			AccentColor:   0xabcdef,
			MessageColors: []int{0x102030},
		}},
	}
	themes := service.mapChatThemes([]tg.Theme{theme}, "", "")
	if len(themes) != 1 || len(themes[0].Settings) != 1 {
		t.Fatalf("themes = %#v", themes)
	}
	item := themes[0]
	if item.BaseTheme != "tinted" || item.Accent != 0xabcdef {
		t.Fatalf("legacy fields = %#v", item)
	}
	if len(item.MessageColors) != 1 || item.MessageColors[0] != 0x102030 {
		t.Fatalf("legacy message colors = %v", item.MessageColors)
	}
	if item.Wallpaper != nil {
		t.Fatalf("wallpaper = %#v, want nil", item.Wallpaper)
	}
}

func TestPickThemeSettingsPrefersDayThenClassic(t *testing.T) {
	tinted := tg.ThemeSettings{BaseTheme: &tg.BaseThemeTinted{}}
	classic := tg.ThemeSettings{BaseTheme: &tg.BaseThemeClassic{}}
	day := tg.ThemeSettings{BaseTheme: &tg.BaseThemeDay{}}
	night := tg.ThemeSettings{BaseTheme: &tg.BaseThemeNight{}}

	if got := baseThemeName(pickThemeSettings([]tg.ThemeSettings{tinted, classic, day}).BaseTheme); got != "day" {
		t.Fatalf("preferred base = %q, want day", got)
	}
	if got := baseThemeName(pickThemeSettings([]tg.ThemeSettings{tinted, classic}).BaseTheme); got != "classic" {
		t.Fatalf("fallback base = %q, want classic", got)
	}
	if got := baseThemeName(pickThemeSettings([]tg.ThemeSettings{tinted}).BaseTheme); got != "tinted" {
		t.Fatalf("first-variant base = %q, want tinted", got)
	}
	if got := baseThemeName(pickThemeSettings([]tg.ThemeSettings{night, tinted}).BaseTheme); got != "night" {
		t.Fatalf("first-variant base = %q, want night", got)
	}
	if pickThemeSettings(nil) != nil {
		t.Fatal("nil settings should stay nil")
	}
}

func TestDecodePatternDocument(t *testing.T) {
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>`)

	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(svg); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(compressed.Bytes(), []byte{0x1f, 0x8b}) {
		t.Fatalf("test fixture is not gzip: % x", compressed.Bytes()[:2])
	}

	decoded, err := decodePatternDocument(compressed.Bytes())
	if err != nil {
		t.Fatalf("decode gzip: %v", err)
	}
	if !bytes.Equal(decoded, svg) {
		t.Fatalf("decoded = %q, want %q", decoded, svg)
	}

	plain, err := decodePatternDocument(svg)
	if err != nil {
		t.Fatalf("decode plain: %v", err)
	}
	if !bytes.Equal(plain, svg) {
		t.Fatalf("plain = %q, want unchanged", plain)
	}

	if _, err := decodePatternDocument([]byte{0x1f, 0x8b, 0x00}); err == nil {
		t.Fatal("corrupt gzip should fail")
	}
}

func TestPatternRouteRejectsUnknownRefs(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	if url := service.patternURL(""); url != "" {
		t.Fatalf("empty ref URL = %q, want empty", url)
	}
	url := service.patternURL("deadbeef")
	if !strings.HasPrefix(url, "http://127.0.0.1:") || !strings.Contains(url, "/pattern/") {
		t.Fatalf("pattern URL = %q", url)
	}
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = response.Body.Close()
	}()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.StatusCode)
	}
}

func TestRegisterPatternDocumentRefsAreStable(t *testing.T) {
	t.Setenv("TGDESK_HOME", t.TempDir())
	service := New()

	if id := service.registerPatternDocument(nil, "", ""); id != "" {
		t.Fatalf("nil document ref = %q, want empty", id)
	}
	document := &tg.Document{
		ID:         9001,
		AccessHash: 9002,
		Size:       1234,
		DCID:       2,
		MimeType:   "application/x-tgwallpattern",
		Attributes: []tg.DocumentAttributeClass{
			&tg.DocumentAttributeFilename{FileName: "pattern.svg"},
		},
	}
	id := service.registerPatternDocument(document, "", "")
	if id == "" {
		t.Fatal("pattern ref is empty")
	}
	if again := service.registerPatternDocument(document, "", ""); again != id {
		t.Fatalf("pattern ref not stable: %q vs %q", id, again)
	}
	url := service.patternURL(id)
	if !strings.HasSuffix(url, "/"+id) {
		t.Fatalf("pattern URL = %q, want suffix /%s", url, id)
	}
}

// TestChatThemeDTOJSONShape pins the JSON contract the Web K frontend consumes.
func TestChatThemeDTOJSONShape(t *testing.T) {
	dto := ChatThemeDTO{
		ID:    7,
		Title: "🐥 Chat Theme",
		Settings: []ThemeSettingsDTO{{
			BaseTheme:     "tinted",
			Dark:          true,
			Accent:        5,
			MessageColors: []int{1, 2},
			Wallpaper: &ThemeWallpaperDTO{
				Colors:     []int{3},
				Intensity:  -1,
				Pattern:    true,
				Dark:       true,
				PatternURL: "http://127.0.0.1:1/pattern/token/ref",
			},
		}},
	}
	data, err := json.Marshal(dto)
	if err != nil {
		t.Fatal(err)
	}
	var generic map[string]any
	if err := json.Unmarshal(data, &generic); err != nil {
		t.Fatal(err)
	}
	settings, ok := generic["settings"].([]any)
	if !ok || len(settings) != 1 {
		t.Fatalf("settings JSON = %#v", generic["settings"])
	}
	variant, ok := settings[0].(map[string]any)
	if !ok {
		t.Fatalf("variant JSON = %#v", settings[0])
	}
	if variant["baseTheme"] != "tinted" || variant["dark"] != true || variant["accent"] != float64(5) {
		t.Fatalf("variant JSON = %#v", variant)
	}
	wallpaper, ok := variant["wallpaper"].(map[string]any)
	if !ok {
		t.Fatalf("wallpaper JSON = %#v", variant["wallpaper"])
	}
	if wallpaper["dark"] != true || wallpaper["patternUrl"] != "http://127.0.0.1:1/pattern/token/ref" {
		t.Fatalf("wallpaper JSON = %#v", wallpaper)
	}

	// Omitted keys must stay absent for a light palette without a wallpaper.
	plain, err := json.Marshal(ThemeSettingsDTO{BaseTheme: "classic"})
	if err != nil {
		t.Fatal(err)
	}
	var genericPlain map[string]any
	if err := json.Unmarshal(plain, &genericPlain); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"dark", "accent", "outboxAccent", "messageColors", "wallpaper"} {
		if _, exists := genericPlain[key]; exists {
			t.Fatalf("unexpected %q in %s", key, plain)
		}
	}
}
