# Architecture

## Product boundary

tgdesk is a Windows desktop shell around tdl. It owns:

- the Wails window and WebView2 host;
- the React UI;
- portable file locations;
- a thin, UI-agnostic Go kernel that calls tdl/gotd.

It does not fork tdl or patch upstream packages. Upgrade tdl by changing the Go
module versions and rebuilding.

## Layers

```text
┌──────────────────────────────────────────────────────────────┐
│ React UI                                                     │
│ App.tsx · components/* · hooks/* · locales/*                 │
└─────────────────────────────┬────────────────────────────────┘
                              │ generated bindings
┌─────────────────────────────▼────────────────────────────────┐
│ internal/app.Service                                         │
│ Wails adapter: methods + auth:event/download:event emitters  │
└─────────────────────────────┬────────────────────────────────┘
                              │ Go calls
┌─────────────────────────────▼────────────────────────────────┐
│ internal/kernel.Service                                      │
│ auth · session · chats/messages/media · downloads · tdata    │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────┐
│ iyear/tdl + gotd/td + WebView-free Go standard library       │
└──────────────────────────────────────────────────────────────┘
```

Ownership rules:

- `internal/app` must not contain Telegram logic. It translates binding calls
  and forwards events.
- `internal/kernel` must not import Wails or React concepts. It returns DTOs and
  emits plain Go callback events.
- The React app must not parse Telegram internals. It consumes DTOs and opaque
  chat IDs.
- `frontend/bindings/**` is generated. Change the Go signature/DTO, regenerate,
  then update React.

## Startup and window

`main.go`:

1. Registers the `auth:event` / `download:event` payload types and creates
   `kernel.Service` + `app.Service`.
2. Ensures portable directories exist (`paths.Ensure`).
3. Migrates the old profile-backed WebView state once.
4. Creates the Wails application with a frameless window.
5. Starts with a 1107×725 client area unless the primary work area is smaller.
6. Sets the WebView2 user-data directory to `<root>/data/webview`.
7. Enables `--remote-debugging-port=9222` only when `TGDESK_WEBVIEW_DEBUG=1`.

The caption bar is `frontend/src/components/layout/TitleBar.tsx`; it uses the
Wails runtime `Window` API for minimise/maximise/close and CSS
`--wails-draggable` for dragging.

### Detached media viewer window

- `app.Service.OpenMediaViewer(payload)` stores the serialized viewer session in
  memory and opens (or reuses) a second frameless Wails window named
  `media-viewer` that loads `/viewer.html?session=...`; the page reads the
  session through `TakeMediaViewerState`.
- Window size follows the media aspect ratio, capped at 86% of the primary work
  area, and the last used size is reused. The window is centred on open.
- Closing the main window closes the viewer; closing the viewer focuses the main
  window again.
- The viewer has no chat state. It loads video stream URLs and starts downloads
  itself through the same bindings, and reports forward/delete/show-in-chat
  through the `mediaViewer:action` event so the chat window runs its own
  dialogs.

### Bot mini apps

- Bot Web Apps are rendered **inside the main window** by the React
  `MiniAppOverlay` (sandboxed iframe, Telegram Web K frame). There is no
  separate Wails window any more.
- The backend surface stays minimal: `kernel.RequestBotWebView(...)` asks
  Telegram for the authenticated URL through `messages.requestWebView` (platform
  `web`, reply-to for keyboard buttons, `from_bot_menu` for menu launches) and
  `app.Service.RequestBotWebView` forwards it to the UI, which owns the overlay,
  the iframe lifecycle and the browser fallback.
- The old `mini-app` window, its `/miniapp.html` wrapper, `OpenBotWebView` /
  `OpenMiniApp` / `TakeMiniAppState` bindings and the `MiniAppWindowName`
  close-on-exit wiring were removed when the overlay landed.

## Kernel state and concurrency

`internal/kernel.Service` owns:

