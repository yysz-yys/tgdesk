package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
)

// testUser builds a full user entity with a conditional status flag set the way
// the server sends it (gotd only exposes Status when its flag is set).
func testUser(id, accessHash int64, first, last, username string) *tg.User {
	user := &tg.User{ID: id, AccessHash: accessHash, FirstName: first, LastName: last, Username: username}
	return user
}

func TestMapContacts(t *testing.T) {
	ada := testUser(1, 111, "Ada", "Lovelace", "")
	ada.SetStatus(&tg.UserStatusOnline{})
	found := &tg.ContactsContacts{
		Contacts: []tg.Contact{
			{UserID: 1},
			{UserID: 2}, // deleted account: skipped
			{UserID: 5}, // the logged-in account: skipped
			{UserID: 6},
			{UserID: 7},  // no display name at all: skipped
			{UserID: 1},  // duplicate: skipped
			{UserID: 99}, // contact without a user entity: skipped
		},
		Users: []tg.UserClass{
			ada,
			&tg.User{ID: 2, AccessHash: 222, FirstName: "Gone", Deleted: true},
			&tg.User{ID: 5, AccessHash: 555, FirstName: "Me"},
			testUser(6, 666, "", "", "cid"),
			&tg.User{ID: 7},
			&tg.UserEmpty{ID: 8}, // not a full user: skipped if it were a contact
		},
	}

	avatarCalls := 0
	rows := mapContacts(found, 5, func(peer *tg.InputPeerUser, user *tg.User) string {
		avatarCalls++
		if peer.UserID != user.ID || peer.AccessHash != user.AccessHash {
			t.Errorf("avatar peer = %#v for user %d", peer, user.ID)
		}
		return "https://avatar/" + user.Username
	})

	if len(rows) != 2 {
		t.Fatalf("mapContacts() length = %d, want 2: %#v", len(rows), rows)
	}
	first := rows[0]
	if first.ID != 1 || first.Name != "Ada Lovelace" {
		t.Errorf("rows[0] = %#v, want Ada Lovelace", first)
	}
	if first.PeerID != encodePeerID("user", 1, 111) {
		t.Errorf("Ada peer id = %q, want user:1:111", first.PeerID)
	}
	if !first.Online || first.Status != PresenceOnline {
		t.Errorf("Ada presence = online %v status %q, want online", first.Online, first.Status)
	}
	if first.ColorIndex != contactColorIndex(1) {
		t.Errorf("Ada color = %d, want %d", first.ColorIndex, contactColorIndex(1))
	}
	// A user without a name falls back to the username.
	if cid := rows[1]; cid.ID != 6 || cid.Name != "cid" || cid.PeerID != encodePeerID("user", 6, 666) {
		t.Errorf("rows[1] = %#v, want cid user:6:666", cid)
	}
	if avatarCalls != 2 {
		t.Errorf("avatar resolver called %d times, want 2 (only survivors)", avatarCalls)
	}

	if rows := mapContacts(nil, 0, nil); rows != nil {
		t.Errorf("mapContacts(nil) = %#v, want nil", rows)
	}
	// Different self id: the account row is now a normal contact.
	rows = mapContacts(found, 0, nil)
	if len(rows) != 3 || rows[0].ID != 1 || rows[1].ID != 5 || rows[2].ID != 6 {
		t.Errorf("mapContacts(self=0) = %#v, want [1 5 6]", rows)
	}
}

func TestMapContactsOfflinePresence(t *testing.T) {
	bob := testUser(10, 1, "Bob", "", "")
	bob.SetStatus(&tg.UserStatusOffline{WasOnline: 1700000000})
	found := &tg.ContactsContacts{
		Contacts: []tg.Contact{{UserID: 10}},
		Users:    []tg.UserClass{bob},
	}
	rows := mapContacts(found, 0, nil)
	if len(rows) != 1 {
		t.Fatalf("mapContacts() = %#v", rows)
	}
	if rows[0].Online || rows[0].LastSeen != 1700000000 || rows[0].Status != PresenceOffline {
		t.Errorf("Bob presence = %#v, want offline lastSeen=1700000000", rows[0])
	}
}
