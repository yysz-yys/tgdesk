package kernel

import (
	"context"
	"fmt"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// PinnedMessageDTO is the pinned-message plate payload for the Web K chat
// chrome (tweb `components/chat/pinnedMessage.tsx`). A single
// `messages.search` with `inputMessagesFilterPinned` answers everything the
// plate needs for its first paint:
//
//   - Message is the newest pinned message (nil when nothing is pinned);
//   - Count is the total number of pinned messages, for the "#N" counter and
//     the dashed multiple-pin border;
//   - MaxID is the newest pinned message id, so the frontend can keep a bar the
//     user hid hidden until a *newer* message is pinned (tweb
//     `appState.hiddenPinnedMessages[key] = maxId`);
//   - CanPin mirrors tweb `appPeersManager.canPinMessage` and decides whether
//     the bar's X unpins the message or hides the bar.
type PinnedMessageDTO struct {
	Message *MessageDTO `json:"message,omitempty"`
	Count   int         `json:"count"`
	MaxID   int         `json:"maxId,omitempty"`
	CanPin  bool        `json:"canPin"`
}

// GetPinnedMessageInfo returns the pinned-message plate payload. It is the
// round-4 replacement for GetPinnedMessage (which only returned the message and
// is kept for compatibility): Telegram Web renders the plate from
// `messages.search` with `inputMessagesFilterPinned`, newest first, and reads
// the response `count` for the "#N" counter (tweb
// `appMessagesManager.getPinnedMessage`).
//
// The message is mapped through the regular history path, so media/thumbnails,
// sender avatars and reactions are identical to the chat bubbles.
func (s *Service) GetPinnedMessageInfo(chatID, proxy, ntp string) (*PinnedMessageDTO, error) {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	info := &PinnedMessageDTO{CanPin: true}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().MessagesSearch(ctx, &tg.MessagesSearchRequest{
			Peer:   peer,
			Q:      "",
			Filter: &tg.InputMessagesFilterPinned{},
			Limit:  1,
		})
		if err != nil {
			return fmt.Errorf("get pinned message: %w", err)
		}

		messages, users, chats, ok := messagesList(response)
		count := pinnedMessagesCount(response)
		if ok && len(messages) > 0 {
			mapped := s.mapHistoryMessages(ctx, client, peer, chatID, messages, users, chats, proxy, ntp)
			if len(mapped) > 0 {
				message := mapped[0]
				info.Message = &message
				info.MaxID = message.ID
			}
		}
		if count < 1 && info.Message != nil {
			count = 1
		}
		info.Count = count

		// canPin is a permission probe: a failure must not hide the plate, it
		// only turns the X into the "Hide pinned messages" action.
		canPin, pinErr := s.canPinMessages(ctx, client, peer)
		info.CanPin = pinErr == nil && canPin
		return nil
	})
	if err != nil {
		return nil, err
	}
	return info, nil
}

// pinnedMessagesCount reads the total result count of a
// `messages.search inputMessagesFilterPinned` response. messages.messages has
// no count field — its whole list is the result.
func pinnedMessagesCount(response tg.MessagesMessagesClass) int {
	switch value := response.(type) {
	case *tg.MessagesMessages:
		return len(value.Messages)
	case *tg.MessagesMessagesSlice:
		return value.Count
	case *tg.MessagesChannelMessages:
		return value.Count
	default:
		return 0
	}
}

// canPinMessages mirrors tweb `appPeersManager.canPinMessage` →
// `appChatsManager.hasRights('pin_messages')`:
//
//   - private peers: always, the other side's client enforces nothing;
//   - channels/supergroups: the creator, else the account's admin rights
//     (`pin_messages`, or `post_messages` in a broadcast channel), else the
//     default banned rights;
//   - basic groups: the creator, else admin rights, else default banned rights.
func (s *Service) canPinMessages(
	ctx context.Context,
	client *telegram.Client,
	peer tg.InputPeerClass,
) (bool, error) {
	switch value := peer.(type) {
	case *tg.InputPeerUser:
		return true, nil
	case *tg.InputPeerChannel:
		return canPinChannel(ctx, client, value)
	case *tg.InputPeerChat:
		return canPinBasicChat(ctx, client, value)
	default:
		return false, fmt.Errorf("unsupported peer")
	}
}

// adminCanPin applies tweb's pin_messages rule to a set of admin rights:
// the dedicated right, and for broadcast channels the post_messages right
// (an admin who may post a broadcast may pin in it).
func adminCanPin(rights tg.ChatAdminRights, megagroup bool) bool {
	return rights.PinMessages || (!megagroup && rights.PostMessages)
}

func canPinChannel(
	ctx context.Context,
	client *telegram.Client,
	peer *tg.InputPeerChannel,
) (bool, error) {
	input := &tg.InputChannel{ChannelID: peer.ChannelID, AccessHash: peer.AccessHash}

	var channel *tg.Channel
	response, err := client.API().ChannelsGetChannels(ctx, []tg.InputChannelClass{input})
	if err == nil {
		if chats, ok := response.(*tg.MessagesChats); ok {
			for _, entity := range chats.Chats {
				if value, ok := entity.(*tg.Channel); ok && value.ID == peer.ChannelID {
					channel = value
					break
				}
			}
		}
	}

	if channel != nil {
		if channel.Creator {
			return true, nil
		}
		if rights, ok := channel.GetAdminRights(); ok {
			return adminCanPin(rights, channel.Megagroup), nil
		}
	}

	// The channel entity can omit the account's own rights (and a groups call can
	// fail entirely); channels.getParticipant answers them directly, which is
	// what tweb ends up with after its own entity refresh.
	participant, participantErr := client.API().ChannelsGetParticipant(ctx, &tg.ChannelsGetParticipantRequest{
		Channel:     input,
		Participant: &tg.InputPeerSelf{},
	})
	if participantErr == nil && participant != nil {
		switch part := participant.Participant.(type) {
		case *tg.ChannelParticipantCreator:
			return true, nil
		case *tg.ChannelParticipantAdmin:
			megagroup := channel != nil && channel.Megagroup
			return adminCanPin(part.AdminRights, megagroup), nil
		case *tg.ChannelParticipantBanned:
			return !part.BannedRights.PinMessages, nil
		}
	}
	if channel == nil {
		if err != nil {
			return false, err
		}
		if participantErr != nil {
			return false, participantErr
		}
		return false, fmt.Errorf("channel rights unavailable")
	}

	if rights, ok := channel.GetBannedRights(); ok {
		return !rights.PinMessages, nil
	}
	if rights, ok := channel.GetDefaultBannedRights(); ok {
		return !rights.PinMessages, nil
	}
	return false, nil
}

func canPinBasicChat(
	ctx context.Context,
	client *telegram.Client,
	peer *tg.InputPeerChat,
) (bool, error) {
	response, err := client.API().MessagesGetPeerDialogs(ctx, []tg.InputDialogPeerClass{
		&tg.InputDialogPeer{Peer: peer},
	})
	if err != nil {
		return false, err
	}
	for _, entity := range response.Chats {
		value, ok := entity.(*tg.Chat)
		if !ok || value.ID != peer.ChatID {
			continue
		}
		if value.Creator {
			return true, nil
		}
		if rights, ok := value.GetAdminRights(); ok {
			return adminCanPin(rights, false), nil
		}
		if rights, ok := value.GetDefaultBannedRights(); ok {
			return !rights.PinMessages, nil
		}
		return false, nil
	}
	return false, fmt.Errorf("chat not found")
}
