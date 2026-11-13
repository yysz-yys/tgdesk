# Changelog

## Unreleased

### Downloads

- The downloads header now uses one Pause all / Resume all toggle that follows
  the task state, and shows Open folder and Clear completed as plain icon
  buttons instead of hiding them in a dropdown.
- Download rows keep only the state action (Pause / Resume / Retry) and Cancel;
  the per-row Open folder button is gone, and the remaining action buttons sit
  farther apart so they are no longer cramped.
- Added Resume all next to Pause all in the downloads header; it starts every
  paused transfer with the same tdl core the individual rows use.
- Fresh transfers stay on tdl's multi-connection downloader (8-connection DC pool
  by default, like tdl itself); resumed files no longer fall back to a sequential
  single-connection range loop — the missing tail is fetched as parallel 1 MiB
  ranges through the same tdl DC pool.
- Removing a task now waits for its writer and deletes its partial `.tmp`, and a
  brand-new task only resumes a partial file that it owns. Re-downloading a file
  after removing its paused task therefore starts clean instead of stitching an
  orphaned temp file into the result.
- Duplicate clicks for the same message reuse the running task, and a completed
  transfer is size-checked before it is renamed into place, so short or corrupt
  files are reported as failed instead of being delivered.
- Chat-info file rows can start a download even when that message is not part of
  the chat's loaded history page.

### Chat info and history loading

- Chat info now mirrors Telegram Web's profile column: one
  `messages.getSearchCounters` call per peer (cached for a minute, like the web
  client) decides which shared-media tabs exist, so Files, Music, Voice and GIF
  tabs appear only when the chat actually contains those messages; groups open
  on Members, every other peer opens on the first available tab.
- Each chat-info tab pages its own server-side `messages.search` filter (photos
  and videos combined, documents, URLs, RoundVoice, music, GIFs) with infinite
  scroll instead of filtering the 50 messages already painted in the chat;
  Members pages through `channels.getParticipants` with the same 50-first-page
  behaviour as Telegram Web.
- The Media tab has Telegram Web's Photos/Videos filter menu (checkmarks in the
  header kebab, at least one half always enabled) and shows the matching
  "N photos, M videos" subtitle, switching between the combined photo+video
  filter and each half without leaving the tab.
- Shared-media items answer right-click with Telegram Web's per-category menu:
  Forward, Copy Media (images), Download, Show in chat, Select/Clear selection
  and Delete, with Copy/Download hidden for protected chats or non-media rows,
  so links, videos, music, voice, files and photos each get their own item set.
  Select starts a multi-select mode with a count/forward/download/delete bar.
- Chat-info lists follow the same rows as the web profile: a three-column media
  and GIF grid with duration/GIF badges, file rows with extension icon and size,
  link rows with preview and copy action, and music/voice rows sharing one
  player. New messages and deletions refresh the counter set and merge the
  newest page into the open tab.
- History no longer needs a "load older messages" button: reaching the top of
  the message list automatically requests the previous page, keeps the scroll
  anchored and fills a short viewport, matching Telegram Web and other chat
  platforms.

### Chat surface and loading

- Rebuilt the message surface around Telegram Web K metrics: 15 px/5 px bubble
  radii, fully rounded bubbles (no protruding tail), 4/9/5 px padding, 480 px
  column, inline time/checks, fixed avatar gutter, grouped sender avatars,
  doodle wallpaper, outgoing pale green / dark steel blue, reduced-motion-aware
  entry.
- Added rich text entities (bold, italic, underline, strike, code, pre,
  blockquote, spoiler, links) with a segment renderer that preserves Telegram's
  UTF-16 offsets.
- Added dedicated renderers for voice waveforms, audio, TGS/WebM stickers, GIFs,
  posters, web previews, polls/quizzes, checklists, invoices, giveaways, paid
  media, stories, games, dice, contacts and locations; inline keyboard buttons.
- Media now uses intrinsic aspect ratio (capped at 420 px), full-bleed photos
  and albums, and overlay timestamps; portraits are no longer forced into a
  360×220 crop.
- Media-only photos/videos/GIFs/albums no longer paint a bubble or `<img>`
  background plate; transparent PNGs show the wallpaper like Telegram Web.
- Captioned portrait photos keep their natural height and fill a wider caption
  bubble with a blurred copy of the photo instead of leaving a white side band.