- auth state (`authMu`, auth channels, cached `AuthUser`);
- one shared Telegram session (`sessionMu`, `session`);
- write serialization (`chatMu`); reads (dialogs, history, members, folders)
  run concurrently so a slow/retried auxiliary call cannot block the chat view;
- a short-lived dialogs cache (20 s, invalidated on archive, mute and pin changes
  and session reset) to keep chat-list re-renders cheap and avoid duplicate
  `messages.getDialogs` flood waits. Dialog mapping reads `dialog.folder_id`;
  folder 1 is marked archived even when it appears in the main dialog response;
- download tasks and their persistence (`downloadMu`, `downloadSem`);
- sticker/GIF picker caches (`stickerCacheMu`: installed sets, recent stickers,
  set details, saved GIFs) and the opaque document-ref side map (`stickerRefsMu`,
  bounded at 4096 entries); both are cleared on session reset;
- a bounded in-memory image cache and the loopback image server.

The shared session is keyed by proxy + NTP. The first call creates a tdl client,
opens the `tgdesk` namespace in the tdl bbolt DB and waits for ping. A call with
a different proxy/NTP closes and recreates it. Downloads, image requests and chat
requests reuse this client.

Chat operations are serialized because they share the client and the kernel
wants predictable ordering. Downloads use their own semaphore (two active
tasks) and run in goroutines.

## Authentication

`internal/kernel/auth.go`:

- Starts QR or phone login through tdl/gotd.
- Emits structured `AuthEvent` callbacks (`starting`, `qr`, `code`, `password`,
  `success`, `error`) that `internal/app` forwards as Wails `auth:event`.
  Events carry QR expiry, code type/length/timeout, resend state, 2FA hint,
  flood-wait seconds and the exported tdata path.
- Phone login is implemented directly (sendCode → signIn → checkPassword)
  instead of `auth.Flow`, so the UI can offer resend, show the delivery method
  and retry an invalid code without restarting the flow.
- Keeps QR/phone/2FA channels for the React steps.
- Verifies a session only when both the tdl session and the completed-login
  marker exist; an abandoned QR attempt is not "logged in".
- `AuthStatus` first attempts to import a portable Telegram Desktop `tdata`; a
  completed imported login is returned as authorized, so the frontend opens the
  chat shell without showing the login card.
- Stores the cached `AuthUser` in the session namespace.
- On success, calls `exportTelegramDesktopTData` and reports the result to the
  UI (best effort: a failed export does not fail the login).

Phone login supports Telegram's login-token DC migration. Proxy credentials are
kept in memory and intentionally excluded from `localStorage`.

The authentication client is separate from the shared chat/download session;
after login the kernel stops the auth client and the next chat call creates the
shared session.

## Official Telegram Desktop tdata

### Import

`tdesktop_import.go`:

- Detects official `key_data*` files in `<root>/tdata`.
- Reads the MTProto authorization with `gotd/td/session/tdesktop`.
- Imports into `<root>/data/tgdesk`.
- Backs up the existing tgdesk session to `data/tgdesk.bak`.
- Records a source fingerprint in `data/.telegram-desktop-import` so the same
  tdata is imported only once. A matching marker is trusted only while the
  stored session still has its completed-login user record: an abandoned QR
  session is replaced by the tdata session on the next start, while a missing
  session (logout) stays logged out. Import also compares the authorization
  identity (user id + main DC + key id), so Telegram Desktop rewriting its files
  does not re-import the same login and does not replace the cached display
  name with the import placeholder.
- Only reads the official files.

Passcode-protected tdata is unsupported; import reports an error and QR login
remains available.

### Export

`tdesktop_export.go` writes a no-passcode Telegram Desktop-compatible tdata:

- `key_datas` (local key wrapped by the empty-passcode key)
- `D877F783D5D3EF8Cs` (MTP authorization, official wide-id serialization)
- `D877F783D5D3EF8C/maps` (account map)
- `data/tdata-export.json` (non-Telegram bookkeeping)

