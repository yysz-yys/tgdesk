# tgdesk

A Windows-first desktop shell for [tdl](https://github.com/iyear/tdl), built with
Wails v3 + React + TypeScript. tdl is used as a **Go module kernel**; upstream is
never forked or patched.

> Status: Telegram-style UI with login/settings, English/Chinese/Japanese UI
> (system language by default). Real Telegram **QR / phone / 2FA login**, **chat
> list**, **recent message history** and **media downloads** run through the
> in-process tdl kernel. Chat pin/mute/read and message selection remain local
> UI actions for now.

![tgdesk chat UI](docs/assets/ui-chat-dark.png)

First launch shows the real login screen. If Telegram is blocked on your
network, expand **Proxy settings** on the login page, choose SOCKS5/HTTP and
enter the proxy (for example `127.0.0.1:7897`), then **Save and reconnect**.
Scan the QR code with Telegram, or use the phone → code → 2FA flow. Settings is
the gear in the sidebar footer or **☰ → Settings**.

The interface defaults to the system language and can be switched between
English, 简体中文, and 日本語 in **Settings → General → Language**.

tgdesk's tdl session is stored in `data/tgdesk`, separate from the tdl CLI's
default namespace. Logging out of tgdesk does not clear the CLI session, and
the two can run without sharing a bolt database.

## Portable layout

All runtime writes default to folders beside `tgdesk.exe`:

```text
tgdesk.exe
data/
  tgdesk            tgdesk's tdl bbolt session + cached user identity
  webview/          WebView2 state (settings/theme/language live here)
  downloads.json    download task metadata
tdata/              official Telegram Desktop files only
  key_data*         Telegram Desktop local key
  data* / maps      Telegram Desktop account authorization/map
downloads/          default download folder
```

`tdata/` is kept compatible with Telegram Desktop. tgdesk-specific state never
goes there.

- **Automatic tdata export:** after a successful QR or phone login, tgdesk
  writes a no-passcode Telegram Desktop tdata (local key, MTP authorization and
  an empty account map) next to the executable. This has been tested with the
  official portable Telegram Desktop 7.4.1: it opens the account and chat list
  from the generated tdata. The generated tdata contains only the main DC key;
  Telegram Desktop fills in the rest as it connects.
- **Telegram Desktop login:** close Telegram Desktop, then copy the contents of
  its `tdata` folder into `<exe>\tdata` (or copy the whole `tdata` folder next
  to `tgdesk.exe`). On the next start tgdesk reads the MTProto authorization
  key with `gotd/td/session/tdesktop` and imports it into `data/tgdesk`; no QR
  scan is needed.
  - Telegram Desktop files are only read; tgdesk never rewrites the source
    files. A new login/export backs up the previous official files under
    `data/tdata-backup/`.
  - If tgdesk already had a session, it is saved as `data/tgdesk.bak` before
    the imported session replaces it.
  - A marker in `data/.telegram-desktop-import` records the source tdata
    fingerprint, so the same tdata is imported only once.
  - tdata protected by a Telegram Desktop **local passcode** is not supported
    yet; the login screen reports the import error and QR login still works.
- Copy the whole folder to move the app. To carry only the login, copy `tdata/`
  (official) or `data/tgdesk` (tgdesk session) next to another `tgdesk.exe`.
- Existing profile-backed data is migrated once: the old WebView profile is
  copied, and the old `~/.tdl/data/tgdesk` session file is copied into
  `data/tgdesk`. The old files are only read, never rewritten. Telegram Desktop
  tdata takes precedence over that legacy session.
- `TGDESK_HOME` can point the portable root somewhere else for development.
- The executable directory must be writable. Do not install in a read-only
  Program Files location if you want portable mode.

## Decisions

| Topic | Decision |
|---|---|
| Desktop shell | Wails v3.1 (system WebView2) |
| Frontend | React 19 + TypeScript + Vite + Tailwind 4 |
| UI primitives | Radix UI, Tabler Icons, custom Telegram-style components |
| Languages | English / 简体中文 / 日本語, default follows the system language |
| Kernel | `github.com/iyear/tdl` + `github.com/iyear/tdl/core` v0.20.4, linked in-process |
| Update model | Bump Go module versions, rebuild, ship a new app version |
| Scope (MVP) | Download manager + chat browsing |
| License | AGPL-3.0 (tdl is AGPL-3.0; the linked application is distributed under the same license) |
| Auth | Real gotd QR / phone / 2FA flow; tdl bolt session in the `tgdesk` namespace |
| Target | Windows only for now |

See [`docs/tdl-desktop-plan.zh-CN.md`](docs/tdl-desktop-plan.zh-CN.md) for the full
analysis, [`docs/ui.md`](docs/ui.md) for the Telegram-style UI spec, and
[`docs/spike-plan.md`](docs/spike-plan.md) for the first spike.

## Requirements

- Windows 10/11 with WebView2 Runtime
- Go 1.26+ (Wails v3.1 requires it; tdl itself requires 1.25.8+)
- Node.js 22+ / npm 11+
- Wails v3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`

## Development

```powershell
# terminal 1: frontend deps (first run)
cd frontend
npm install

# terminal 2: run the desktop app with hot reload
wails3 dev
```

Production build:

```powershell
wails3 build
```

`wails3 build` writes `bin/tgdesk.exe`. Development and test runs use that
executable and keep all portable runtime data in `bin/data`, `bin/tdata` and
`bin/downloads`; nothing is written to the repository root. `bin/tdata` holds
only official Telegram Desktop files; tgdesk-specific state is in `bin/data`.

For layout debugging, set `TGDESK_WEBVIEW_DEBUG=1` before launching. It exposes
the WebView2 DevTools endpoint on `127.0.0.1:9222`; do not enable it in a
distributed build.

## Authentication

- `internal/kernel/auth.go` owns the login state machine. It uses the tdl
  `pkg/tclient` client, gotd's `client.QR().Auth` for QR and `auth.NewFlow` for
  phone/code/2FA.
- The kernel emits `auth:event` (`starting`, `qr`, `code`, `password`,
  `success`, `error`) and the React login screen renders it. The QR value is the
  real `tg://login?token=...` URL returned by Telegram.
- The session and the cached user identity are stored in the `tgdesk` tdl
  namespace. `AuthStatus` requires both a session and a completed-login marker;
  an abandoned QR attempt alone does not count as logged in.
- `AUTH_LOGIN_TOKEN_MIGRATE_TO` is handled explicitly: the kernel migrates to
  the requested DC and imports the scanned token without a second scan; if the
  migration arrives on a token refresh before scanning, it generates a fresh QR
  on the new DC.
- Proxy/NTP are passed to `tclient.New`. If no proxy is configured, the kernel
  falls back to `HTTPS_PROXY`, `ALL_PROXY`, or `HTTP_PROXY`. Proxy passwords are
  kept in memory and are not written to `localStorage`.
- The login page has a 30-second first-response watchdog so an unreachable
  Telegram endpoint produces a localized error instead of spinning forever.

## Chats and messages

- `internal/kernel/chats.go` exposes `GetChats(proxy, ntp, limit)` and
  `GetMessages(chatID, proxy, ntp, limit)`.
- Each call opens the `tgdesk` session, creates a short-lived gotd client and
  closes it. This avoids keeping the bolt DB open between requests; the tradeoff
  is a connection per chat switch (about 1–2 seconds on the current network).
- Chat IDs are opaque strings that encode the peer type, raw ID and access hash,
  so the message call does not need a persistent peers manager.
- Dialogs come from `query.GetDialogs`; messages from `MessagesGetHistory`
  (latest 50), mapped to text/media/sender/date DTOs. Group messages show sender
  names; channel posts do not.
- Chat pin/mute/mark-read are still local UI state and reset on restart. Message
  pagination, live updates, media thumbnails and real download selection remain
  next steps.

## Downloads

- `internal/kernel/downloads.go` resolves the selected message, extracts the
  file with `core/tmedia`, and runs one `core/downloader` per task through
  `dcpool`/`gotd`.
- A single authorized Telegram client is shared by chat loads and downloads
  (`internal/kernel/session.go`); the tdl bolt DB stays open for the app session.
- Downloads run at most two at a time; each task reports progress/speed/ETA via
  `download:event`. Pause/cancel keeps the partial `.tmp` file; resume continues
  from the existing byte offset using aligned `upload.getFile` ranges.
- Task metadata is persisted to `<exe>\data\downloads.json`. On restart,
  `active`/`queued` tasks become `paused`; the user clicks Continue and the
  stored `.tmp` file is resumed. CDN files fall back to a full gotd transfer
  because the simple range API cannot follow a CDN redirect.
- The default download folder is `<exe>\downloads`; changing it in Settings is
  allowed, but all defaults stay inside the portable folder.
- The file-name template from Settings is evaluated with tdl's `tplfunc`. The
  app creates the destination directory, writes to a `.tmp` file, and renames
  it on success. `Download folder` opens Explorer.

## Layout

```text
main.go                 Wails entry point, window, service registration
internal/app/           Wails bindings only; no Telegram logic
internal/kernel/        UI-agnostic kernel facade + stable DTOs
internal/kernel/auth.go Real QR / phone / 2FA flow and session state
internal/kernel/chats.go Real dialogs/messages DTOs
internal/kernel/session.go One shared authorized Telegram client
internal/kernel/downloads.go Real download tasks/progress
internal/kernel/download_store.go Portable task persistence
internal/paths/         Portable paths next to the executable
internal/telegram/      (next) media streaming wrappers
internal/store/         (next) tasks/settings persistence
frontend/               React UI
frontend/src/data/telegram.ts  DTO -> Chat/Message mapping and date formatting
frontend/src/components/auth/      Login screen (QR / phone / 2FA)
frontend/src/components/settings/  Settings dialog
frontend/src/locales/   en / zh / ja translations
frontend/bindings/      Generated Wails bindings; do not edit
docs/ui.md              Telegram-style UI spec and screenshots
docs/spike-plan.md      The six-step validation plan
temp/                   Analysis, spike, portable toolchain; gitignored
```

## Upgrade tdl

```powershell
go get github.com/iyear/tdl@vX.Y.Z
go get github.com/iyear/tdl/core@vX.Y.Z
go mod tidy
go test ./internal/...
wails3 build
```

If an upstream API changed, the fix belongs in `internal/kernel` or
`internal/telegram`, not in the React UI.

> Use `go build .` and `go test ./internal/...` rather than `./...`. The Wails
> template ships mobile helper packages under `build/`, which are not standalone
> Windows main packages.

## License

AGPL-3.0. tdl is AGPL-3.0; see the upstream repository for its copyright and
license text. This project is not affiliated with or endorsed by the tdl
maintainer.
