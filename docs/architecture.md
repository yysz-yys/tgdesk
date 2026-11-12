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

1. Ensures portable directories exist (`paths.Ensure`).
2. Migrates the old profile-backed WebView state once.
3. Creates the kernel (`kernel.New`) and Wails adapter (`app.New`).
4. Creates a **frameless** window with a 24px in-webview caption bar.
5. Starts with a 1107×725 client area unless the primary work area is smaller.
6. Sets the WebView2 user-data directory to `<root>/data/webview`.
7. Enables `--remote-debugging-port=9222` only when `TGDESK_WEBVIEW_DEBUG=1`.

The caption bar is `frontend/src/components/layout/TitleBar.tsx`; it uses the
Wails runtime `Window` API for minimise/maximise/close and CSS
`--wails-draggable` for dragging.

## Kernel state and concurrency

`internal/kernel.Service` owns:

- auth state (`authMu`, auth channels, cached `AuthUser`);
- one shared Telegram session (`sessionMu`, `session`);
- chat request serialization (`chatMu`);
- download tasks and their persistence (`downloadMu`, `downloadSem`).

The shared session is keyed by proxy + NTP. The first call creates a tdl client,
opens the `tgdesk` namespace in the tdl bbolt DB and waits for ping. A call with
a different proxy/NTP closes and recreates it. Downloads and chat/media requests
reuse this client.

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
  peer IDs as opaque `kind:id:accessHash` strings.
- `GetMessages` uses `MessagesGetHistory` (latest 50 by default), maps normal
  messages **and service messages** to `MessageDTO`, then reverses the list to
  oldest-first.
- `SendMessage` uses `MessagesSendMessage` with a nanosecond `RandomID`.
- `GetMessageThumb` resolves one message, picks the small Telegram photo size or
  document thumb, downloads only that small file, caches it in `data/thumbs` and
  returns base64 JPEG.

DTO families:

- `MessageDTO`: text, sender, time, outgoing/check state, forward header,
  service action fields, media.
- `MessageMediaDTO`: kind (`photo`, `video`, `audio`, `file`, `poll`,
  `location`, `contact`), name/size/ext/MIME, dimensions/duration, poll
  options/votes, coordinates, contact phone.

Frontend mapping is centralized in `frontend/src/data/telegram.ts`, including
date/time formatting, media normalization and localized service-message text.

Thumbnail loading is lazy (`MediaThumb.tsx` + IntersectionObserver), cached in
memory per chat/message, and never downloads full media.

## Downloads

`internal/kernel/downloads.go` + `download_store.go`:

- Resolve the selected message, extract media with `core/tmedia`.
- Write to `<name>.tmp`, rename on success.
- Persist task metadata to `<root>/data/downloads.json`.
- Emit `download:event` for progress/speed/ETA/state.
- Pause/cancel keeps the partial file; resume aligns to 4 KiB boundaries and
  uses `upload.getFile` ranges. CDN locations fall back to a full gotd transfer.
- On restart, active/queued tasks become paused; the user resumes from the stored
  byte offset.
- The default destination is `<root>/downloads`; the Settings template is
  evaluated with tdl `tplfunc`.

## Frontend architecture

`frontend/src/App.tsx` is the composition root:

- auth gate and login/main switch;
- chat list, selected chat and message loading;
- language, proxy and download settings effects;
- Wails event subscriptions;
- toasts, download state and the settings sheet.

State split:

- Backend data arrives through generated bindings and is mapped to UI models.
- Language, proxy (without the password in plain text), download and composer
  preferences are in `localStorage`.
- Composer drafts use `tgdesk.draft.<chatId>`.
- No Telegram credential is stored in React state beyond the in-memory auth flow.

Component layers:

- `components/auth` — one component per login step; `LoginShell` owns the page
  surface.
- `components/chat` — conversation is split into header, search, list, bubble,
  media thumb, composer, channel bar and selection bar.
- `components/layout` — caption bar and sidebar.
- `components/settings` — the minimal settings sheet for language, chat,
  downloads and network.
- `components/ui` — generic atoms (`Button`, `TextField`, `Menu`, `Tooltip`,
  `Avatar`, …). UI-specific CSS is namespaced with `tg-`.

Styling:

- `app.css` holds design tokens (fixed dark palette), global shell, message list
  and layout rules.
- Component CSS is imported by its owning component.
- Telegram Desktop geometry constants are documented in
  `docs/frontend-rebuild.md` and should be measured, not guessed.

## Wails events

- `auth:event` — auth state transitions.
- `download:event` — task updates/removal.

Generated event bindings live under `frontend/bindings`. If an event payload or
name changes, update both Go and the frontend subscription and regenerate.

## Persistence summary

| Data | Location | Notes |
|---|---|---|
| tdl session + cached user | `data/tgdesk` | bbolt, tgdesk namespace |
| Legacy session backup | `data/tgdesk.bak` | after tdata import |
| Official tdata backup | `data/tdata-backup/` | after export |
| Import fingerprint | `data/.telegram-desktop-import` | prevents re-import loops |
| Download metadata | `data/downloads.json` | portable task store |
| Thumbnail cache | `data/thumbs/` | small JPEGs, safe to delete |
| WebView state | `data/webview/` | language/settings/drafts |
| Official tdata | `tdata/` | never tgdesk session files |
| Download output | `downloads/` | configurable in settings |

## Extension points

- **New Telegram operation:** add a kernel method with DTOs, wrap it in
  `internal/app.Service`, regenerate bindings, call it from App/UI.
- **New UI page:** create a `components/<area>` component and CSS, wire it in
  `App.tsx` or the settings sheet, add locale keys, verify with a screenshot.
- **New settings field:** add it to `AppSettings` + `defaultSettings`, add a
  control, persist via `useSettings`, and apply any DOM effect in `App.tsx`.
- **New event:** define a plain Go event struct, call the sink from the kernel,
  emit from `internal/app`, subscribe in App, regenerate bindings.
- **New language:** add `frontend/src/locales/<code>.ts`, register it in
  `i18n.ts`, extend the language selectors, verify long strings.

## Known technical debt

- Chat pin/mute/mark-read are local UI state.
- History is a fixed latest-50 snapshot; no pagination or live update loop.
- Some advanced Telegram settings pages are explicit placeholders.
- Reference screenshots of a private account must never be committed; use the
  isolated-home workflow for visual checks.
- Legacy CSS in `app.css` and `login-settings.css` still carries old screen rules
  that are not all used by the current atomic components.
