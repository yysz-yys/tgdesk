package kernel

import (
	"context"
	"strconv"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// senderEmojiStatusURLs resolves premium emoji statuses for the user entities
// in a history response. Telegram exposes only document ids in user.emoji_status,
// so the documents are fetched once and their thumbnails are served through the
// existing loopback image server. The returned map is keyed by sender user id.
func (s *Service) senderEmojiStatusURLs(
	ctx context.Context,
	client *telegram.Client,
	users map[int64]*tg.User,
	proxy, ntp string,
) map[int64]string {
	result := make(map[int64]string)
	if len(users) == 0 {
		return result
	}

	documentUsers := make(map[int64][]int64)
	var missing []int64
	seenMissing := make(map[int64]bool)
	for userID, user := range users {
		status, ok := user.GetEmojiStatus()
		if !ok {
			continue
		}
		var documentID int64
		switch value := status.(type) {
		case *tg.EmojiStatus:
			documentID = value.DocumentID
		case *tg.EmojiStatusCollectible:
			documentID = value.DocumentID
		}
		if documentID == 0 {
			continue
		}
		s.emojiStatusMu.Lock()
		url := s.emojiStatusCache[documentID]
		s.emojiStatusMu.Unlock()
		if url != "" {
			result[userID] = url
			continue
		}
		documentUsers[documentID] = append(documentUsers[documentID], userID)
		if !seenMissing[documentID] {
			seenMissing[documentID] = true
			missing = append(missing, documentID)
		}
	}
	if len(missing) == 0 {
		return result
	}

	documents, err := client.API().MessagesGetCustomEmojiDocuments(ctx, missing)
	if err != nil {
		return result
	}
	s.emojiStatusMu.Lock()
	defer s.emojiStatusMu.Unlock()
	for _, raw := range documents {
		document, ok := raw.(*tg.Document)
		if !ok {
			continue
		}
		thumb, ok := documentThumbMedia(document)
		if !ok {
			continue
		}
		url := s.imageURL(s.registerImage(thumb, proxy, ntp), false)
		s.emojiStatusCache[document.ID] = url
		for _, userID := range documentUsers[document.ID] {
			result[userID] = url
		}
	}
	return result
}

func peerUserID(peer tg.PeerClass) int64 {
	switch value := peer.(type) {
	case *tg.PeerUser:
		return value.UserID
	default:
		return 0
	}
}

// ensureCustomEmojiURLs registers thumbnails for custom emoji documents used by
// reactions. Results are cached by document id and reused by live updates.
func (s *Service) ensureCustomEmojiURLs(
	ctx context.Context,
	client *telegram.Client,
	documentIDs []int64,
	proxy, ntp string,
) {
	if len(documentIDs) == 0 {
		return
	}
	missing := make([]int64, 0, len(documentIDs))
	seen := make(map[int64]bool, len(documentIDs))
	s.emojiStatusMu.Lock()
	for _, id := range documentIDs {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		if s.emojiStatusCache[id] == "" {
			missing = append(missing, id)
		}
	}
	s.emojiStatusMu.Unlock()
	if len(missing) == 0 {
		return
	}
	documents, err := client.API().MessagesGetCustomEmojiDocuments(ctx, missing)
	if err != nil {
		return
	}
	s.emojiStatusMu.Lock()
	defer s.emojiStatusMu.Unlock()
	for _, raw := range documents {
		document, ok := raw.(*tg.Document)
		if !ok {
			continue
		}
		thumb, ok := documentThumbMedia(document)
		if !ok {
			continue
		}
		s.emojiStatusCache[document.ID] = s.imageURL(s.registerImage(thumb, proxy, ntp), false)
	}
}

func (s *Service) fillReactionURLs(reactions []ReactionDTO) {
	if len(reactions) == 0 {
		return
	}
	s.emojiStatusMu.Lock()
	defer s.emojiStatusMu.Unlock()
	for index := range reactions {
		id, err := strconv.ParseInt(reactions[index].CustomEmojiID, 10, 64)
		if err != nil || id == 0 {
			continue
		}
		reactions[index].URL = s.emojiStatusCache[id]
	}
}

func reactionDocumentIDs(messages []tg.MessageClass) []int64 {
	var ids []int64
	for _, raw := range messages {
		message, ok := raw.(*tg.Message)
		if !ok {
			continue
		}
		reactions, ok := message.GetReactions()
		if !ok {
			continue
		}
		for _, count := range reactions.Results {
			if custom, ok := count.Reaction.(*tg.ReactionCustomEmoji); ok {
				ids = append(ids, custom.DocumentID)
			}
		}
	}
	return ids
}