Modern clients only keep the `s` suffix, so only `s` files are written and
legacy `0`/`1` variants are removed. Existing official auth files are copied to
`data/tdata-backup/` first. The generated tdata was validated with official
portable Telegram Desktop 7.2.5: it reads the accounts info, map and MTP
authorization, and starts the account. Only the main DC key is exported;
Telegram Desktop fills the rest while connecting.

`tdata/` is reserved for official files. tgdesk session state always lives in
`data/`.

## Chats, messages and media

`internal/kernel/chats.go`:

- `GetChats` uses `query.GetDialogs`, maps users/chats to `ChatDTO`, and encodes
  peer IDs as opaque `kind:id:accessHash` strings. Avatar URLs are built from the
  `userProfilePhoto`/`chatPhoto` embedded in the dialog response, so no extra
  full-user call is required just to show an avatar.
- `GetMessages` uses `MessagesGetHistory` (latest 50 by default), maps normal
  messages **and service messages** to `MessageDTO`, then reverses the list to
  oldest-first. Thumbnails (`media.thumbUrl`), full photos (`media.photoUrl`) and
  sender avatars (`senderAvatarUrl`) are registered with the loopback image
  server while mapping. Replies whose target is older than the page are resolved
  in one batch so the quote shows the original text.
- `SendMessage` uses `MessagesSendMessage` with a nanosecond `RandomID` and an
  optional `InputReplyToMessage`.
- `EditMessage`, `DeleteMessages` and `ForwardMessages` cover the Telegram Web
  message actions; channel revokes go through `channels.deleteMessages`.
- `GetChatInfo` runs one `MessagesGetSearchCounters` request per peer (counters
  cached for 60 seconds, like Telegram Web) to decide which chat-info tabs
  exist. `GetSharedMedia` pages a tab with `MessagesSearch` and the matching
  `InputMessagesFilter*` (PhotoVideo, Document, URL, Music, RoundVoice, GIF),
  mapped through the same message pipeline as history. `GetChatMembersPage`
  pages supergroup participants with `ChannelsGetParticipants` offsets and
  returns the whole participant list of a basic group at once.
- `GetChatMembers` remains as the first-page wrapper used by older callers and
  sorts admins first.
- `GetChatProfile` (`chat_profile.go`) loads the full peer once with
  `UsersGetFullUser`, `MessagesGetFullChat` or `ChannelsGetFullChannel` (60 s
  cache, like `GetChatInfo`) and maps the info-panel/composer shape: detected
  type (`user`/`bot`/`saved`/`group`/`channel`, Saved Messages = self peer),
  bio/description, username and every active username (`usernames[]`, preferred
  first), contact-only phone, member/subscriber count, channel admin count,
  star-gift count (`giftsCount`, from `stargifts_count`, decides the Web K Gifts
  tab), visible-member flag, admin/owner/forum flags, invite link (best effort),
  linked discussion chat (`linkedChatId` plus the mapped `linkedChat` DTO when
  the full-info response carried the entity), bot commands/menu
  button/privacy URL. Saved Messages (peer self) additionally gets
  `messagesCount` from one `messages.getHistory` page for the "N messages"
  header subtitle. Send rights are derived from the tweb `hasRights` logic
  (creator; broadcast channels need `post_messages`;
  megagroups need membership and no `send_messages` ban; `send_plain` only
  blocks text; `send_stickers`/`send_gifs` block the picker
  tabs; slow mode is reported separately so the
  composer can count down).
- `SetChatMuted` / `SetChatPinned` write server state:
  `account.getNotifySettings` + `account.updateNotifySettings` (the update
  replaces every field, so the current settings are merged) and
  `messages.toggleDialogPin`. Both clear the dialogs cache.
