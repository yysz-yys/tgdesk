package kernel

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/tmedia"
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
	// PatternURL is the loopback HTTP URL of the pattern SVG (empty when the
	// wallpaper has no pattern document).
	PatternURL string `json:"patternUrl,omitempty"`
}

// ChatThemeDTO is one entry of the account's theme list (account.getThemes), the
// data behind Web K's Appearance previews: slug/title/emoticon, the base palette
// and accent, and the wallpaper the chat canvas paints.
type ChatThemeDTO struct {
	ID           int64              `json:"id"`
	AccessHash   int64              `json:"accessHash,omitempty"`
	Slug         string             `json:"slug,omitempty"`
	Title        string             `json:"title"`
	Emoticon     string             `json:"emoticon,omitempty"`
	BaseTheme    string             `json:"baseTheme,omitempty"`
	Accent       int                `json:"accent,omitempty"`
	OutboxAccent int                `json:"outboxAccent,omitempty"`
	Wallpaper    *ThemeWallpaperDTO `json:"wallpaper,omitempty"`
}

// GetChatThemes returns the account's cloud themes (Settings › General Settings
// list in telegram web, and the Appearance tip in the empty column).
func (s *Service) GetChatThemes(proxy, ntp string) ([]ChatThemeDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var result []ChatThemeDTO
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		var themes []tg.Theme
		debug := map[string]any{}
		for _, format := range []string{"macos", "webk", "android", "ios", "tdesktop"} {
			response, err := client.API().AccountGetThemes(ctx, &tg.AccountGetThemesRequest{
				Format: format,
			})
			if err != nil {
				debug[format] = err.Error()
				continue
			}
			if accountThemes, ok := response.(*tg.AccountThemes); ok && accountThemes != nil {
				debug[format] = len(accountThemes.Themes)
				if len(accountThemes.Themes) > 0 {
					themes = accountThemes.Themes
					break
				}
			} else {
				debug[format] = fmt.Sprintf("type %T", response)
			}
		}
		for _, theme := range themes {
			item := ChatThemeDTO{
				ID:         theme.ID,
				AccessHash: theme.AccessHash,
				Slug:       theme.Slug,
				Title:      theme.Title,
				Emoticon:   theme.Emoticon,
			}
			settings := pickThemeSettings(theme.Settings)
			if settings != nil {
				item.BaseTheme = baseThemeName(settings.BaseTheme)
				item.Accent = settings.AccentColor
				item.OutboxAccent = settings.OutboxAccentColor
				if wallpaper, ok := settings.GetWallpaper(); ok {
					item.Wallpaper = s.mapThemeWallpaper(wallpaper, proxy, ntp)
				}
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

// pickThemeSettings prefers the Day palette (the light theme these screens are
// built from) and falls back to whatever the theme carries.
func pickThemeSettings(settings []tg.ThemeSettings) *tg.ThemeSettings {
	if len(settings) == 0 {
		return nil
	}
	for index := range settings {
		if _, ok := settings[index].BaseTheme.(*tg.BaseThemeDay); ok {
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

func (s *Service) mapThemeWallpaper(wallpaper tg.WallPaperClass, proxy, ntp string) *ThemeWallpaperDTO {
	switch value := wallpaper.(type) {
	case *tg.WallPaper:
		if value == nil {
			return nil
		}
		dto := &ThemeWallpaperDTO{ID: value.ID, Slug: value.Slug}
		settings := value.Settings
		for _, color := range []struct {
			value int
			ok    bool
		}{
			{settings.BackgroundColor, settings.BackgroundColor != 0},
			{settings.SecondBackgroundColor, settings.SecondBackgroundColor != 0},
			{settings.ThirdBackgroundColor, settings.ThirdBackgroundColor != 0},
			{settings.FourthBackgroundColor, settings.FourthBackgroundColor != 0},
		} {
			if color.ok {
				dto.Colors = append(dto.Colors, color.value)
			}
		}
		dto.Intensity = settings.Intensity
		dto.Pattern = settings.Intensity != 0
		dto.Emoticon = settings.Emoticon
		dto.Blur = settings.Blur
		if document, ok := value.Document.(*tg.Document); ok && document != nil {
			media := &tmedia.Media{
				InputFileLoc: &tg.InputDocumentFileLocation{
					ID:            document.ID,
					AccessHash:    document.AccessHash,
					FileReference: document.FileReference,
					ThumbSize:     "",
				},
				Name: themePatternName(document),
				Size: document.Size,
				DC:   document.DCID,
			}
			if id := s.registerImage(media, proxy, ntp); id != "" {
				dto.PatternURL = s.imageURL(id, true)
			}
		}
		return dto
	case *tg.WallPaperNoFile:
		if value == nil {
			return nil
		}
		dto := &ThemeWallpaperDTO{}
		settings := value.Settings
		for _, color := range []struct {
			value int
			ok    bool
		}{
			{settings.BackgroundColor, settings.BackgroundColor != 0},
			{settings.SecondBackgroundColor, settings.SecondBackgroundColor != 0},
			{settings.ThirdBackgroundColor, settings.ThirdBackgroundColor != 0},
			{settings.FourthBackgroundColor, settings.FourthBackgroundColor != 0},
		} {
			if color.ok {
				dto.Colors = append(dto.Colors, color.value)
			}
		}
		dto.Intensity = settings.Intensity
		dto.Pattern = settings.Intensity != 0
		dto.Emoticon = settings.Emoticon
		return dto
	default:
		return nil
	}
}

func themePatternName(document *tg.Document) string {
	if document == nil {
		return "pattern.svg"
	}
	for _, attribute := range document.Attributes {
		switch value := attribute.(type) {
		case *tg.DocumentAttributeFilename:
			if strings.HasSuffix(strings.ToLower(value.FileName), ".svg") {
				return value.FileName
			}
		}
	}
	return "pattern.svg"
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
				Wallpaper: s.mapThemeWallpaper(wallpaper, proxy, ntp),
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
