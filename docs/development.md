# Development guide

## Prerequisites

- Windows 10/11 with WebView2 Runtime.
- Go **1.26+**.
- Node.js **22+** / npm **11+**.
- Wails v3 CLI:

```powershell
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
```

Check:

```powershell
go version
node --version
npm --version
wails3 version
```

## First checkout

```powershell
git clone https://github.com/yysz-yys/tgdesk.git
cd tgdesk
cd frontend
npm ci
cd ..
```

`npm ci` uses the committed `package-lock.json`. `npm install` is acceptable when
intentionally changing dependencies.

## Run in development

```powershell
wails3 dev
```

This builds the Go app in dev mode, starts the Vite server and launches the
desktop window. It is the normal way to work on React and Go together.

Production build:

```powershell
wails3 build
```

Output: `bin/tgdesk.exe`.

Run the production build from `bin/` so its portable data stays in `bin/data`,
`bin/tdata` and `bin/downloads`.

The standalone Vite server (`cd frontend; npm run dev`) is useful only for
isolated CSS/layout work. Wails bindings/events will not be available there.

## Tests and checks

Before every commit:

```powershell
go test ./internal/...
cd frontend
npm run build
cd ..
wails3 build
```

Why `./internal/...` rather than `./...`: the Wails template includes mobile
helper packages under `build/` that are not standalone Windows main packages.
`go test ./...` currently also succeeds because those packages have no tests,
but the internal scope is the contract we maintain.

Go formatting:

```powershell
gofmt -w internal main.go
```

TypeScript is checked by `tsc` inside `npm run build`; there is no separate lint
script yet.

## Runtime data while developing

All executable-relative writes use `internal/paths`:

- `data/` — tgdesk session, WebView state, downloads metadata, thumbnails.
- `tdata/` — official Telegram Desktop files only.
- `downloads/` — media output.

Do not run the app from the repository root with a stray `tgdesk.exe`; the
portable layout documentation assumes the executable directory is the root.

Override the root for tests:

```powershell
$env:TGDESK_HOME = "E:\tg\tgdesk-test"
.\bin\tgdesk.exe
```

To force a clean login screen even when the machine has an old tdl session, create
the migration markers before first launch:

```powershell
New-Item -ItemType Directory "$env:TGDESK_HOME\data" -Force
New-Item -ItemType Directory "$env:TGDESK_HOME\tdata" -Force
Set-Content "$env:TGDESK_HOME\data\.legacy-session-migrated" "1"
Set-Content "$env:TGDESK_HOME\data\.legacy-webview-migrated" "1"
```

Without these markers the app may copy an old `~/.tdl/data/tgdesk` session or the
old profile-backed WebView state into the test home.

## Generated Wails bindings

Bindings are generated from exported methods and DTOs:

```powershell
wails3 generate bindings -ts
```

`wails3 build` also regenerates them (with production flags).

Rules:

- Never hand-edit `frontend/bindings/**`.
- Change Go signatures/DTO fields first, then regenerate.
- Rebuild TypeScript after regeneration; nullable slices/pointers often become
  `| null` and may require frontend guards.
- `internal/app.Service` is the only layer exposed to Wails. Telegram logic stays
  in `internal/kernel`.

## DevTools and screenshot verification

Set the debug flag before launch:

```powershell
$env:TGDESK_WEBVIEW_DEBUG = "1"
.\bin\tgdesk.exe
```

WebView2 then exposes a DevTools endpoint at `http://127.0.0.1:9222`. Use the
`/json` endpoint to find the page WebSocket, then Chrome DevTools Protocol for
DOM checks and screenshots. Never ship a build with this flag enabled.

Reference-measurement workflow used for the Telegram Desktop rebuild:

1. Capture the official client at the same client size as tgdesk.
2. On a 200% DPI display, capture the physical surface and downscale it to logical
   pixels before measuring.
3. Use UIAutomation for labels/control order, not guesswork.
4. Capture tgdesk with CDP and compare the same viewport.
5. Record final measured values in [frontend-rebuild.md](frontend-rebuild.md).

Privacy rules for screenshots:

- Login screenshots are safe if they contain no live login token that you intend
  to keep secret.
- Chat screenshots from a real account are private. Do not commit them.
- Keep any reference/test images under `temp/` (gitignored) or outside the repo.
- Prefer cropping/redacting chat content if a screenshot is needed in an issue.

## Common tasks

### Add a kernel method

1. Add the method and DTOs in `internal/kernel`.
2. Keep it UI-agnostic; return plain structs/errors.
3. Add a wrapper in `internal/app/service.go`.
4. `wails3 generate bindings -ts`.
5. Call it from React through the generated `AppService`.

### Add an event

1. Define a small JSON-tagged event struct.
2. Add an event sink/callback to the kernel.
3. Emit from `internal/app` with `app.Event.Emit("name", payload)`.
4. Regenerate bindings.
5. Subscribe in `App.tsx` with the generated event helper or Wails runtime event
   API; clean up the unsubscribe function.

### Add a page or component

1. Create a focused component under `components/<area>/`.
2. Use `tg-`-prefixed classes and component-local CSS.
3. Reuse `components/ui` atoms instead of re-styling controls.
4. Add strings to `locales/en.ts`, `zh.ts`, `ja.ts`.
5. Wire it into `App.tsx` or the settings sheet.
6. Verify with `npm run build`, then `wails3 build`.
7. Capture a screenshot and compare geometry if it is a Telegram Desktop replica.

### Add a local setting

1. Extend `AppSettings` and `defaultSettings` in `hooks/useSettings.ts`.
2. Read/update it through `useSettings` in `App.tsx`.
3. Add a control in the appropriate settings subpage.
4. Apply the effect in `App.tsx` (DOM attribute, CSS variable, zoom, etc.).
5. Add all three locale strings.

### Add a tdata or session behavior

Read [data-and-privacy.md](data-and-privacy.md) first. Do not change import/export
paths without testing against a disposable copy of tdata. Never test against the
only copy of an account.

## Troubleshooting

| Symptom | Check |
|---|---|
| `wails3: command not found` | Add `$(go env GOPATH)\bin` to `PATH`, reinstall the pinned CLI |
| Frontend build fails after DTO change | Regenerate bindings; check nullable fields |
| App opens but requests never complete | Proxy/NTP settings; Telegram may be blocked; check login/network panel |
| `TGDESK_WEBVIEW_DEBUG=1` but no port 9222 | Another process is using 9222, or the app was not restarted with the env var |
| tdata import error | Official tdata may be passcode-protected or incomplete; try QR login |
| Old session appears in a test home | Create the two migration markers before launch |
| Files written outside the portable folder | Check `paths.Root()`; set `TGDESK_HOME` for tests |
| Chat text is cut off | Check interface scale and window size; responsive sidebar changes below 980px |

## Manual verification checklist

- Welcome → QR → phone layout at 1107×725.
- Login with proxy if the network blocks Telegram.
- Chat list loads, selecting a chat loads messages.
- Send a plain-text message.
- Open the right info panel; close it.
- Search loaded messages; clear search.
- Refresh a chat after writing a draft and verify it returns.
- Channel: no composer, bottom notification bar, channel actions.
- Open Settings, navigate a few subpages, close.
- Start/pause/resume/cancel a media download.
- `go test ./internal/...`, `npm run build`, `wails3 build` all green.