- `SendBotCallback` presses an inline-keyboard callback with
  `messages.getBotCallbackAnswer`, maps `FLOOD_WAIT`/`BOT_RESPONSE_TIMEOUT` to
  readable errors, returns alert/url/cache time, re-reads the pressed message and
  emits it as a `chat:event` `edit` so the bubble and keyboard refresh even when
  the callback RPC was the only update carrier.
- `RequestBotWebView` returns the authenticated mini-app URL
  (`messages.requestWebView`, platform `web`, reply-to for keyboard buttons and
  `from_bot_menu` for menu launches). `MessageButtonDTO` carries the 0-based
  `row` and the MTProto `style` (`primary`/`danger`/`success`), and
  `KeyboardButtonSimpleWebView` maps to the separate `webview_simple` kind so the
  UI never calls `requestWebView` for a simple webview.

DTO families:

- `MessageDTO`: text, sender, time, outgoing/check state, forward header,
  service action fields, media, sender avatar URL.
- `MessageMediaDTO`: kind (`photo`, `video`, `audio`, `file`, `poll`,
  `location`, `contact`), name/size/ext/MIME, dimensions/duration, poll
  options/votes, coordinates, contact phone, thumbnail/photo URLs.

Frontend mapping is centralized in `frontend/src/data/telegram.ts`, including
date/time formatting, media normalization and localized service-message text.

Images are loaded natively through loopback URLs (`/thumb`, `/avatar`, `/photo`)
and cached by the WebView; the kernel keeps only a bounded in-memory image cache.
The old `data/thumbs` and `data/avatars` per-image files are no longer written and
are removed on startup. Video/conversation scrolling stays lazy.

### Stickers and GIFs

`internal/kernel/stickers.go` + `stickers_media.go` back the emoji picker's
Sticker and GIF tabs with the layer-222 `messages.*` sticker family (this TL
layer has no `stickers.getStickerSet`):

- `GetStickerPacks` runs `messages.getAllStickers` and
  `messages.getRecentStickers` concurrently, filters mask/custom-emoji sets and
  returns the recent row (max 20) plus installed-set headers. Set covers use
  `InputStickerSetThumb` (`stickerSetCoverMedia`) when the set carries a
  thumbnail; `GetStickerSet` additionally falls back to the first sticker's still
  thumb so a cover appears once the section loads.
- `GetStickerSet` calls `messages.getStickerSet` with hash 0 (the method is not
  paginated; every document is returned) and maps all documents.
- `GetSavedGifs` calls `messages.getSavedGifs`.
- `SendSticker`/`SendGif` re-send an existing document with
  `messages.sendMedia` + `inputMediaDocument` (no upload) and
  `update_stickersets_order` for stickers. Rights/slow-mode/flood-wait failures
  are mapped to readable errors from the server answer; `FILE_REFERENCE_*`
  triggers one refetch of the source list (recent/set/saved-GIFs) and one retry.
- Documents are addressed by opaque refs (`sdoc1_…`), sets by `sset1_…`; the
  actual `*tg.Document` lives in a bounded kernel side map so a ref never leaks
  `access_hash`/`file_reference` into the UI. Thumbnails and full TGS/WebM/MP4
  payloads are registered with the existing loopback image server
  (`registerImage`/`imageURL`), using a picker-specific ≤100 px thumb chooser and
  extension-correct media names so `mediaMime` yields `image/webp`,
  `application/x-tgsticker`, `video/webm`, `video/mp4`, etc.
- Installed sets (5 min), recent stickers (60 s), set details (30 min) and saved
  GIFs (60 s) are cached in memory. `UpdateStickerSets`/`UpdateNewStickerSet`/
  `UpdateStickerSetsOrder`/`UpdateMoveStickerSetToTop` drop the set caches,
  `UpdateRecentStickers`/`UpdateSavedGifs` drop their list, and every successful
  send invalidates the matching cache. The session reset clears everything,
  including the ref side map.

### In-app Telegram links and membership actions