- Stickers, GIFs and media-only photos keep the same 15 px rounded corners as
  Telegram Web; stickers get the translucent timestamp overlay and no square
  card edges.
- Media-only portrait photos keep the intrinsic narrow frame used by Telegram
  Web; the blurred side fill is reserved for captioned portraits. Media sender
  names get a bubble-coloured header band instead of floating on the wallpaper.
- Web-page previews are a wide image-under-text card using the full preview
  photo when available and the thumbnail as fallback; removed the tiny right-hand
  thumbnail and its empty white area.
- Added local dialog/message snapshots under `data/cache/` and `GetCachedChats` /
  `GetCachedMessages`; the WebView paints them before the network answer
  (measured ~0.3 s to first messages on reload).
- Removed the legacy F-shell message overrides so one message stylesheet owns
  the surface.
- Reactions moved from a detached pill row into the bubble footer, sharing the
  bubble background with the timestamp; removed the permanent `+` circle.
- Custom emoji reactions now stream their Telegram document thumbnail and toggle
  with the custom emoji document id instead of a placeholder glyph.
- Sender names now sit inside the top of the bubble like Telegram Web, with the
  premium custom-emoji status resolved from `user.emoji_status` and rendered
  next to the name.
- The archive search field is hidden by default and replaces the archive title
  row when Search is chosen; back arrow, input and close button share one row.
- All dropdowns share one quiet gray highlight; the blue selected row is gone.
- Sidebar icon buttons no longer show the saturated blue focus outline after
  clicking/closing a menu; keyboard focus uses a quiet gray background instead.
- Incoming rows always reserve the same 40 px avatar gutter, with the avatar
  wrapper absolutely positioned in it, so rows that do show an avatar and
  grouped continuation rows share exactly the same bubble left edge.
- WebView2 HTTP/JS cache is cleared once whenever the executable changes, so a
  rebuilt UI can no longer be masked by a stale cached `index.html`; cookies,
  localStorage and the Telegram session are preserved.
- The archived row's chat count is now plain muted text instead of a blue
  unread-style badge; the app-menu archived entry uses the same neutral count
  and its hover/highlight state is quiet gray rather than the accent fill.
- Archived chats no longer jump back into the main list when a new message
  arrives: main/archive dialog duplicates are merged with the archived flag
  winning, and the archived row's preview/unread is updated in place.
- The archive header menu now has exactly Search, Hide/Show in Chat List and Mark
  all as read; hiding the archive row is persisted and the archive remains
  reachable from the app menu.
- Mark all as read now calls `messages.readHistory` / `channels.readHistory`
  server-side for every archived unread chat, instead of only changing the local
  unread counter.
- Dialog rows now honour Telegram's `dialog.folder_id == 1`, so archived peers
  stay archived even when only the main dialog query has answered.
- Folder selector now shows "所有" plus the user-created folders only (no
  synthetic Unread tab). It is a dropdown when custom folders exist and a plain
  "所有" label when they do not. The archived row uses normal chat-row geometry
  and only appears under "所有"; custom folders exclude archived peers.
- Removed the bubble tail/foot and the hover three-dot circle. Every incoming
  row in a group chat reserves the same avatar gutter, so short and long bubbles
  share one left edge.
- Dark-theme audit: message text, time, reply quotes, captions, code and media
  cards use the dark palette; sender names are lightened for contrast.

### Chat and media loading

- Removed the click-to-select message mode and the blue selection outline;
  messages now behave like Telegram Web (text selection, hover actions and a
  right-click menu).
- Added Telegram Web-style message actions: reply, copy text, forward, edit own
  text messages, delete for me / for everyone, link detection and a full photo
  viewer.
- The composer shows a reply/edit banner and sends `reply_to_msg_id`.
- Thumbnails, avatars and full photos are served from MTProto by the loopback
  image server and loaded by the WebView as normal HTTP images. The per-image
  `data/thumbs/` and `data/avatars/` JPEGs are no longer written; legacy copies
  are deleted on startup.
- Dialog and history entities now provide avatar locations directly, avoiding a
  full-user RPC per avatar; thumbnails use a warm per-DC connection pool.
- Chat history keeps an in-memory snapshot so switching back renders instantly
  before the background refresh completes.
- The open chat now delta-polls `messages.getHistory(min_id)` every two seconds;
  only messages newer than the newest rendered id are mapped, so update-stream
  gaps no longer leave the conversation or reply targets stale.
