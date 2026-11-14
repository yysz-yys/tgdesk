package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/gotd/td/tgerr"
)

// muteForever is Telegram's sentinel "mute until" value used for a permanent
// mute (0x7FFFFFFF, exactly like Telegram Web's MUTE_UNTIL constant).
const muteForever = 0x7FFFFFFF

// SetChatMuted mutes or unmutes a peer server-side. account.updateNotifySettings
// replaces every notification field, so the current settings are read first and
// merged; show-previews/sound/story flags survive the change. The dialogs cache
// is cleared so the next chat-list load paints the new muted state.
func (s *Service) SetChatMuted(chatID string, muted bool, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		notify := &tg.InputNotifyPeer{Peer: peer}
		current, err := client.API().AccountGetNotifySettings(ctx, notify)
		if err != nil {
			return readableRPCError("mute chat", err)
		}

		var settings tg.InputPeerNotifySettings
		if value, ok := current.GetShowPreviews(); ok {
			settings.SetShowPreviews(value)
		}
		if value, ok := current.GetSilent(); ok {
			settings.SetSilent(value)
		}
		if value, ok := current.GetMuteUntil(); ok {
			settings.SetMuteUntil(value)
		}
		if value, ok := current.GetStoriesMuted(); ok {
			settings.SetStoriesMuted(value)
		}
		if value, ok := current.GetStoriesHideSender(); ok {
			settings.SetStoriesHideSender(value)
		}
		if sound, ok := current.GetOtherSound(); ok {
			settings.SetSound(sound)
		}

		if muted {
			settings.SetMuteUntil(muteForever)
		} else {
			// Zero would be dropped by the TL serializer, so the setter is
			// required to encode "unmuted" explicitly.
			settings.SetMuteUntil(0)
			if sound, ok := current.GetOtherSound(); ok {
				if _, disabled := sound.(*tg.NotificationSoundNone); disabled {
					settings.SetSound(&tg.NotificationSoundDefault{})
				}
			}
		}

		if _, err := client.API().AccountUpdateNotifySettings(ctx, &tg.AccountUpdateNotifySettingsRequest{
			Peer:     notify,
			Settings: settings,
		}); err != nil {
			return readableRPCError("mute chat", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.invalidateDialogsCache()
	return nil
}

// SetChatPinned pins or unpins a dialog server-side with the same
// messages.toggleDialogPin RPC Telegram Web uses (there is no other per-dialog
// pin method in this TL layer). The dialogs cache is cleared afterwards so the
// next chat-list load shows the pinned section.
func (s *Service) SetChatPinned(chatID string, pinned bool, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		// Pinned=false is the "absent" flag state in TL and means unpin, which is
		// exactly what messages.toggleDialogPin expects.
		_, err := client.API().MessagesToggleDialogPin(ctx, &tg.MessagesToggleDialogPinRequest{
			Peer:   &tg.InputDialogPeer{Peer: peer},
			Pinned: pinned,
		})
		if err != nil {
			if tgerr.Is(err, tg.ErrPinnedDialogsTooMuch) {
				return fmt.Errorf("pin chat: no more pinned chats allowed in this folder")
			}
			return readableRPCError("pin chat", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.invalidateDialogsCache()
	return nil
}

// LeaveChat leaves a channel/supergroup (channels.leaveChannel) or removes a
// basic group from the account (messages.deleteChat, the only "leave" call the
// TL layer exposes for legacy groups). The dialogs and per-chat profile caches
// are cleared afterwards so the UI edge states (Join plate, chat list) refresh.
func (s *Service) LeaveChat(chatID, proxy, ntp string) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		switch value := peer.(type) {
		case *tg.InputPeerChannel:
			if _, err := client.API().ChannelsLeaveChannel(ctx, &tg.InputChannel{
				ChannelID:  value.ChannelID,
				AccessHash: value.AccessHash,
			}); err != nil {
				return readableRPCError("leave chat", err)
			}
			return nil
		case *tg.InputPeerChat:
			if _, err := client.API().MessagesDeleteChat(ctx, value.ChatID); err != nil {
				return readableRPCError("leave chat", err)
			}
			return nil
		default:
			return fmt.Errorf("leave chat: this chat cannot be left")
		}
	})
	s.chatMu.Unlock()
	if err != nil {
		return err
	}
	s.invalidateChatCaches(chatID)
	return nil
}

// invalidateDialogsCache drops the short-lived dialog snapshot used by
// GetChats/GetArchivedChats after a write that changes dialog state.
func (s *Service) invalidateDialogsCache() {
	s.dialogsCacheMu.Lock()
	s.dialogsCache = make(map[string]dialogsCacheEntry)
	s.dialogsCacheMu.Unlock()
}
