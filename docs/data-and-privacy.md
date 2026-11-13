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
    tdata-export.json         last tdata export (user/DC/key id/path)
    .telegram-desktop-import  source fingerprint for one-time import
    .legacy-session-migrated  migration marker
    .legacy-webview-migrated  migration marker
    downloads.json            persisted download tasks
    media/                    opt-in video cache served over loopback HTTP
    webview/                  WebView2 user data (settings/drafts + image HTTP cache)
  tdata/                      official Telegram Desktop files only
    key_datas
    D877F783D5D3EF8Cs         MTP authorization (account index 0)
    D877F783D5D3EF8C/maps     account map
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

The source tdata is only read. An unchanged tdata is normally imported only
once. The check compares the authorization identity (user id, main DC and key
id), not file timestamps, because Telegram Desktop rewrites `key_data` with a
new salt on every start. If a later start finds the marker while the stored
session is an abandoned QR attempt without a completed-login record, the tdata
is imported again so a dropped-in tdata still logs in. A missing session
(logout) is left alone. **Passcode-protected tdata is unsupported**; the login
screen reports the import error and QR login remains available.

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

- `key_datas` (local key wrapped with an empty passcode + account index)
- `D877F783D5D3EF8Cs` (the MTP authorization block, official wide-id layout)
- `D877F783D5D3EF8C/maps` (empty account map)
- `data/tdata-export.json` (non-Telegram bookkeeping; user/DC/key id/path)

Modern Telegram Desktop only keeps the `s` suffix, so tgdesk writes `s` files
and removes stale `0`/`1` variants. The TDF$ container hashes, the encrypted
descriptors and the MTP authorization payload use the same layout as
`storage_account.cpp` / `mtp_authorization.cpp`. Existing official auth files
are copied to `data/tdata-backup/` first. The generated tdata has been validated
with official portable Telegram Desktop 7.2.5 (build 7002005): the client reads
the accounts info, map, MTP authorization and key, then connects. Only the main
DC key is written and Telegram Desktop fills in the rest while connecting.

`data/tdata-export.json` lets the UI show the last export and lets the importer
avoid re-importing the tdata tgdesk itself wrote.

## tgdesk session

The bbolt session is `data/tgdesk`, opened in the `tgdesk` namespace. It is
separate from the tdl CLI's default session. Logging out of tgdesk does not clear
a tdl CLI session.

A session is not considered logged in unless it also has a completed-login
marker; an abandoned QR attempt alone is not sufficient.

## WebView state

`data/webview` is the WebView2 user-data directory. It contains:

- `localStorage`: language, app settings, composer drafts.
- localStorage keys currently used: `tgdesk.settings`,
  `tgdesk.draft.<chatId>`.
- the WebView HTTP cache, which may hold chat thumbnails and avatars loaded from
  the loopback image server.

Deleting `data/webview` resets local UI preferences and the image cache but not
the Telegram session. Do not commit or share it; it may contain private draft
text and cached media.

## Downloads and media cache

- `data/downloads.json` stores task metadata and resume paths.
- Partial downloads are written as `<name>.tmp`; completed files are renamed.
- Chat thumbnails, avatars and full photos are **not** written as files. The
  kernel serves them from MTProto through a loopback HTTP server (`/thumb`,
  `/avatar`, `/photo`); the WebView loads them like normal web images and keeps
  its own HTTP cache. The kernel also keeps a bounded in-memory image cache.
  Older builds wrote `data/thumbs/` and `data/avatars/`; both are removed on
  startup and are safe to delete manually.
- `data/media/` contains video cache files. Default range streaming does not
  retain the video; tdl download-while-watching keeps `stream_*` files here.
  A random loopback-only HTTP token is used; deleting the folder is safe.
- `downloads/` is the default output directory and may contain private media.
- `data/cache/` contains the last dialog list and up to 50 messages per opened
  chat so the UI can paint before the network answers. It is local-only, never
  uploaded, and is deleted on logout. Delete it manually to force a cold start.
- Attachment uploads read the file from the path chosen in the native picker;
  tgdesk does not copy it into `data/`.

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
`frontend/package.json` and the release tag.