`internal/kernel/links.go` routes `t.me` / `telegram.me` / `telegram.dog` /
`tg://` clicks without opening the system browser:

- `classifyTelegramLink` is a pure parser: exact host allow-list (plus the
  `<username>.t.me` form), no userinfo/ports, `t.me/<name>[/<post>[/<thread>]]`,
  `t.me/s/<name>`, `t.me/c/<id>/<post>`, `t.me/+<hash>` / `joinchat/<hash>`,
  `tg://resolve|join|joinchat|user|privatepost`. Known non-chat sections
  (`addstickers`, `boost`, `call`, …) and `t.me/+<phone>` classify as
  unsupported; `javascript:`/`data:` and other schemes never pass the guard.
- `ResolveTelegramLink` resolves public usernames/posts with
  `contacts.resolveUsername` (returns a `ChatDTO` even when the peer is not in
  the dialog list), private post links through the live peer index +
  `channels.getChannels` (no access hash in the link; errors instead of guessing),
  invites with `messages.checkChatInvite` (title/members/already-member chat) and
  `tg://user?id` through the peer index + `users.getUsers` when cheap.
- `JoinByInvite` uses `messages.importChatInvite` then re-checks the invite for
  the joined `ChatDTO`; `JoinPublicChat` uses `channels.joinChannel`;
  `LeaveChat` uses `channels.leaveChannel` for channels/supergroups and
  `messages.deleteChat` for basic groups. Join/leave invalidate the dialogs and
  per-chat profile/info caches. Invite expiry, invalid hashes, pending join
  requests, channel limits and flood waits become readable errors.
- `GetMessagesAround(chatID, messageID, limit)` loads one `messages.getHistory`
  page ending at the target id (limit clamped 20–100, page not written to the
  local snapshot cache) and reports whether the target was found, so a t.me post
  link can be focused even when older than the newest history page.

## Local snapshots and fast paint

`data/cache/chats.json` stores the last main dialog list and
`data/cache/messages/<sha1>.json` stores the latest 50 messages for every chat
the user has opened (capped at 300 files, oldest pruned). The snapshots are
written asynchronously after a successful network call, with all process-local
loopback image URLs stripped. `GetCachedChats` / `GetCachedMessages` never touch
the network; the React app paints them first and replaces them in place when
`GetChats` / `GetMessages` return. This is the local-database-first behaviour of
official clients without adding a second database dependency. Logout removes
`data/cache/`.

## Live updates

The shared session is created with a `telegram.UpdateHandler`
(`internal/kernel/live.go`):

- A `tg.UpdateDispatcher` handles new/edit/delete messages (normal + channel),
  reaction changes, read receipts and channel-too-long updates.
- Short updates (`updateShortMessage`, `updateShortChatMessage`,
  `updateShortSentMessage`) bypass the dispatcher; short private messages are
  mapped directly, while short group messages and `updatesTooLong` request a
  frontend resync instead of rendering a sender-less bubble.
- Each event becomes a `ChatEvent` (`message`, `edit`, `delete`, `reaction`,
  `read`, `readOutbox`, `resync`) emitted as `chat:event`. The frontend merges it
  into the open history and chat list, or reloads on a resync.
- A peer index (`user:id`, `chat:id`, `channel:id` → opaque chat id) is populated
  from dialogs/history so short updates can be routed without entities.

Live updates are best-effort while connected. There is no persisted updates
sequence/gap recovery; `UpdatesTooLong` and channel gaps trigger a reload. As a
safety net the frontend polls `GetNewMessages(chatID, afterID)` every two seconds
for the open chat only. That method asks Telegram for history newer than the
newest rendered message id (`min_id`), so transient update-stream gaps cannot
leave the conversation stale, and existing media URLs are not re-registered or
re-downloaded by the poll. Focus/visibility changes trigger an immediate delta
sync.

## Attachments, reactions and albums

