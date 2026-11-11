# Data, tdata and privacy

tgdesk is portable by default: runtime writes stay beside the executable. This
document is the contract for what is stored, what may be committed, and how to
test with a real Telegram Desktop account safely.

## Portable layout

```text
<root>/                       exe directory, or TGDESK_HOME
  tgdesk.exe
  data/
    tgdesk                    tgdesk's tdl bbolt session (+ cached AuthUser)
    tgdesk.bak                previous session after a tdata import
    tdata-backup/             previous official auth files after an export
    .telegram-desktop-import  source fingerprint for one-time import
    .legacy-session-migrated  migration marker
    .legacy-webview-migrated  migration marker
    downloads.json            persisted download tasks
    thumbs/                   downloaded Telegram thumbnails
    webview/                  WebView2 user data (settings/theme/drafts)
  tdata/                      official Telegram Desktop files only
    key_data0/1/s
    data0/1/s
    D877F783D5D3EF8C/maps
  downloads/                  default media destination
```

In development, `wails3 build` places the executable at `bin/tgdesk.exe`, so the
same layout is `bin/data`, `bin/tdata`, `bin/downloads`.

`TGDESK_HOME` overrides `<root>` for tests or deliberate relocation. The
executable directory must be writable for portable mode.

## Official Telegram Desktop tdata

`tdata/` is reserved for official files. Never put tgdesk session files there.

### Import from Telegram Desktop

On startup, if `key_data*` exists and the fingerprint marker is absent:

1. The kernel reads the authorization with `gotd/td/session/tdesktop`.
2. It imports the session into `data/tgdesk`.
3. It backs up an existing tgdesk session to `data/tgdesk.bak`.
4. It writes the source fingerprint to `data/.telegram-desktop-import`.

The source tdata is only read. **Passcode-protected tdata is unsupported**; the
login screen reports the import error and QR login remains available.

For a safe manual import:

```powershell
# stop Telegram Desktop and tgdesk first
$root = "E:\tg\tgdesk-test"
New-Item -ItemType Directory "$root\tdata" -Force
Copy-Item "D:\Telegram\tdata" "$root\tdata" -Recurse
$env:TGDESK_HOME = $root
.\bin\tgdesk.exe
```

Prefer a **copy** even though the importer reads only.

### Export after login

After a successful QR/phone login, tgdesk writes a no-passcode official-format
tdata:

- `key_data0`, `key_data1`, `key_datas`
- hashed account data files
- `D877F783D5D3EF8C/maps`

Before writing, existing official auth files are moved/copied to
`data/tdata-backup/`. The generated tdata has been validated with official
portable Telegram Desktop 7.4.1; only the main DC key is written and Telegram
Desktop fills in the rest while connecting.

## tgdesk session

The bbolt session is `data/tgdesk`, opened in the `tgdesk` namespace. It is
separate from the tdl CLI's default session. Logging out of tgdesk does not clear
a tdl CLI session.

A session is not considered logged in unless it also has a completed-login
marker; an abandoned QR attempt alone is not sufficient.

## WebView state

`data/webview` is the WebView2 user-data directory. It contains:

- `localStorage`: theme, locale, app settings, composer drafts.
- localStorage keys currently used: `tgdesk.theme`, `tgdesk.settings`,
  `tgdesk.draft.<chatId>`.

Deleting `data/webview` resets local UI preferences but not the Telegram session.
Do not commit or share it; it may contain private draft text.

## Downloads and thumbnails

- `data/downloads.json` stores task metadata and resume paths.
- Partial downloads are written as `<name>.tmp`; completed files are renamed.
- `data/thumbs/` contains small JPEG thumbnails fetched from Telegram. It is safe
  to delete; they are re-fetched on demand.
- `downloads/` is the default output directory and may contain private media.

## Legacy migration

The app migrates old profile-backed data once:

- old WebView state from `%AppData%\tgdesk\webview` → `data/webview`;
- old `~/.tdl/data/tgdesk` session → `data/tgdesk`.

Markers `.legacy-session-migrated` and `.legacy-webview-migrated` prevent repeat
copies. For a clean login test, create them before launch (see
[development.md](development.md)).

## Git rules

`.gitignore` ignores:

```text
bin/
temp/
tdata/
/data/
/downloads/
/tgdesk.exe
/tdataTest/
/tdataNomal/
/dataNomal/
frontend/node_modules/
frontend/dist/
```

Never commit:

- Official tdata or tgdesk sessions.
- Account phone numbers, usernames or cached `AuthUser` files.
- Download media, thumbnails, WebView state, drafts or logs.
- Screenshots of real conversations.

Before committing:

```powershell
git status --short
git diff --stat
git check-ignore -v tdataTest/tdata/key_datas
```

If private data was staged accidentally:

```powershell
git restore --staged <path>
```

If it was already committed, stop and rewrite the affected history before pushing
anywhere, then treat the account/session as exposed. This repository distributes
source only.

## Testing with a private account

1. Work on a **copy** of the test account's tdata, in an isolated `TGDESK_HOME`.
2. Do not point both official Telegram Desktop and tgdesk at the same workdir.
3. Use a test account, not a primary account, whenever possible.
4. Keep screenshots in `temp/` (ignored) and redact message content before sharing.
5. Do not upload the test account or reference screenshots to the repository.

## Build metadata

Windows product metadata is defined in `build/config.yml` and
`build/windows/info.json`. Keep the version aligned with
`internal/kernel.Version` and `frontend/package.json`.
