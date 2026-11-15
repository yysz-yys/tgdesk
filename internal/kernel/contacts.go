package kernel

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// ContactDTO is one user row for the new-chat/new-group pickers and the New
// Private Chat contact list. ID is the raw Telegram user id because the
// pickers send the selected ids back to CreateGroup/InviteToChannel; PeerID is
// the opaque chat id ("user:<id>:<accessHash>") the private-chat page passes
// straight to openChat. ColorIndex is the Web K avatar gradient index
// (abs(user id) % 7). Online/LastSeen/Status are the peer's presence, the same
// shape ChatDTO uses (never set for bots or the logged-in account).
type ContactDTO struct {
	ID         int64  `json:"id"`
	PeerID     string `json:"peerId,omitempty"`
	Name       string `json:"name"`
	Username   string `json:"username,omitempty"`
	AvatarURL  string `json:"avatarUrl,omitempty"`
	ColorIndex int    `json:"colorIndex"`
	Online     bool   `json:"online,omitempty"`
	LastSeen   int64  `json:"lastSeen,omitempty"`
	Status     string `json:"status,omitempty"`
}

// SearchContacts searches the account's contacts and global Telegram users with
// contacts.search, the same call Telegram Web K makes for its new-chat search.
// The response carries personal (contact) matches in MyResults and global
// matches in Results; both are merged in that order and de-duplicated. An empty
// query returns an empty slice without touching the network.
func (s *Service) SearchContacts(proxy, ntp, query string, limit int) ([]ContactDTO, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []ContactDTO{}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	s.noteMediaConfig(proxy, ntp)
	result := make([]ContactDTO, 0, limit)
	err := s.withChatClient(ctx, proxy, ntp, func(ctx context.Context, client *telegram.Client) error {
		found, err := client.API().ContactsSearch(ctx, &tg.ContactsSearchRequest{
			Q:     query,
			Limit: limit,
		})
		if err != nil {
			return readableRPCError("search contacts", err)
		}
		for _, user := range contactUsers(found, limit) {
			name := displayName(user.FirstName, user.LastName)
			if name == "" {
				name = user.Username
			}
			if name == "" {
				continue
			}
			online, lastSeen, status := userPresence(user, s.selfUserID())
			peer := &tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash}
			// Remember the access hash so the picked ids can be turned back into
			// inputUser constructors by CreateGroup/InviteToChannel, and so the
			// opaque peer id below can be opened as a chat.
			peerID := s.rememberPeer(peer)
			result = append(result, ContactDTO{
				ID:         user.ID,
				PeerID:     peerID,
				Name:       name,
				Username:   user.Username,
				AvatarURL:  s.userAvatarURL(peer, user, proxy, ntp),
				ColorIndex: contactColorIndex(user.ID),
				Online:     online,
				LastSeen:   lastSeen,
				Status:     status,
			})
			if len(result) >= limit {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// contactUsers flattens a contacts.search answer into ordered users: personal
// (contact) matches first, then global results. Peers are de-duplicated by user
// id and filtered to full user constructors, and the result is capped at limit.
func contactUsers(found *tg.ContactsFound, limit int) []*tg.User {
	if found == nil || limit <= 0 {
		return nil
	}
	usersByID := make(map[int64]*tg.User, len(found.Users))
	for _, raw := range found.Users {
		if user, ok := raw.(*tg.User); ok {
			usersByID[user.ID] = user
		}
	}

	seen := make(map[int64]struct{}, len(found.MyResults)+len(found.Results))
	users := make([]*tg.User, 0, len(found.MyResults)+len(found.Results))
	appendPeers := func(peers []tg.PeerClass) {
		for _, raw := range peers {
			if len(users) >= limit {
				return
			}
			peer, ok := raw.(*tg.PeerUser)
			if !ok {
				continue
			}
			if _, duplicate := seen[peer.UserID]; duplicate {
				continue
			}
			user, ok := usersByID[peer.UserID]
			if !ok {
				continue
			}
			seen[peer.UserID] = struct{}{}
			users = append(users, user)
		}
	}
	appendPeers(found.MyResults)
	appendPeers(found.Results)
	return users
}

// contactColorIndex maps a Telegram user id to the seven-colour avatar gradient
// palette used by Telegram Web K (abs(id) % 7, including negative ids).
func contactColorIndex(userID int64) int {
	return int(absInt64(userID) % 7)
}

// resolveInputUsers turns raw Telegram user ids from the UI back into inputUser
// constructors. Access hashes come from the in-memory peer index, which is
// populated by dialog loads, member rows and SearchContacts; ids that are still
// unknown are resolved with one batched users.getUsers call. Input order is
// preserved and duplicate ids are dropped.
func (s *Service) resolveInputUsers(
	ctx context.Context,
	client *telegram.Client,
	userIDs []int64,
) ([]tg.InputUserClass, error) {
	ids, err := uniqueUserIDs(userIDs)
	if err != nil {
		return nil, err
	}

	inputs := make(map[int64]*tg.InputUser, len(ids))
	for _, id := range ids {
		if key := s.lookupPeer("user", id); key != "" {
			peer, err := parsePeerID(key)
			if err != nil {
				continue
			}
			if value, ok := peer.(*tg.InputPeerUser); ok {
				inputs[id] = &tg.InputUser{UserID: value.UserID, AccessHash: value.AccessHash}
			}
		}
	}

	var missing []int64
	for _, id := range ids {
		if inputs[id] == nil {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		query := make([]tg.InputUserClass, 0, len(missing))
		for _, id := range missing {
			query = append(query, &tg.InputUser{UserID: id})
		}
		found, err := client.API().UsersGetUsers(ctx, query)
		if err != nil {
			return nil, readableRPCError("resolve users", err)
		}
		for _, raw := range found {
			user, ok := raw.(*tg.User)
			if !ok {
				continue
			}
			inputs[user.ID] = &tg.InputUser{UserID: user.ID, AccessHash: user.AccessHash}
			s.rememberPeer(&tg.InputPeerUser{UserID: user.ID, AccessHash: user.AccessHash})
		}
	}

	result := make([]tg.InputUserClass, 0, len(ids))
	for _, id := range ids {
		input := inputs[id]
		if input == nil {
			return nil, fmt.Errorf("user %d is not available", id)
		}
		result = append(result, input)
	}
	return result, nil
}

// uniqueUserIDs drops duplicate ids and rejects non-positive ones.
func uniqueUserIDs(userIDs []int64) ([]int64, error) {
	result := make([]int64, 0, len(userIDs))
	seen := make(map[int64]struct{}, len(userIDs))
	for _, id := range userIDs {
		if id <= 0 {
			return nil, fmt.Errorf("invalid user id %d", id)
		}
		if _, duplicate := seen[id]; duplicate {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result, nil
}
