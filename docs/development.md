# Development guide

## Prerequisites

- Windows 10/11 with the WebView2 Runtime.
- Go **1.26+**.
- Node.js **22+** / npm **11+**.
- Wails v3 CLI **3.1.0**:

```powershell
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
```

The CLI is installed into `$(go env GOPATH)\bin`. If `wails3` is not on `PATH`,
call it with the full path or add that directory.

```powershell
go version
node --version
npm --version
& "$(go env GOPATH)\bin\wails3.exe" --help
```

## First checkout

```powershell
git clone <repo-url> tgdesk
cd tgdesk
cd frontend
npm ci
cd ..
```

`npm ci` uses the committed `package-lock.json`. Use `npm install` only when
intentionally changing dependencies.

## Run and build

```powershell
# development: Go rebuild + Vite + desktop window
wails3 dev

# production
wails3 build
```

Output: `bin/tgdesk.exe`. Run it from `bin/` so portable data stays in
`bin/data`, `bin/tdata` and `bin/downloads`.

### Windows build exit-code gotcha

Wails 3.1.0 on Windows may print:

```text
"uname": executable file not found in $PATH
"tail": executable file not found in $PATH
```

and exit with code **1 after** writing `bin/tgdesk.exe`. Treat the build as
successful if the executable timestamp updated and the app starts. Verify with:

```powershell
Get-Item bin\tgdesk.exe | Select-Object Length,LastWriteTime
```

Standalone `npm run dev` is useful for isolated CSS work, but Wails bindings and
events are unavailable outside the Wails shell.

## Tests and formatting

```powershell
gofmt -w internal main.go
go test ./internal/...
cd frontend
npm run build
cd ..
wails3 build
```

`npm run build` runs `tsc` and Vite. There is no separate ESLint script yet.

Why `go test ./internal/...` rather than `./...`: the Wails template contains
mobile helper packages under `build/` that are not standalone Windows main
packages. The internal packages are the maintained contract.

## Runtime data while developing

All executable-relative writes use `internal/paths`:

- `data/` — tdl session, cached user, WebView state, download metadata and the
  WebView image cache.
- `tdata/` — official Telegram Desktop files only.
- `downloads/` — media output.

Override the root for tests:

```powershell
$env:TGDESK_HOME = "E:\tg\tgdesk-test"
.\bin\tgdesk.exe
```

To force a clean login screen even when the machine has an old tdl session,
create the migration markers before launch:

```powershell
New-Item -ItemType Directory "$env:TGDESK_HOME\data" -Force
New-Item -ItemType Directory "$env:TGDESK_HOME\tdata" -Force
Set-Content "$env:TGDESK_HOME\data\.legacy-session-migrated" "1"
Set-Content "$env:TGDESK_HOME\data\.legacy-webview-migrated" "1"
```

Without these markers the app may copy `~/.tdl/data/tgdesk` or the old
profile-backed WebView state into the test home.

## Generated Wails bindings

```powershell
wails3 generate bindings -ts ./...
```

`wails3 build` regenerates them automatically. Rules:

- Never hand-edit `frontend/bindings/**`.
- Change Go signatures/DTOs first, then regenerate.
- Nullable slices/pointers often become `| null` in TypeScript; guard them.
- `internal/app.Service` is the only layer exposed to Wails. Telegram logic stays
  in `internal/kernel`.

## DevTools and screenshot verification

```powershell
$env:TGDESK_WEBVIEW_DEBUG = "1"
.\bin\tgdesk.exe
```

WebView2 exposes `http://127.0.0.1:9222/json/list`. Use the page WebSocket with
Chrome DevTools Protocol for DOM checks/screenshots. Never ship a build with the
debug flag enabled.

Privacy rules:

- Login screenshots are safe if no live token/phone is visible.
- Chat screenshots from a real account are private; keep them in `temp/` or out
  of the repo.
- Prefer redaction/cropping before sharing.

## Common tasks

### Add a kernel method

