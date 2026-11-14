package kernel

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

const (
	// Telegram's own limits for peer titles and channel descriptions.
	maxChatTitleRunes = 128
	maxChatAboutRunes = 255
	// addChatUser forwards the last messages of a basic group history when an
	// existing contact is added, exactly like Telegram Desktop's invite flow.
	addChatUserFwdLimit = 100
)

// CreateChannel creates a broadcast channel with channels.createChannel and
// returns the opaque chat id the rest of the kernel/UI uses
// ("channel:<id>:<accessHash>"). Picked members are added afterwards with
// InviteToChannel. The dialog cache is invalidated so the next GetChats call
// includes the new channel.
func (s *Service) CreateChannel(proxy, ntp, title, about string) (string, error) {
	title, err := normalizeChatTitle(title)
	if err != nil {
		return "", err
	}
	about = normalizeChatAbout(about)

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var created *tg.Channel
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		updates, err := client.API().ChannelsCreateChannel(ctx, &tg.ChannelsCreateChannelRequest{
			Broadcast: true,
			Title:     title,
			About:     about,
		})
		if err != nil {
			return readableRPCError("create channel", err)
		}
		channel, ok := createdChannel(updates)
		if !ok {
			return fmt.Errorf("create channel: Telegram did not return the new channel")
		}
		created = channel
		return nil
	})
	if err != nil {
		return "", err
	}

	peer := &tg.InputPeerChannel{ChannelID: created.ID, AccessHash: created.AccessHash}
	s.rememberPeer(peer)
	opaqueID := encodePeerID("channel", created.ID, created.AccessHash)
	s.invalidateChatCaches(opaqueID)
	return opaqueID, nil
}

// CreateGroup creates a legacy basic group with messages.createChat and returns
// its opaque chat id ("chat:<id>"). userIDs may be empty: Telegram then creates
// a group with only the current account. The dialog cache is invalidated so the
// next GetChats call includes the new group.
func (s *Service) CreateGroup(proxy, ntp, title string, userIDs []int64) (string, error) {
	title, err := normalizeChatTitle(title)
	if err != nil {
		return "", err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var chatID int64
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		users, err := s.resolveInputUsers(ctx, client, userIDs)
		if err != nil {
			return err
		}
		invited, err := client.API().MessagesCreateChat(ctx, &tg.MessagesCreateChatRequest{
			Users: users,
			Title: title,
		})
		if err != nil {
			return readableRPCError("create group", err)
		}
		if invited == nil {
			return fmt.Errorf("create group: Telegram did not return the new group")
		}
		id, ok := createdBasicChat(invited.Updates)
		if !ok {
			return fmt.Errorf("create group: Telegram did not return the new group")
		}
		chatID = id
		return nil
	})
	if err != nil {
		return "", err
	}

	s.rememberPeer(&tg.InputPeerChat{ChatID: chatID})
	opaqueID := encodePeerID("chat", chatID, 0)
	s.invalidateChatCaches(opaqueID)
	return opaqueID, nil
}

// InviteToChannel adds members to a channel/supergroup with
// channels.inviteToChannel. Basic groups created with CreateGroup are handled
// with messages.addChatUser, the only invite call Telegram exposes for them. The
// dialog list is invalidated so the member count refreshes.
func (s *Service) InviteToChannel(proxy, ntp, chatID string, userIDs []int64) error {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return err
	}

	s.chatMu.Lock()
	defer s.chatMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		users, err := s.resolveInputUsers(ctx, client, userIDs)
		if err != nil {
			return err
		}
		if len(users) == 0 {
			return fmt.Errorf("invite members: no users selected")
		}
		switch value := peer.(type) {
		case *tg.InputPeerChannel:
			_, err = client.API().ChannelsInviteToChannel(ctx, &tg.ChannelsInviteToChannelRequest{
				Channel: &tg.InputChannel{
					ChannelID:  value.ChannelID,
					AccessHash: value.AccessHash,
				},
				Users: users,
			})
			if err != nil {
				return readableRPCError("invite members", err)
			}
			return nil
		case *tg.InputPeerChat:
			for _, user := range users {
				_, err = client.API().MessagesAddChatUser(ctx, &tg.MessagesAddChatUserRequest{
					ChatID:   value.ChatID,
					UserID:   user,
					FwdLimit: addChatUserFwdLimit,
				})
				if err != nil {
					return readableRPCError("invite members", err)
				}
			}
			return nil
		default:
			return fmt.Errorf("invite members: this chat cannot accept members")
		}
	})
	if err != nil {
		return err
	}

	s.invalidateChatCaches(chatID)
	return nil
}

