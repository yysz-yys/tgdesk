package app

import "tgdesk/internal/kernel"

// Round-3 parity bindings: thin Wails-facing wrappers only. Telegram logic and
// DTO shaping stay in internal/kernel.

// GetPinnedMessage returns the first pinned message of a chat (nil when none).
func (s *Service) GetPinnedMessage(chatID, proxy, ntp string) (*kernel.MessageDTO, error) {
	return s.kernel.GetPinnedMessage(chatID, proxy, ntp)
}

// UnpinAllMessages removes every pinned message from a chat.
func (s *Service) UnpinAllMessages(chatID, proxy, ntp string) error {
	return s.kernel.UnpinAllMessages(chatID, proxy, ntp)
}

// GetSavedChats lists the source chats of Saved Messages (Saved Messages 2.0).
func (s *Service) GetSavedChats(proxy, ntp string) (*kernel.SavedChatsDTO, error) {
	return s.kernel.GetSavedChats(proxy, ntp)
}

// GetChatGifts loads one page of a profile's received star gifts.
func (s *Service) GetChatGifts(
	chatID, offset string,
	limit int,
	proxy, ntp string,
) (*kernel.ChatGiftsDTO, error) {
	return s.kernel.GetChatGifts(chatID, offset, limit, proxy, ntp)
}

// SearchStickers searches Telegram's sticker catalogue.
func (s *Service) SearchStickers(
	query string,
	limit int,
	proxy, ntp string,
) (*kernel.StickerSearchDTO, error) {
	return s.kernel.SearchStickers(query, limit, proxy, ntp)
}

// GetFavedStickers returns the account's favourite stickers.
func (s *Service) GetFavedStickers(proxy, ntp string) ([]kernel.StickerDocDTO, error) {
	return s.kernel.GetFavedStickers(proxy, ntp)
}

// SetStickerFaved adds/removes a sticker from the favourites list.
func (s *Service) SetStickerFaved(ref string, faved bool, proxy, ntp string) error {
	return s.kernel.SetStickerFaved(ref, faved, proxy, ntp)
}

// ClearRecentStickers clears the server-side recent sticker list.
func (s *Service) ClearRecentStickers(proxy, ntp string) error {
	return s.kernel.ClearRecentStickers(proxy, ntp)
}

// InstallStickerSet installs a sticker set by its opaque set ref.
func (s *Service) InstallStickerSet(ref, proxy, ntp string) error {
	return s.kernel.InstallStickerSet(ref, proxy, ntp)
}

// UninstallStickerSet removes a sticker set by its opaque set ref.
func (s *Service) UninstallStickerSet(ref, proxy, ntp string) error {
	return s.kernel.UninstallStickerSet(ref, proxy, ntp)
}

// ArchiveStickerSet archives or unarchives a sticker set.
func (s *Service) ArchiveStickerSet(ref string, archived bool, proxy, ntp string) error {
	return s.kernel.ArchiveStickerSet(ref, archived, proxy, ntp)
}

// GetFeaturedStickerSets returns Telegram's featured/trending sticker sets.
func (s *Service) GetFeaturedStickerSets(proxy, ntp string) ([]kernel.StickerSetDTO, error) {
	return s.kernel.GetFeaturedStickerSets(proxy, ntp)
}

// SearchGifs runs one page of the inline-bot GIF search.
func (s *Service) SearchGifs(
	query, offset string,
	proxy, ntp string,
) (*kernel.GifSearchPageDTO, error) {
	return s.kernel.SearchGifs(query, offset, proxy, ntp)
}

// SendInlineGif sends a selected inline GIF search result.
func (s *Service) SendInlineGif(
	chatID string,
	queryID int64,
	resultID string,
	replyToID int,
	proxy, ntp string,
) error {
	return s.kernel.SendInlineGif(chatID, queryID, resultID, replyToID, proxy, ntp)
}

// SetGifSaved adds or removes a GIF from the saved-GIF list.
func (s *Service) SetGifSaved(ref string, saved bool, proxy, ntp string) error {
	return s.kernel.SetGifSaved(ref, saved, proxy, ntp)
}

// SendWebViewData relays a mini app web_app_data_send payload to its bot.
func (s *Service) SendWebViewData(
	chatID, botPeerID string,
	queryID int64,
	data string,
	proxy, ntp string,
) error {
	return s.kernel.SendWebViewData(chatID, botPeerID, queryID, data, proxy, ntp)
}

// ProlongWebView keeps an open mini app session alive on the server.
func (s *Service) ProlongWebView(
	chatID, botPeerID string,
	queryID int64,
	proxy, ntp string,
) error {
	return s.kernel.ProlongWebView(chatID, botPeerID, queryID, proxy, ntp)
}
