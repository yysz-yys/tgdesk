package kernel

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// StarGiftDTO is one star gift shown on a peer's profile. Telegram Web K's
// Gifts tab is the peer's saved-gift collection (channel gifts and user
// profiles use the same payments.getSavedStarGifts source).
type StarGiftDTO struct {
	// ID is a stable per-row id: the saved_id when Telegram assigned one,
	// otherwise a gift/unique id fallback so the UI can key the list.
	ID string `json:"id"`
	// Title is the gift template name; empty for unnamed templates, where the
	// UI shows the sticker only.
	Title string `json:"title,omitempty"`
	// From is the sender display name, empty when the sender is hidden.
	From string `json:"from,omitempty"`
	Date int64  `json:"date,omitempty"`
	// Stars is the gift price in Telegram Stars for regular gifts (the
	// collectible value for unique gifts, when the server reports it in XTR).
	Stars int64 `json:"stars,omitempty"`
	// Count is the number of gifts this saved row represents (a sender may
	// send several at once); at least 1 for every row.
	Count    int    `json:"count,omitempty"`
	ThumbURL string `json:"thumbUrl,omitempty"`
	Unique   bool   `json:"unique,omitempty"`
	SoldOut  bool   `json:"soldOut,omitempty"`
}

// ChatGiftsDTO is one page of a peer's gifts. NextOffset is the cursor for the
// following page ("" at the end); Total is the server-side gift count.
type ChatGiftsDTO struct {
	Gifts      []StarGiftDTO `json:"gifts"`
	NextOffset string        `json:"nextOffset,omitempty"`
	Total      int           `json:"total,omitempty"`
}

// GetChatGifts loads one page of a peer's saved star gifts
// (payments.getSavedStarGifts), the data source of the Gifts tab in the chat
// info panel. Gift sticker thumbnails are registered through the loopback image
// server when the template carries a downloadable sticker; unique collectibles
// have no sticker on the saved row and keep ThumbURL empty.
func (s *Service) GetChatGifts(
	chatID, offset string,
	limit int,
	proxy, ntp string,
) (*ChatGiftsDTO, error) {
	peer, err := parsePeerID(chatID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	s.rememberPeer(peer)

	page := &ChatGiftsDTO{Gifts: []StarGiftDTO{}}
	err = s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().PaymentsGetSavedStarGifts(
			ctx,
			&tg.PaymentsGetSavedStarGiftsRequest{
				Peer:   peer,
				Offset: offset,
				Limit:  limit,
			},
		)
		if err != nil {
			return fmt.Errorf("get saved star gifts: %w", err)
		}
		senders := giftSenderNames(response.Users)
		for _, saved := range response.Gifts {
			item := mapSavedStarGift(saved, senders)
			item.ThumbURL = s.giftThumbURL(saved.Gift, proxy, ntp)
			page.Gifts = append(page.Gifts, item)
		}
		if next, ok := response.GetNextOffset(); ok {
			page.NextOffset = next
		}
		page.Total = response.Count
		return nil
	})
	if err != nil {
		return nil, err
	}
	return page, nil
}

// giftSenderNames indexes the sender entities returned with a saved-gift page.
func giftSenderNames(users []tg.UserClass) map[int64]string {
	senders := make(map[int64]string, len(users))
	for _, raw := range users {
		user, ok := raw.(*tg.User)
		if !ok {
			continue
		}
		name := displayName(user.FirstName, user.LastName)
		if name == "" {
			name = user.Username
		}
		senders[user.ID] = name
	}
	return senders
}

// mapSavedStarGift maps one payments.savedStarGift row. It is a pure function so
// the DTO shape is unit-testable without a network client; the placeholder-
// resolving ThumbURL is filled by the caller.
func mapSavedStarGift(saved tg.SavedStarGift, senders map[int64]string) StarGiftDTO {
	item := StarGiftDTO{Date: int64(saved.Date)}
	// gift_num is the number of gifts in a batch; every saved row represents at
	// least one gift.
	item.Count = 1
	if num, ok := saved.GetGiftNum(); ok && num > item.Count {
		item.Count = num
	}
	if !saved.NameHidden {
		item.From = senderName(saved.FromID, senders)
	}
	switch gift := saved.Gift.(type) {
	case *tg.StarGift:
		item.Title, _ = gift.GetTitle()
		item.Stars = gift.Stars
		item.SoldOut = gift.SoldOut
		item.ID = strconv.FormatInt(gift.ID, 10)
	case *tg.StarGiftUnique:
		item.Title = gift.Title
		item.Unique = true
		item.ID = "unique:" + strconv.FormatInt(gift.ID, 10)
		// Collectibles are valued in TON or Stars; expose the Stars value when
		// the server reports one.
		if currency, _ := gift.GetValueCurrency(); currency == "XTR" {
			if amount, ok := gift.GetValueAmount(); ok && amount > 0 {
				item.Stars = amount
			}
		}
	}
	// saved_id is the per-collection identifier and is stable across pages.
	if saved.SavedID != 0 {
		item.ID = strconv.FormatInt(saved.SavedID, 10)
	}
	return item
}

// giftThumbURL registers the gift template sticker as a still image for the
// gifts grid. It is best effort: TGS/WebM-only templates without a still thumb
// and unique collectibles return "" so the UI can fall back to the emoji.
func (s *Service) giftThumbURL(gift tg.StarGiftClass, proxy, ntp string) string {
	template, ok := gift.(*tg.StarGift)
	if !ok {
		return ""
	}
	document, ok := template.Sticker.(*tg.Document)
	if !ok || document == nil {
		return ""
	}
	media, ok := stickerThumbMedia(document, 160)
	if !ok {
		return ""
	}
	return s.imageURL(s.registerImage(media, proxy, ntp), false)
}