// normalizeChatTitle trims a new chat title and clamps it to Telegram's 128
// character limit. Telegram rejects empty titles, so that case is an error.
func normalizeChatTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", fmt.Errorf("chat title is empty")
	}
	return truncateRunes(title, maxChatTitleRunes), nil
}

// normalizeChatAbout trims and clamps a channel description to Telegram's 255
// character limit.
func normalizeChatAbout(about string) string {
	return truncateRunes(strings.TrimSpace(about), maxChatAboutRunes)
}

// truncateRunes cuts value to at most max runes, keeping the text valid UTF-8.
func truncateRunes(value string, max int) string {
	if max <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}

// unpackUpdates flattens the two full update containers Telegram can return for
// a creation RPC into their update/chat/user lists.
func unpackUpdates(updates tg.UpdatesClass) ([]tg.UpdateClass, []tg.ChatClass, []tg.UserClass) {
	switch value := updates.(type) {
	case *tg.Updates:
		if value == nil {
			return nil, nil, nil
		}
		return value.Updates, value.Chats, value.Users
	case *tg.UpdatesCombined:
		if value == nil {
			return nil, nil, nil
		}
		return value.Updates, value.Chats, value.Users
	default:
		return nil, nil, nil
	}
}

// createdChannel extracts the channel entity created by channels.createChannel
// from the RPC response. The full channel (with its access hash) travels in the
// chats list; the updateChannel entry identifies which one is new.
func createdChannel(updates tg.UpdatesClass) (*tg.Channel, bool) {
	list, chats, _ := unpackUpdates(updates)
	var channelID int64
	for _, raw := range list {
		if update, ok := raw.(*tg.UpdateChannel); ok && update.ChannelID != 0 {
			channelID = update.ChannelID
			break
		}
	}

	var fallback *tg.Channel
	for _, raw := range chats {
		channel, ok := raw.(*tg.Channel)
		if !ok {
			continue
		}
		if channelID != 0 && channel.ID == channelID {
			return channel, true
		}
		if fallback == nil {
			fallback = channel
		}
	}
	if channelID == 0 && fallback != nil {
		return fallback, true
	}
	return nil, false
}

// createdBasicChat extracts the group id created by messages.createChat. The
// service message announcing the new group identifies the peer; the chat entity
// in the chats list is the fallback for update containers that strip messages.
func createdBasicChat(updates tg.UpdatesClass) (int64, bool) {
	list, chats, _ := unpackUpdates(updates)
	for _, raw := range list {
		switch update := raw.(type) {
		case *tg.UpdateNewMessage:
			if id, ok := peerChatIDOfMessage(update.Message); ok {
				return id, true
			}
		case *tg.UpdateChatParticipants:
			if participants, ok := update.Participants.(*tg.ChatParticipants); ok && participants.ChatID != 0 {
				return participants.ChatID, true
			}
		}
	}
	for _, raw := range chats {
		if chat, ok := raw.(*tg.Chat); ok {
			return chat.ID, true
		}
	}
	return 0, false
}

// peerChatIDOfMessage returns the basic-group id carried by a message/service
// message peer.
func peerChatIDOfMessage(message tg.MessageClass) (int64, bool) {
	switch msg := message.(type) {
	case *tg.Message:
		if peer, ok := msg.PeerID.(*tg.PeerChat); ok && peer.ChatID != 0 {
			return peer.ChatID, true
		}
	case *tg.MessageService:
		if peer, ok := msg.PeerID.(*tg.PeerChat); ok && peer.ChatID != 0 {
			return peer.ChatID, true
		}
	}
	return 0, false
}
