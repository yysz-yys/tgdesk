# Changelog

## v0.1.0 — 2026-11-11

First handoff-ready desktop milestone.

### Authentication and tdata

- Real QR, phone, code and two-step verification through tdl/gotd.
- Official Telegram Desktop tdata import, with one-time fingerprint and session
  backup.
- No-passcode official-format tdata export, validated with Telegram Desktop
  7.4.1.
- Portable session separated from official tdata.

### Chat

- Real dialog list and latest-50 message history.
- Plain-text message sending.
- Telegram-style conversation header, channel action bar, right info panel.
- Message grouping, date pills, tails, read/sent indicators.
- In-chat search over loaded messages and persistent per-chat drafts.
- Forwarded messages, service messages (localized), video cards and real
  thumbnails.
- Poll results, locations and contacts.
- Custom chat backgrounds and interface scale.

### Downloads

- Byte-resumable media downloads with pause/resume/cancel.
- Persistent task metadata and progress events.
- Thumbnail cache separate from full media downloads.

### UI

- Frameless Wails window with a 24px Telegram-style caption bar and working
  window controls.
- Atomic login/chat/layout/settings components under the `tg-*` CSS namespace.
- 1107×725 reference geometry: sidebar 394, chat header 56, chat row 60,
  avatar 48, right panel 290.
- English, 简体中文 and日本語 UI.
- Telegram-style settings sheet with account, notifications, privacy, chat,
  language, scale, help, downloads and network pages.

### Verification

- `go test ./...`
- `tsc` / `npm run build`
- `wails3 build`
- Login and chat CDP metric checks with no console errors.
- Live thumbnail, video, poll, service-message, draft and scale checks.

### Known limitations

- Account-specific wallpaper must be selected manually as a local image.
- Welcome illustration is a rebuilt approximation.
- Map tiles require network and fall back to a schematic surface.
- Pin/mute/mark-read are local UI state.
- Message pagination, live updates, reactions and server-side search are not
  implemented by the current kernel.
- Passcode-protected tdata is not supported.
- Some settings backed by unavailable Telegram APIs are explicit placeholders.

## Unreleased

- Real map provider integration.
- Message pagination/live updates when kernel support exists.
- Remaining settings pages.
- Further typography calibration.
