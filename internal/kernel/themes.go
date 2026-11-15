package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// ThemeWallpaperDTO is the wallpaper part of a cloud theme: the gradient colours
// Telegram paints the empty canvas with, and the doodle pattern document that is
// tiled over it (the same receipt telegram web uses).
type ThemeWallpaperDTO struct {
	ID        int64  `json:"id,omitempty"`
	Slug      string `json:"slug,omitempty"`
	Colors    []int  `json:"colors,omitempty"`
	Intensity int    `json:"intensity,omitempty"`
	Pattern   bool   `json:"pattern,omitempty"`
	Emoticon  string `json:"emoticon,omitempty"`
	Blur      bool   `json:"blur,omitempty"`
	// Dark marks the wallpaper belonging to the night/tinted variant of a chat
	// theme. Telegram ships one wallpaper per variant and the sign of Intensity
	// already tells the two apart; the flag saves the UI from inferring it.
	Dark bool `json:"dark,omitempty"`
	// PatternURL is the loopback HTTP URL of the pattern SVG (empty when the
	// wallpaper has no pattern document). The bytes behind it are fetched and
	// gunzipped lazily on the first request.
	PatternURL string `json:"patternUrl,omitempty"`
}

// ThemeSettingsDTO is one palette variant of a chat theme. Telegram's global
// chat themes carry two: a day (classic) and a night (tinted) variant, which is
// exactly the pair Web K renders in the Appearance theme strip.
type ThemeSettingsDTO struct {
	// BaseTheme is one of "classic", "day", "night" or "tinted".
	BaseTheme string `json:"baseTheme"`
	// Dark is true for the night/tinted variant.
	Dark          bool               `json:"dark,omitempty"`
	Accent        int                `json:"accent,omitempty"`
	OutboxAccent  int                `json:"outboxAccent,omitempty"`
	MessageColors []int              `json:"messageColors,omitempty"`
	Wallpaper     *ThemeWallpaperDTO `json:"wallpaper,omitempty"`
}

// ChatThemeDTO is one entry of the global chat theme list
// (account.getChatThemes), the data behind Web K's Appearance previews:
// slug/title/emoticon, every palette variant, and the wallpapers the chat
// canvas paints.
type ChatThemeDTO struct {
	ID         int64  `json:"id"`
	AccessHash int64  `json:"accessHash,omitempty"`
	Slug       string `json:"slug,omitempty"`
	Title      string `json:"title"`
	Emoticon   string `json:"emoticon,omitempty"`
	// The following single-variant fields keep working for callers that predate
	// Settings: they mirror the day (classic) variant, else the first variant.
	BaseTheme     string             `json:"baseTheme,omitempty"`
	Accent        int                `json:"accent,omitempty"`
	OutboxAccent  int                `json:"outboxAccent,omitempty"`
	MessageColors []int              `json:"messageColors,omitempty"`
	Wallpaper     *ThemeWallpaperDTO `json:"wallpaper,omitempty"`
	// Settings holds every palette variant in server order.
	Settings []ThemeSettingsDTO `json:"settings,omitempty"`
}