- Live updates: a gotd update dispatcher pushes new/edit/delete/reaction/read
  events to the UI, with short-message mapping and `updatesTooLong` resync.
- Emoji reactions with counts, chosen state and an emoji picker.
- Album mosaic grouping for consecutive messages with the same `grouped_id`;
  forward/delete/download actions operate on every album message.
- Native multi-file attachment picker with 512 KiB-part uploads and an in-composer
  progress bar (caption and reply supported).
- Dialog list and archived/folder loads are independent; a 20 s kernel dialogs
  cache avoids duplicate flood-limited `messages.getDialogs` calls on reload.

### Login and tdata

- Rebuilt the login flow on a custom phone authenticator: code delivery method
  and length, resend with countdown, retry after an invalid code, 2FA password
  hint and flood-wait countdown.
- Structured `auth:event` payloads for QR expiry, code type/length/timeout,
  resend state, password hint, flood wait and tdata export result.
- Rewrote the Telegram Desktop exporter to match the official layout exactly:
  `key_datas`, `D877F783D5D3EF8Cs` and `D877F783D5D3EF8C/maps`, TDF$ hashes,
  encrypted descriptors, wide-id MTP authorization and random padding. Only the
  modern `s` suffix is written; stale `0`/`1` files are removed.
- Validated the generated tdata with official portable Telegram Desktop 7.2.5
  (build 7002005): accounts info, map, MTP keys and account startup are read
  successfully.
- Import now compares the authorization identity (user id + main DC + key id)
  instead of file timestamps, so Telegram Desktop rewriting its tdata does not
  re-import the same login or replace the cached display name.
- Export record in `data/tdata-export.json`; auth backup in
  `data/tdata-backup/`; `TDataExport`/`AuthStatus.TData` exposed to the UI.

### UI

- Rebuilt the whole frontend on one Material 3 / Google Workspace design
  system: shared colour/type/spacing/motion tokens, `@material/web` controls,
  `PaneHeader`, `SegmentedControl`, `Dialog` and a shared UI layer used by every
  surface.
- Login is now a single QR-first 420px card. Removed the marketing panel,
  feature list and welcome step; phone login is a secondary action, proxy
  settings open in a modal, and small windows compress the QR rather than
  clipping it.
- Language menu with **Follow system**, English, 简体中文 and 日本語. The default
  follows the OS and the choice is persisted. Switching language no longer
  restarts an in-flight QR token.
- Login footer theme menu (System / Light / Dark), defaulting to the system
  theme and persisted with the rest of `AppSettings`.
- Success is now only a check, “登录成功 / 正在加载页面…” and a spinner. The
  tdata success chip is gone; only a tdata export failure is surfaced.
- Phone login starts with **no country prefix**; the user must choose a country
  before the continue action enables.
- QR countdown keeps its deadline when the same token event is replayed; the
  toolbar has an explicit Refresh button and a connecting state for the MTProto
  handshake.
- Proxy settings use compact 48px fields in an overflow-free modal.
- Main page follows Telegram Web's two-column layout with a permanent-list /
  full-bleed-chat split: hamburger + search, All/Unread filters, flat rows,
  floating compose FAB, transparent chat header over an original Material
  wallpaper, and a floating composer. The navigation rail became a left M3
  drawer with Chats/Downloads/Settings/Logout and account details.
- Private chats show no message avatars; groups and channels show the sender
  avatar on every message, with real sender photos and initials fallback.
- Clicking the chat header opens a chat-info dialog with the peer photo, type,
  username, member count and latest message.
- Telegram message parsing expanded to text, photo, video, GIF, sticker, voice,
  video note, audio, file, poll/quiz, location/live/venue, contact, web page,
  dice, game, invoice, story, giveaway, paid media, checklist and an explicit
  unsupported fallback. Replies render a quoted block.
- Downloads are individual floating task cards with no separator lines; the
  hamburger from the downloads header opens the same navigation drawer.
- A tonal “jump to latest” button floats above the composer and replaces the old
  sticky FAB. The button is now a true circular control rather than a Material
  host square.
- Replaced hand-styled chat rows, filter buttons, search input, compose FAB and
  theme segmented control with Google's latest stable Material Web components
  (`@material/web@2.5.0`): `md-list`/`md-list-item`, `md-chip-set`/
  `md-filter-chip`, `md-filled-text-field`, `md-fab` and
  `md-outlined-segmented-button-set`.
