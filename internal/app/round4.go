package app

import "tgdesk/internal/kernel"

// Round-4 parity bindings: thin Wails-facing wrappers only. Telegram logic and
// DTO shaping stay in internal/kernel.

// GetTopPeers returns the account's most-used correspondents (Web K's Chats tip
// card "Popular" list) from contacts.getTopPeers, cached for 24h in the kernel.
func (s *Service) GetTopPeers(
	proxy, ntp string,
	limit int,
) ([]kernel.ChatDTO, error) {
	return s.kernel.GetTopPeers(proxy, ntp, limit)
}

// StartBot starts a bot conversation with messages.startBot (Web K's START
// plate), optionally with a deep-link start parameter.
func (s *Service) StartBot(chatID, startParam, proxy, ntp string) error {
	return s.kernel.StartBot(chatID, startParam, proxy, ntp)
}

// SendTyping broadcasts the current user's typing state for a chat
// (messages.setTyping; Web K sends typing once per ~6s and cancel when the
// composer empties).
func (s *Service) SendTyping(chatID, action, proxy, ntp string) error {
	return s.kernel.SendTyping(chatID, action, proxy, ntp)
}

// GetContacts returns the account's contact list (Web K's New Private Chat
// page), with presence and the opaque peer id of each contact.
func (s *Service) GetContacts(proxy, ntp string) ([]kernel.ContactDTO, error) {
	return s.kernel.GetContacts(proxy, ntp)
}

// SetChatPhoto uploads a new profile photo (data URL / bare base64) for a
// channel or basic group created by the New Channel / New Group flow.
func (s *Service) SetChatPhoto(proxy, ntp, chatID, photoBase64 string) error {
	return s.kernel.SetChatPhoto(proxy, ntp, chatID, photoBase64)
}

// GetPinnedMessageInfo returns the chat's pinned message together with the pin
// count, the newest pinned id and whether the account may (un)pin, which is
// everything Web K's floating pinned plate renders (counter, dashes, menu).
func (s *Service) GetPinnedMessageInfo(
	chatID, proxy, ntp string,
) (*kernel.PinnedMessageDTO, error) {
	return s.kernel.GetPinnedMessageInfo(chatID, proxy, ntp)
}

// UpdatePinnedMessage pins/unpins one message (messages.updatePinnedMessage).
func (s *Service) UpdatePinnedMessage(
	chatID string,
	messageID int,
	unpin, silent bool,
	proxy, ntp string,
) error {
	return s.kernel.UpdatePinnedMessage(chatID, messageID, unpin, silent, proxy, ntp)
}