- `SendAttachment` opens the file, detects its MIME type, uploads it with
  gotd's uploader (512 KiB parts, four threads) and sends a photo, video, audio
  or plain document with an optional caption/reply. Progress is emitted as
  `upload:event`.
- `SendReaction` toggles an emoji reaction through `messages.sendReaction`;
  reactions are also mapped from history and live updates into `MessageDTO`.
- `MessageDTO` carries Telegram text entities, inline-keyboard buttons, views,
  signatures, edited/ttl flags, premium sender emoji-status URLs, and rich media
  metadata (waveforms, poll solutions, checklist items, invoices, giveaways,
  paid media).
- The message surface follows Telegram Web K's 15 px/5 px bubble geometry, 480 px
  text width, doodle wallpaper canvas, fixed avatar gutter, grouped avatars and
  fully rounded bubbles. Media use intrinsic aspect ratio; voice/audio/TGS
  stickers stream from the loopback range endpoint.
- `MessageDTO.GroupedID` carries Telegram's album id as a string (int64-safe).
  The frontend groups consecutive messages with the same id into one mosaic
  bubble; forward/delete/download actions use all album message ids.
- `ChooseFiles` wraps the native Wails multi-file picker.

## Downloads

`internal/kernel/downloads.go` + `download_store.go`:

- Resolve the selected message, extract media with `core/tmedia`.
- Fresh files use tdl's multi-connection `core/downloader` through the
  configurable tdl DC pool (`--pool`, default 8); per-file threads (`--threads`,
  default 4), concurrent items (`--limit`, default 2), reconnect window
  (`--reconnect-timeout`, default 5 min), takeout clients (`--takeout`) and
  `--skip-same` / `--rewrite-ext` are wired from Settings → Downloads.
- Write to `<name>.tmp`, verify the final byte count and rename on success.
- Persist task metadata to `<root>/data/downloads.json`.
- Emit `download:event` for progress/speed/ETA/state; each task carries its
  chat/message ids and media kind so the chat-info panel can draw inline
  progress badges and a downloaded-only filter without changing views.
- Read state is server-owned: the shell calls `MarkChatsRead` when a chat is
  opened/focused and coalesces new-message read updates for the visible chat,
  so `GetChats` cannot resurrect an unread badge the user already cleared.
- A done task records the delivered path only. Every read/click stats it first
  (Telegram Desktop keeps a downloaded-path log too): existing file → open its
  folder; missing file → forget the record and fetch the media again. Colliding
  destination names get Telegram's `name (2).ext` suffix instead of overwriting.
- A paused file keeps its `.tmp`; resume aligns to a 4 KiB boundary and fetches
  the missing tail as parallel 1 MiB `upload.getFile` ranges through the same
  tdl pool (the old sequential range loop was the slow path). CDN locations fall
  back to a full tdl transfer.
- Removing a task cancels its writer, waits for it and deletes the `.tmp`; only a
  task that owns a stored partial path may resume it, so an orphaned file from a
  removed task can never be stitched into a new download.
- Starting a download for a message that already has an active/queued/paused
  task returns that task instead of opening the same `.tmp` twice.
- On restart, active/queued tasks become paused; the user resumes from the stored
  byte offset. The UI offers one Pause all / Resume all toggle.
- The default destination is `<root>/downloads`; the Settings template is
  evaluated with tdl `tplfunc`. Files are grouped below it by Telegram mobile
  categories using language-neutral English folders (`Images`, `Videos`, `GIFs`,
  `Audio`, `Voice`, `Stickers`, `Files`).

## Frontend architecture

`frontend/src/App.tsx` is the composition root:

- auth gate and login/main switch;
- chat list, selected chat and message loading;
- language, proxy and download settings effects;
- Wails event subscriptions;
- toasts, download state and the settings dialog.

State split:

- Backend data arrives through generated bindings and is mapped to UI models.
- Language, proxy (without the password in plain text), download and composer
  preferences are in `localStorage`.
