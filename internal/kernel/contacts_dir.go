package kernel

import (
	"context"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// GetContacts loads the account's saved contacts for the New Private Chat page
// (Web K's Contacts super tab, `contacts.getContacts` with hash 0 — the same
// call `appUsersManager.getContactsPeerIds` is built on). Deleted accounts, the
// logged-in account itself and users without a display name are dropped, and
// every row carries the opaque peer id so the page can open the private chat
// without another lookup. The page filters and sorts locally like tweb, so the
// server order is preserved.
//
// Bots are kept: Telegram lets contacts be bots and Web K lists them. Their
// presence fields stay empty (`userPresence` deliberately skips bots).
func (s *Service) GetContacts(proxy, ntp string) ([]ContactDTO, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	result := make([]ContactDTO, 0)
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		response, err := client.API().ContactsGetContacts(ctx, 0)
		if err != nil {
			return readableRPCError("load contacts", err)
		}
		// contacts.contactsNotModified cannot answer a hash-0 request; treat it
		// (and any unexpected container) as an empty contact list.
		found, ok := response.(*tg.ContactsContacts)
		if !ok || found == nil {
			result = make([]ContactDTO, 0)
			return nil
		}
		selfID := s.selfUserID()
		result = mapContacts(found, selfID, func(peer *tg.InputPeerUser, user *tg.User) string {
			return s.userAvatarURL(peer, user, proxy, ntp)
		})
		for _, row := range result {
			// Seed the peer index so GetMessages/OpenChat can resolve the id.
			if peer, parseErr := parsePeerID(row.PeerID); parseErr == nil {
				s.rememberPeer(peer)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// mapContacts maps a contacts.getContacts answer onto the contact-list rows the
// New Private Chat page renders. The avatar resolver is injected so the shape
// can be unit-tested without the loopback media server (tests pass nil).
// Rows keep the server order; the page sorts them by name or last seen, exactly
// like tweb. Duplicate contact entries (the server normally does not send any)
// are collapsed, and a contact without a usable display name is skipped.
func mapContacts(
	found *tg.ContactsContacts,
	selfID int64,
	avatar func(*tg.InputPeerUser, *tg.User) string,
) []ContactDTO {
	if found == nil {
		return nil
	}
	users := make(map[int64]*tg.User, len(found.Users))
	for _, raw := range found.Users {
		if user, ok := raw.(*tg.User); ok {
			users[user.ID] = user
		}
	}

	rows := make([]ContactDTO, 0, len(found.Contacts))
	seen := make(map[int64]struct{}, len(found.Contacts))
	for _, contact := range found.Contacts {
		userID := contact.UserID
		if userID == 0 || userID == selfID {
			continue
		}
		if _, duplicate := seen[userID]; duplicate {
			continue
		}
		user := users[userID]
		if user == nil || user.Deleted {
			continue
		}
		name := displayName(user.FirstName, user.LastName)
		if name == "" {
			name = user.Username
		}
		if name == "" {
			continue
		}

		peer := &tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash}
		online, lastSeen, status := userPresence(user, selfID)
		var avatarURL string
		if avatar != nil {
			avatarURL = avatar(peer, user)
		}
		rows = append(rows, ContactDTO{
			ID:         user.ID,
			PeerID:     encodePeerID("user", user.ID, user.AccessHash),
			Name:       name,
			Username:   user.Username,
			AvatarURL:  avatarURL,
			ColorIndex: contactColorIndex(user.ID),
			Online:     online,
			LastSeen:   lastSeen,
			Status:     status,
		})
		seen[userID] = struct{}{}
	}
	return rows
}