- Removed the Telegram-style doodle wallpaper and floating header bubble; the
  chat surface is now a flat Google Chat-style surface with a divider and a clean
  Material canvas.
- Video playback is now progressive: the default mode serves
  `upload.getFile` byte ranges through the loopback server without downloading
  the whole file first. The new **Use tdl streaming** setting runs tdl's
  multi-connection downloader into a growing cache and feeds the player as bytes
  arrive, avoiding the official range throttle.
- Telegram archive and official dialog folders are loaded: archived dialogs use
  `messages.getDialogs(folder_id=1)`, and `messages.getDialogFilters` contributes
  folder titles, emoticons, explicit peer lists and the common category flags to
  the list filter row. The chat context menu can archive/unarchive a peer through
  `folders.editPeerFolders`; folder definitions themselves remain read-only in
  this iteration.
- Video/video-note cards open a native player backed by a cached file and a
  loopback HTTP Range server; the old nil progress handler that crashed on click
  is fixed with an explicit no-op progress adapter.
- Chat header is a floating bubble; search opens inline in the same bubble
  instead of inserting a second toolbar row.
- Earlier history is paginated with `GetOlderMessages` (`messages.getHistory`
  `OffsetID`) and a top-of-timeline “加载更早的消息” action; the previous first
  message stays anchored when older pages are prepended.

### Project hygiene

- Added [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), an `AGPL-3.0-only`
  package license and the bundled Material Symbols OFL text.
- Replaced the old login/theme CSS (`login-settings.css`, `atoms.css`,
  `settings-*.css`) with tokenised shared styles.
- Updated UI, architecture, development and handover docs, plus the new
  [message-support matrix](docs/messages.md), login, proxy and chat screenshots.
- Minor kernel cleanup: single `TDataExport` DTO, no duplicate export record
  type, simplified tdata identity check.

### Verification

- `go test ./internal/...`
- `npm run build` / `wails3 build`
- Playwright checks for QR/phone language switching and persistence, no-prefix
  phone state, the proxy modal at 1107×725 and 640×480, login theme persistence,
  tdata-authorized startup, floating chat layout, real chat/sender avatars,
  private/group avatar rules, chat info, rich media, downloads and login success.
- `TestTelegramDesktopImport` verifies the official tdata import/export path.

## v0.1.0 — 2026-11-11

First handoff-ready desktop milestone.

### Authentication and tdata

- Real QR, phone, code and two-step verification through tdl/gotd.
- Official Telegram Desktop tdata import, with one-time fingerprint and session
  backup.
- Re-import unchanged tdata when the stored session is only an abandoned QR
  attempt, so tdata dropped next to `tgdesk.exe` still logs in.
- No-passcode official-format tdata export, validated with Telegram Desktop
  7.2.5.
- Portable session separated from official tdata.

### Chat

- Real dialog list and latest-50 message history.
- Plain-text message sending.
- Telegram-style conversation header and channel action bar.
- Message grouping, date pills, tails, read/sent indicators.
- In-chat search over loaded messages and persistent per-chat drafts.
- Forwarded messages, service messages (localized), video cards and real
  thumbnails.
- Poll results, locations and contacts.

### Downloads

- Byte-resumable media downloads with pause/resume/cancel.
- Persistent task metadata and progress events.
- Thumbnail cache separate from full media downloads.

### UI

- Frameless Wails window with a 24px Telegram-style caption bar and working
  window controls.
- Atomic login/chat/layout/settings components under the `tg-*` CSS namespace.
- 1107×725 reference geometry: sidebar 394, chat header 56, chat row 60,
  avatar 48.
- English, 简体中文 and日本語 UI.
- Minimal settings sheet: language, send-on-Enter, download folder/threads/
  template, proxy and NTP. Appearance, About and placeholder Telegram sections
  were removed to keep the app focused on chats and downloads.

### Verification

- `go test ./...`
- `tsc` / `npm run build`
- `wails3 build`
- Login and chat CDP metric checks with no console errors.
- Live thumbnail, video, poll, service-message and draft checks.

### Known limitations

- Welcome illustration is a rebuilt approximation.
- Map tiles require network and fall back to a schematic surface.
- Pin/mute/mark-read are local UI state.
- Message pagination, live updates, reactions and server-side search are not
  implemented by the current kernel.
- Passcode-protected tdata is not supported.

## Roadmap

- Real map provider integration.
- Message pagination/live updates when kernel support exists.
- Remaining settings pages.
- Further typography calibration.