- Composer drafts use `tgdesk.draft.<chatId>`.
- No Telegram credential is stored in React state beyond the in-memory auth flow.

Component layers:

- `components/auth` — one component per login step plus `CountryPicker`,
  `LoginLoading`, `BrandMark` and the proxy sub-panel. `LoginShell` owns the
  page surface; `LoginScreen` owns the state machine and `auth:event` handling.
- `components/chat` — conversation is split into header, search, list, bubble
  with hover/context actions and the Telegram Web K inline bot keyboard
  (`BotKeyboard`), media thumbnail, forward picker, the Telegram Web K composer
  panel (`composer/`: one floating plate with reply/edit header, bot menu pill,
  `/` command autocomplete, slow-mode hint, attach menu, send/mic button and the
  MessageComposer/FooterPlate/StartPlate/MessagingDisabledBar capability switch),
  the emoji picker (`EmojiPicker` + `src/data/emoji*.ts`) with its Telegram Web K
  sticker/GIF tabs (`picker/`: set rail, lazy sections, saved-GIF grid, preview
  overlay, `src/lib/stickerApi.ts` RPC cache), and the right chat-info pane
  (`ChatInfoPanel` + `PeerQrDialog`: per-type title/action tiles, expandable bio
  card, profile rows, link/QR row, shared-media tabs). Broadcast channels that
  cannot be posted in use `ChannelBar`'s mute footer.
- `src/lib/telegramLinks.ts` — the single in-app link router used by message
  text, mentions, profile rows, bot URL buttons and web previews: classifies
  t.me/telegram.me/tg:// links, hands them to the App-level
  `ResolveTelegramLink`/join navigator and falls back to the system browser for
  everything else.
- `components/chat/MiniAppOverlay` + `src/lib/miniAppTheme.ts` — the in-app bot
  Web App overlay: a floating Telegram Web K style panel inside the main window
  that embeds the authenticated URL (or a simple webview URL) from
  `messages.requestWebView` in a sandboxed iframe; theme params are injected in
  the URL hash. The former detached `miniapp.html` window entry is gone.
- `components/media` — the detached media viewer: Telegram Desktop style photo
  stage with zoom/pan/rotate and open/close flight, caption plate, album strip,
  file info/action row and the tdesktop video controls (volume, play/pause,
  speed, PiP, fullscreen, seek); `src/viewer` hosts the viewer window entry
  (`viewer.html`, dark tdesktop caption bar, `ViewerWindow`) that loads the
  session handed over by the backend.
- `components/layout` — caption bar, shared app menu and conversation list.
- `components/settings` — the F settings dialog, composed from `src/ui` fields,
  segmented control, switch, slider and select.
- `src/ui` — the F atom layer (Radix Themes backed): buttons, fields, menu,
  dialog, callout, badge, chip, empty state, avatar, progress, spinner, toast,
  context menu and the Lucide icon map. Every feature imports these instead of
  recreating controls.
- `components/layout/shell-f.css`, `components/downloads/downloads-f.css`,
  `components/settings/settings-f.css` and `components/chat/dialogs-f.css` —
  feature layout that composes the atoms.

Styling:

- `styles/tokens.css` keeps the legacy `--app-*` aliases used by the chat media
  and window CSS, defined directly from F values (no Material roles).
- `styles/base.css` owns element defaults, focus-visible rings, scrollbars and
  the reduced-motion guard. The Material Symbols helper is gone.
- `src/ui/f.css` owns the F canvas/surface/typography tokens and the shared
  field/dialog/menu patterns. Feature CSS is layout-only and must not invent
  raw colours or one-off control styles.
- `frontend/src/data/countries.ts` holds the ISO/dial-code table; display names
  are localized at runtime with `Intl.DisplayNames`.
- Layout is designed for the 1107×725 reference window and verified with CDP
  screenshots.