// GetChatThemes returns the available global chat themes (the Web K Appearance
// theme strip). It asks account.getChatThemes first; when that method errors or
// comes back empty the account.getThemes cloud list is used instead so the UI
// still has themes to show.
func (s *Service) GetChatThemes(proxy, ntp string) ([]ChatThemeDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result []ChatThemeDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		themes, globalErr := fetchGlobalChatThemes(ctx, client)
		if globalErr != nil || len(themes) == 0 {
			fallback, fallbackErr := fetchAccountThemes(ctx, client)
			if fallbackErr != nil {
				if globalErr != nil {
					return fmt.Errorf("get chat themes: %w (get themes: %v)", globalErr, fallbackErr)
				}
				return fallbackErr
			}
			if len(fallback) > 0 {
				themes = fallback
			}
		}
		result = s.mapChatThemes(themes, proxy, ntp)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// fetchGlobalChatThemes is the modern source of the Appearance theme strip:
// account.getChatThemes returns the default global chat themes (8 of them when
// this was written), each with a day and a night palette.
func fetchGlobalChatThemes(ctx context.Context, client *telegram.Client) ([]tg.Theme, error) {
	response, err := client.API().AccountGetChatThemes(ctx, 0)
	if err != nil {
		return nil, err
	}
	themes, ok := response.(*tg.AccountThemes)
	if !ok || themes == nil {
		return nil, fmt.Errorf("unexpected account.getChatThemes response %T", response)
	}
	return themes.Themes, nil
}

// fetchAccountThemes is the old account.getThemes path, kept as a fallback for
// accounts (or server versions) where account.getChatThemes yields nothing. The
// format list mirrors what other official clients ask for.
func fetchAccountThemes(ctx context.Context, client *telegram.Client) ([]tg.Theme, error) {
	var firstErr error
	responded := false
	for _, format := range []string{"macos", "webk", "android", "ios", "tdesktop"} {
		response, err := client.API().AccountGetThemes(ctx, &tg.AccountGetThemesRequest{
			Format: format,
		})
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		accountThemes, ok := response.(*tg.AccountThemes)
		if !ok || accountThemes == nil {
			continue
		}
		responded = true
		if len(accountThemes.Themes) > 0 {
			return accountThemes.Themes, nil
		}
	}
	if responded {
		return nil, nil
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return nil, nil
}

// mapChatThemes converts cloud themes to the UI DTOs, keeping both palette
// variants and mirroring one of them into the legacy single-variant fields.
// Pattern documents are only registered here; their bytes are fetched when the
// WebView actually requests PatternURL.
func (s *Service) mapChatThemes(themes []tg.Theme, proxy, ntp string) []ChatThemeDTO {
	result := make([]ChatThemeDTO, 0, len(themes))
	for _, theme := range themes {
		item := ChatThemeDTO{
			ID:         theme.ID,
			AccessHash: theme.AccessHash,
			Slug:       theme.Slug,
			Title:      theme.Title,
			Emoticon:   theme.Emoticon,
		}
		if len(theme.Settings) > 0 {
			item.Settings = make([]ThemeSettingsDTO, 0, len(theme.Settings))
			for index := range theme.Settings {
				item.Settings = append(item.Settings, s.mapThemeSettings(&theme.Settings[index], proxy, ntp))
			}
		}
		if settings := pickThemeSettings(theme.Settings); settings != nil {
			item.BaseTheme = baseThemeName(settings.BaseTheme)
			item.Accent = settings.AccentColor
			item.OutboxAccent = settings.OutboxAccentColor
			item.MessageColors = settings.MessageColors
			if settings.Wallpaper != nil {
				item.Wallpaper = s.mapThemeWallpaper(
					settings.Wallpaper,
					themeSettingsIsDark(settings.BaseTheme),
					proxy,
					ntp,
				)
			}
		}
		result = append(result, item)
	}
	return result
}

// mapThemeSettings converts one palette variant, including its wallpaper.
func (s *Service) mapThemeSettings(settings *tg.ThemeSettings, proxy, ntp string) ThemeSettingsDTO {
	item := ThemeSettingsDTO{
		BaseTheme:    baseThemeName(settings.BaseTheme),
		Dark:         themeSettingsIsDark(settings.BaseTheme),
		Accent:       settings.AccentColor,
		OutboxAccent: settings.OutboxAccentColor,
	}
	item.MessageColors = settings.MessageColors
	if settings.Wallpaper != nil {
		item.Wallpaper = s.mapThemeWallpaper(settings.Wallpaper, item.Dark, proxy, ntp)
	}
	return item
}

// pickThemeSettings prefers the Day palette (the light theme these screens are
// built from), then the Classic day variant of the global chat themes, and
// falls back to whatever the theme carries.
func pickThemeSettings(settings []tg.ThemeSettings) *tg.ThemeSettings {
	if len(settings) == 0 {
		return nil
	}
	for index := range settings {
		if _, ok := settings[index].BaseTheme.(*tg.BaseThemeDay); ok {
			return &settings[index]
		}
	}
	for index := range settings {
		if _, ok := settings[index].BaseTheme.(*tg.BaseThemeClassic); ok {
			return &settings[index]
		}
	}
	return &settings[0]
}

func baseThemeName(base tg.BaseThemeClass) string {
	switch base.(type) {
	case *tg.BaseThemeClassic:
		return "classic"
	case *tg.BaseThemeDay:
		return "day"
	case *tg.BaseThemeNight:
		return "night"
	case *tg.BaseThemeTinted:
		return "tinted"
	default:
		return ""
	}
}

// themeSettingsIsDark reports whether a palette variant is the dark one.
func themeSettingsIsDark(base tg.BaseThemeClass) bool {
	switch base.(type) {
	case *tg.BaseThemeNight, *tg.BaseThemeTinted:
		return true
	default:
		return false
	}
}

// mapThemeWallpaper converts the wallpaper of a theme variant. darkVariant
// marks the wallpaper as belonging to the night/tinted palette; the wallpaper's
// own Dark flag is honoured as well.
func (s *Service) mapThemeWallpaper(
	wallpaper tg.WallPaperClass,
	darkVariant bool,
	proxy, ntp string,
) *ThemeWallpaperDTO {
	switch value := wallpaper.(type) {
	case *tg.WallPaper:
		if value == nil {
			return nil
		}
		dto := &ThemeWallpaperDTO{ID: value.ID, Slug: value.Slug}
		dto.Colors = wallpaperColors(value.Settings)
		dto.Intensity = value.Settings.Intensity
		dto.Pattern = value.Settings.Intensity != 0
		dto.Emoticon = value.Settings.Emoticon
		dto.Blur = value.Settings.Blur
		dto.Dark = darkVariant || value.Dark
		if document, ok := value.Document.(*tg.Document); ok && document != nil {
			if id := s.registerPatternDocument(document, proxy, ntp); id != "" {
				dto.PatternURL = s.patternURL(id)
			}
		}
		return dto
	case *tg.WallPaperNoFile:
		if value == nil {
			return nil
		}
		dto := &ThemeWallpaperDTO{}
		dto.Colors = wallpaperColors(value.Settings)
		dto.Intensity = value.Settings.Intensity
		dto.Pattern = value.Settings.Intensity != 0
		dto.Emoticon = value.Settings.Emoticon
		dto.Blur = value.Settings.Blur
		dto.Dark = darkVariant || value.Dark
		return dto
	default:
		return nil
	}
}

// wallpaperColors collects the gradient colours that are actually set. Colour 0
// is never a valid palette entry, so a zero value means "field absent".
func wallpaperColors(settings tg.WallPaperSettings) []int {
	var colors []int
	for _, color := range []int{
		settings.BackgroundColor,
		settings.SecondBackgroundColor,
		settings.ThirdBackgroundColor,
		settings.FourthBackgroundColor,
	} {
		if color != 0 {
			colors = append(colors, color)
		}
	}
	return colors
}

// GetWallPaperCatalog is a debug/utility pass over account.getWallPapers: every
// default wallpaper with its gradient colours, emoticon and pattern document.
func (s *Service) GetWallPaperCatalog(proxy, ntp string) ([]ChatThemeDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result []ChatThemeDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().AccountGetWallPapers(ctx, 0)
		if err != nil {
			return err
		}
		catalog, ok := response.(*tg.AccountWallPapers)
		if !ok || catalog == nil {
			return nil
		}
		for _, raw := range catalog.Wallpapers {
			wallpaper, ok := raw.(*tg.WallPaper)
			if !ok || wallpaper == nil {
				continue
			}
			item := ChatThemeDTO{
				ID:        wallpaper.ID,
				Slug:      wallpaper.Slug,
				Title:     wallpaper.Slug,
				Wallpaper: s.mapThemeWallpaper(wallpaper, wallpaper.Dark, proxy, ntp),
			}
			result = append(result, item)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
