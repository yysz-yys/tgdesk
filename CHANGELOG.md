# Changelog

## Unreleased

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
  sticky FAB.

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