## Wails events

- `auth:event` — auth state transitions.
- `download:event` — task updates/removal.
- `chat:event` — live message/edit/delete/reaction/read/resync events.
- `upload:event` — attachment upload progress/completion/failure.
- `mediaViewer:action` — forwarded from the detached viewer window to the chat
  window (`kind`: forward/delete/showInChat, `chatId`, `messageIds`).

Generated event bindings live under `frontend/bindings`. If an event payload or
name changes, update both Go and the frontend subscription and regenerate.

## Persistence summary

| Data | Location | Notes |
|---|---|---|
| tdl session + cached user | `data/tgdesk` | bbolt, tgdesk namespace |
| Legacy session backup | `data/tgdesk.bak` | after tdata import |
| Official tdata backup | `data/tdata-backup/` | after export |
| Last tdata export | `data/tdata-export.json` | user/DC/key id/path for the UI |
| Import fingerprint | `data/.telegram-desktop-import` | prevents re-import loops |
| Download metadata | `data/downloads.json` | portable task store |
| Image cache | memory + `data/webview/` | loopback URLs; no JPEGs beside the exe |
| WebView state | `data/webview/` | language/settings/drafts/HTTP image cache |
| Official tdata | `tdata/` | never tgdesk session files |
| Download output | `downloads/` | configurable in settings |

## Extension points

- **New Telegram operation:** add a kernel method with DTOs, wrap it in
  `internal/app.Service`, regenerate bindings, call it from App/UI.
- **New UI page:** create a `components/<area>` component and CSS, wire it in
  `App.tsx` or the settings dialog, add locale keys, verify with a screenshot.
- **New settings field:** add it to `AppSettings` + `defaultSettings`, add a
  control, persist via `useSettings`, and apply any DOM effect in `App.tsx`.
- **New event:** define a plain Go event struct, call the sink from the kernel,
  emit from `internal/app`, subscribe in App, regenerate bindings.
- **New language:** add `frontend/src/locales/<code>.ts`, register it in
  `i18n.ts`, extend the language selectors, verify long strings.

## Known technical debt

- Bot mini apps are embedded in a plain WebView2 iframe with no Telegram JS
  bridge: `web_app_data_send` (sendWebViewData), `prolongWebView` renewal and
  close events are not forwarded to the bot yet. `BotCallbackResultDTO` returns
  alert/url/message/cache-time only, so non-alert callback toast text is not
  surfaced.
- `botOwnerId` is empty: this TL layer does not expose a bot owner field.
- Sticker/GIF picker v1 has no search (`messages.searchStickers`, inline-bot GIF
  search), no favorites/clear-recent, no set install/uninstall/archive, and no
  `messages.saveRecentSticker`/`messages.saveGif` upkeep: recents are whatever
  the server returns, refreshed after a send. The Gifts tab data source
  (`payments.getSavedStarGifts`) is not implemented; the profile only exposes the
  `stargifts_count` that decides the tab. Set covers for sets without `Thumbs`
  appear only after the set detail loads.
- Telegram link routing v1 supports chat/post/invite/user links only; forum
  thread/comment params are parsed but ignored, phone-number links, masked-link
  warnings, `t.me` addstickers/boost/… sections and private-post links to channels
  the account has never seen are unsupported or return a readable error (one
  toast, never the system browser).
- History loads 50 messages at a time and paginates on demand; live updates are
  delivered while the client is connected but there is no persisted updates
  gap-recovery state.
- Only the main-DC auth key is exported to tdata; Telegram Desktop fills the
  remaining DC keys when it connects.
- Passcode-protected tdata is unsupported.
- `chat.css` still contains legacy structural class names for message media;
  the palette is F, but individual media shapes can be refined opportunistically.
- Reference screenshots of a private account must never be committed; use the
  isolated-home workflow for visual checks.
- Non-Windows build scaffolding exists but is not release-tested.
