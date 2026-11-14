package kernel

import (
	"testing"

	"github.com/gotd/td/tg"
)

func TestContactColorIndex(t *testing.T) {
	cases := map[int64]int{
		0:         0,
		1:         1,
		7:         0,
		8:         1,
		42:        0,
		-8:        1,
		-42:       0,
		123456789: 1,
	}
	for userID, want := range cases {
		if got := contactColorIndex(userID); got != want {
			t.Errorf("contactColorIndex(%d) = %d, want %d", userID, got, want)
		}
	}
}

func TestContactUsers(t *testing.T) {
	found := &tg.ContactsFound{
		MyResults: []tg.PeerClass{
			&tg.PeerUser{UserID: 1},
			&tg.PeerUser{UserID: 2},
		},
		Results: []tg.PeerClass{
			&tg.PeerUser{UserID: 2}, // duplicate of a personal result
			&tg.PeerUser{UserID: 3},
			&tg.PeerUser{UserID: 4}, // not present in Users: skipped
			&tg.PeerChat{ChatID: 9}, // chats are not contacts
		},
		Chats: []tg.ChatClass{&tg.Chat{ID: 9, Title: "Group"}},
		Users: []tg.UserClass{
			&tg.User{ID: 1, FirstName: "Ada"},
			&tg.User{ID: 2, FirstName: "Bob"},
			&tg.User{ID: 3, FirstName: "Cid"},
			&tg.UserEmpty{ID: 8},
		},
	}

	users := contactUsers(found, 10)
	if len(users) != 3 {
		t.Fatalf("contactUsers() length = %d, want 3", len(users))
	}
	for index, want := range []int64{1, 2, 3} {
		if users[index].ID != want {
			t.Errorf("contactUsers()[%d].ID = %d, want %d", index, users[index].ID, want)
		}
	}

	if limited := contactUsers(found, 2); len(limited) != 2 || limited[1].ID != 2 {
		t.Errorf("contactUsers(limit=2) = %#v", limited)
	}
	if users := contactUsers(nil, 10); users != nil {
		t.Errorf("contactUsers(nil) = %#v, want nil", users)
	}
	if users := contactUsers(found, 0); users != nil {
		t.Errorf("contactUsers(limit=0) = %#v, want nil", users)
	}
}

func TestUniqueUserIDs(t *testing.T) {
	ids, err := uniqueUserIDs([]int64{3, 1, 3, 2, 1})
	if err != nil {
		t.Fatalf("uniqueUserIDs: %v", err)
	}
	if len(ids) != 3 || ids[0] != 3 || ids[1] != 1 || ids[2] != 2 {
		t.Fatalf("uniqueUserIDs = %v, want [3 1 2]", ids)
	}
	if _, err := uniqueUserIDs([]int64{1, 0}); err == nil {
		t.Fatal("expected invalid user id error")
	}
	if ids, err := uniqueUserIDs(nil); err != nil || len(ids) != 0 {
		t.Fatalf("uniqueUserIDs(nil) = %v, %v", ids, err)
	}
}
