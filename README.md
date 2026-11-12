# tgdesk

Windows-first desktop shell for [tdl](https://github.com/iyear/tdl), built with
Wails v3, React 19 and TypeScript. tdl and gotd are consumed as Go modules; the
upstream projects are **not forked or patched**.

The UI keeps two working surfaces: the chat list/conversation and the download
queue. Login (welcome, QR/phone, 2FA) is the entry point. A small settings sheet
only exposes options those two features use: language, send-on-Enter, download
folder/threads/file-name template, proxy and NTP. Telegram Desktop 7.4.1
screenshots at a 1107×725 client area were used as a reference.

![tgdesk login](docs/assets/ui-login-current.png)

## Current status

Working end to end against real Telegram data:

- Welcome → QR / phone → code → 2FA login, import from official Telegram Desktop
  `tdata`, and export a compatible no-passcode `tdata` after login. The login
  screen uses a Google Material 3 styled surface with a searchable country-code
  picker, resendable codes and QR expiry feedback.
- Real dialog list and recent history (latest 50 messages per open).
- Plain-text message sending.
- Byte-resumable media downloads with pause, resume and cancel.
- Real Telegram photo/video thumbnails, cached beside the app.
- Forwarded messages, video cards, service messages, polls/results, locations
  and contacts.
- In-chat search over loaded messages, per-chat drafts, message grouping.
- A minimal settings sheet for language, send-on-Enter, download options,
  proxy and NTP only.

Local-only UI actions: pin, mute and mark-read. They reset on restart. Message
pagination, live updates, reactions, forwarding and server-side search are not
implemented because the current kernel does not expose them.

## Quick start

Requirements:

- Windows 10/11 with the WebView2 Runtime.
- Go 1.26+.
- Node.js 22+ and npm 11+.
- Wails v3 CLI 3.1.0:
  `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`

```powershell
# 1. frontend dependencies (first run)
cd frontend
npm install

# 2. development app (hot reload)
cd ..
wails3 dev

# 3. production build
wails3 build
```

`wails3 build` produces `bin/tgdesk.exe`. Run the app from `bin/` so portable
data stays in `bin/data`, `bin/tdata`, `bin/downloads`; nothing is written to the
repository root. To make a portable distribution, copy the executable together
with its runtime folders (or start with an empty folder and let the app create
them).

## Portable data layout

```text
tgdesk.exe
data/
  tgdesk              tgdesk's tdl bbolt session + cached user
  tgdesk.bak          previous session, if tdata import replaced one
  tdata-backup/       previous official tdata files, if tgdesk exported
  tdata-export.json   last tdata export (user/DC/key id/path)
  downloads.json      persisted download metadata
  thumbs/             cached Telegram thumbnails (base64 source files)
  webview/            WebView2 state: language, settings, drafts
tdata/                official Telegram Desktop files only
  key_datas           Telegram Desktop local key + account index
  D877F783D5D3EF8Cs   MTP authorization (official wide-id format)
  D877F783D5D3EF8C/   account folder
    maps              account map
downloads/            default download destination
```

Everything defaults beside `tgdesk.exe`; the executable directory must be
writable. `TGDESK_HOME` overrides the root for development or tests.

`tdata/` is reserved for official Telegram Desktop compatibility. tgdesk
session data never goes there.

## Architecture at a glance

```text
React components
   → frontend/src/App.tsx (UI state, settings, event subscriptions)
   → generated Wails bindings (frontend/bindings)
   → internal/app.Service (thin Wails adapter, emits auth/download events)
   → internal/kernel (UI-agnostic Telegram/tdl facade, DTOs)
   → iyear/tdl + gotd/td
```

Rules:

- Telegram/storage logic belongs in `internal/kernel`.
- `internal/app` only translates bindings and emits Wails events.
- The React app never imports Go packages; it only uses generated bindings.
- One authorized Telegram client is shared for the app session. Switching proxy
  or NTP closes and recreates it.
- Chat IDs are opaque `kind:id:accessHash` strings; never parse them in React.
- DTOs in `internal/kernel` are the frontend contract. Regenerate bindings after
  changing them.

Read [docs/architecture.md](docs/architecture.md) for the full flow.

## Repository map

```text
main.go                     Wails entry point, window, service registration
internal/app/               Wails bindings and event bridge
internal/kernel/
  auth.go                   QR / phone / 2FA state machine and AuthUser
  session.go                shared authorized Telegram client
  chats.go                  dialogs, messages, media/service DTO mapping
  downloads.go              download pipeline, resume, progress
  download_store.go         portable task persistence
  thumbs.go                 thumbnail selection/download/cache
  tdesktop_import.go        official tdata → tgdesk session
  tdesktop_export.go        tgdesk session → official tdata
internal/paths/             portable path resolution
frontend/src/
  App.tsx                   app shell, state, effects, event handlers
  components/auth/          welcome, QR, phone, code, 2FA, success
  components/chat/          chat view, rows, header, composer, search, media
  components/layout/        title bar and sidebar
  components/settings/      minimal settings sheet (language/chat/downloads/network)
  components/downloads/     download manager
  components/ui/            Button, TextField, Menu, Avatar, Tooltip, …
  data/telegram.ts          DTO → UI model mapping and date formatting
  hooks/                    settings persistence
  locales/                  en / zh / ja
frontend/bindings/          generated Wails bindings; do not edit by hand
docs/                       architecture, development, privacy, design history
build/                      Wails build assets (Windows metadata/icon)
```

## Documentation

- [docs/README.md](docs/README.md) — documentation index and reading order
- [docs/architecture.md](docs/architecture.md) — layers, data flows, extension points
- [docs/development.md](docs/development.md) — setup, builds, tests, debugging, UI workflow
- [docs/data-and-privacy.md](docs/data-and-privacy.md) — portable files, tdata safety, git hygiene
- [docs/frontend-rebuild.md](docs/frontend-rebuild.md) — measured Telegram Desktop rebuild notes
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution and review checklist
- [CHANGELOG.md](CHANGELOG.md) — milestone summary

Historical, pre-handoff documents are listed separately in the docs index.

## Verification

Run before every commit:

```powershell
go test ./internal/...
cd frontend
npm run build
cd ..
wails3 build
```

Useful runtime checks without a real account:

- `TGDESK_HOME=<empty-folder>` starts the app in a clean, login-only home.
- `TGDESK_WEBVIEW_DEBUG=1` exposes WebView2 DevTools on `127.0.0.1:9222`.
- Do not enable the debug endpoint in a distributed build.

See [docs/development.md](docs/development.md) for the screenshot/metrics
workflow and troubleshooting.

## Private data and tdata

Never commit:

- `tdata/`, `tdataTest/`, `tdataNomal/`, `dataNomal/`
- `bin/`, including `bin/data`, `bin/tdata`, thumbnails and downloads
- runtime WebView state, logs or downloaded media

They are covered by `.gitignore`. Only source, docs and generated bindings
belong in git. A detailed checklist is in
[docs/data-and-privacy.md](docs/data-and-privacy.md).

## Known limitations

- The welcome illustration is a rebuilt approximation, not the official bitmap.
- Map tiles require network; the card falls back to a schematic surface.
- tdata protected by a Telegram Desktop local passcode is unsupported.
- Pin/mute/mark-read are local UI state.
- Message pagination, live updates, reactions and server-side search remain
  future work.

## License

AGPL-3.0. tdl is AGPL-3.0. This project is not affiliated with or endorsed by
the tdl maintainer or Telegram.