1. Add the method and DTOs in `internal/kernel`.
2. Keep it UI-agnostic; return plain structs/errors.
3. Add a wrapper in `internal/app/service.go`.
4. `wails3 generate bindings -ts ./...`.
5. Call it from React through the generated `AppService`.

### Add an event

1. Define a small JSON-tagged event struct.
2. Add a sink/callback in the kernel.
3. Emit from `internal/app` with `app.Event.Emit("name", payload)`.
4. Regenerate bindings.
5. Subscribe in `App.tsx`/`LoginScreen.tsx`; clean up the unsubscribe function.

### Add a page or component

1. Create a focused component under `components/<area>/`.
2. Use component-local CSS for layout only; colour, radius and control states
   come from `src/ui/f.css` tokens or Radix variables.
3. Reuse `src/ui` atoms; login pages, shell, downloads and settings all compose
   the same primitives.
4. Add strings to `locales/en.ts`, `zh.ts`, `ja.ts` together.
5. Wire it into `App.tsx` or the settings dialog.
6. Verify with `npm run build` and `wails3 build`.

### Add a local setting

1. Extend `AppSettings`/`defaultSettings` in `hooks/useSettings.ts`.
2. Read/update through `useSettings` in `App.tsx`.
3. Add a control in `SettingsDialog`.
4. Apply the effect in `App.tsx` (DOM attribute, CSS variable, etc.).
5. Add all three locale strings.

### Change login or tdata behavior

Read [handover.md](handover.md) and [data-and-privacy.md](data-and-privacy.md)
first. Test tdata against a disposable account copy. Never change import/export
paths without checking the official-client compatibility notes.

## Troubleshooting

| Symptom | Check |
|---|---|
| `wails3: command not found` | Add `$(go env GOPATH)\bin` to `PATH`; reinstall pinned CLI |
| `wails3 build` ends with exit 1 but exe exists | Windows `uname/tail` quirk; check exe timestamp |
| Frontend build fails after DTO change | Regenerate bindings; check nullable fields |
| App opens but requests never complete | Proxy/NTP; Telegram may be blocked |
| `TGDESK_WEBVIEW_DEBUG=1` but no port 9222 | Port conflict or app not restarted with env |
| tdata import error | Passcode-protected/incomplete tdata; use QR login |
| Old session appears in a test home | Create both migration markers before launch |
| Files written outside portable folder | Check `paths.Root()`; set `TGDESK_HOME` |
| Login shows raw English RPC error | Add a mapping in `LoginScreen.localizeError` and a locale key |
| Login code never arrives | Telegram may only deliver it in-app; `SEND_CODE_UNAVAILABLE` means SMS fallback is disabled by Telegram |

## Manual verification checklist

- QR / phone / country picker and the language menu render at 1107×725 and 1440×900.
- QR shows a real token and refreshes before expiry.
- Phone submits `+<country> <number>`; code step shows type/length/resend.
- 2FA step shows the cloud-password hint.
- Success step shows the tdata path; `tdata/` contains `key_datas`,
  `D877F783D5D3EF8Cs`, `D877F783D5D3EF8C/maps`.
- Restart keeps the login and tdata.
- Chat list loads; selecting a chat loads messages; send plain text.
- Search loaded messages; draft survives chat switching.
- Channel has no composer and shows the channel bar.
- Download start/pause/resume/cancel; completed file opens.
- Settings sheet edits language, send mode, downloads, proxy and NTP.
- `go test ./internal/...`, `npm run build`, `wails3 build` pass.

## Release checklist

1. Bump `build/config.yml`, `build/windows/info.json`,
   `frontend/package.json` versions consistently.
2. `wails3 build`; test `bin/tgdesk.exe` from a clean folder.
3. Package with `wails3 package` for the target platform.
4. Verify no `TGDESK_WEBVIEW_DEBUG`/proxy test env is baked in.
5. Tag the commit and update `CHANGELOG.md`.

Only Windows is currently release-tested. The macOS/Linux/Android/iOS build
scaffolding under `build/` is inherited from the Wails template and should be
validated before claiming support.
