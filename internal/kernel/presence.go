package kernel

import "github.com/gotd/td/tg"

// Presence* are the values of ChatDTO.Status, ChatProfileDTO.Status and
// ChatEvent.Status. They mirror the UserStatusKind union the frontend renders:
// "online" | "offline" | "recently" | "lastWeek" | "lastMonth" | "hidden".
const (
	PresenceOnline    = "online"
	PresenceOffline   = "offline"
	PresenceRecently  = "recently"
	PresenceLastWeek  = "lastWeek"
	PresenceLastMonth = "lastMonth"
	PresenceHidden    = "hidden"
)

// mapUserPresence converts a Telegram userStatus into the compact presence shape
// the chat list, chat header and profile panel consume.
//
// Privacy semantics: Telegram only exposes an exact last-seen time through
// userStatusOffline. The "recently" / "lastWeek" / "lastMonth" buckets are
// already the server's privacy-filtered answer, so no timestamp is invented for
// them (LastSeen stays 0) and the online expiry is not presented as a last-seen
// time either. userStatusEmpty means the user never set a status (or the client
// may not see it), which surfaces as "hidden" rather than an offline timestamp.
func mapUserPresence(status tg.UserStatusClass) (online bool, lastSeen int64, kind string) {
	switch value := status.(type) {
	case *tg.UserStatusOnline:
		return true, 0, PresenceOnline
	case *tg.UserStatusOffline:
		return false, int64(value.WasOnline), PresenceOffline
	case *tg.UserStatusRecently:
		return false, 0, PresenceRecently
	case *tg.UserStatusLastWeek:
		return false, 0, PresenceLastWeek
	case *tg.UserStatusLastMonth:
		return false, 0, PresenceLastMonth
	case *tg.UserStatusEmpty:
		return false, 0, PresenceHidden
	default:
		// Missing status on a user entity is the same as userStatusEmpty.
		return false, 0, PresenceHidden
	}
}

// userPresence is mapUserPresence for a dialog/profile entity. Bots and the
// logged-in account (Saved Messages) have no presence row on Telegram Web, so
// they keep the zero values and the JSON fields stay omitted.
func userPresence(user *tg.User, selfID int64) (online bool, lastSeen int64, status string) {
	if user == nil || user.Bot || (selfID != 0 && user.ID == selfID) {
		return false, 0, ""
	}
	raw, _ := user.GetStatus()
	return mapUserPresence(raw)
}
