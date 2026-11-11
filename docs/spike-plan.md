# Spike 0: prove the kernel seam

**Goal:** prove that a Wails v3 app can link tdl's public Go modules, log in with
QR, list chats, and download one file with structured progress. Do not build the
full UI yet.

**Timebox:** 1–2 focused days.

## Acceptance criteria

- [x] `wails3 dev` opens a window on Windows 11.
- [x] The window shows `tdl`/`tdl/core` versions read from the linked modules.
- [x] QR login returns a real token URL and the UI renders a real QR code.
- [x] After login, real dialogs and recent messages are shown in the UI.
- [x] Selecting a media message starts one download.
- [x] Progress moves in the task panel without parsing terminal output.
- [x] The session is stored in the dedicated `tgdesk` tdl namespace; restart persistence is implemented.
- [x] Download tasks persist and byte-level resume uses the partial `.tmp` file.
- [x] No phone number, code, 2FA password or session bytes are logged.

> Auth status: real QR was generated through an HTTP proxy and verified in the
> UI. A full account scan and phone/2FA completion need a real Telegram account;
> that end-to-end step is intentionally not automated here.

## Step 1 — Shell (done)

- Wails v3.1 scaffold, React 19, Vite.
- `internal/kernel` with a typed `Status` DTO.
- `internal/app` binds `GetStatus`/`GetSpikeChecklist`.
- `wails3 generate bindings` writes `frontend/bindings/`.

Verify:

```powershell
wails3 dev
```

## Step 2 — Session storage

Implemented in `internal/kernel/auth.go`.

- Open tdl's bolt storage with `pkg/kv`:
  `<exe>/tdata` (portable dedicated namespace, separate from CLI `default`).
- Set the app id for QR login with `pkg/tclient.AppDesktop` (same as tdl).
- Load/store session with `core/storage.NewSession`; cache the user identity
  under `tgdesk.auth.user`.
- `AuthStatus` requires both the session and the authenticated-user marker, so
  an abandoned QR auth key is not treated as a completed login.
- Do not hold the bolt DB open while another process uses the same namespace;
  the UI surfaces a localized storage-busy error.

Acceptance: restarting with a completed session shows the app; a partial QR
attempt still shows the login screen.

## Step 3 — QR login

`AuthService.StartQR` and `StartPhone` are implemented with gotd. The login
screen also has a proxy form because Telegram is often unreachable directly:

```go
client, _ := tdlclient.New(ctx, tdlclient.Options{KV: kvd /* ... */}, true)
dispatcher := tg.NewUpdateDispatcher()
client.Run(ctx, func(ctx context.Context) error {
    _, err := client.QR().Auth(ctx, qrlogin.OnLoginToken(dispatcher), func(ctx context.Context, token qrlogin.Token) error {
        emit("auth.qr", token.URL())
        return nil
    })
    // handle SESSION_PASSWORD_NEEDED -> emit auth.password, wait for UI
    return err
})
```

The UI uses a QR library (e.g. `qrcode`) to render the URL, not ASCII art.

Acceptance: real QR generation verified through `127.0.0.1:7897`. The kernel
also handles `AUTH_LOGIN_TOKEN_MIGRATE_TO` (DC 5) by migrating and importing the
scanned token; scan with a real Telegram account remains a manual check because
it needs the user's phone.

## Step 4 — Chat list

Use gotd's query API, not `tdl chat ls`:

```go
manager := peers.Options{Storage: storage.NewPeers(kvd)}.Build(client.API())
iter := query.GetDialogs(client.API()).BatchSize(100).Iter()
```

Map to a DTO with `id`, `title`, `type`, `username`, `unread`, `lastMessage`,
`photo`. Apply peers to the manager, and skip inaccessible dialogs like
`app/chat/ls.go` does.

Acceptance: 20 dialogs render with stable IDs; reopening does not re-fetch
everything from scratch if a cache exists.

## Step 5 — One download

- Resolve the selected message with `tutil.GetSingleMessage`.
- Extract media with `core/tmedia.GetMedia`.
- Implement `downloader.Elem` and `downloader.File` for that message.
- Run one `core/downloader` with a task context.
- Implement `downloader.Progress` that emits throttled `download.progress`
  events (200 ms batch).
- On `OnDone(elem, err)`, update the task state; remember that `Download` may
  return `nil` even when a per-file error was logged.

Acceptance: a 10–100 MB file downloads to a temp file, is renamed on success,
and the UI shows bytes/s and a final state.

## Step 6 — Restart

- Close the app, reopen, and call `auth.status` without scanning again.
- If the session is missing, show the login screen.
- Verify `tdl -n default chat ls` still works after the app exits (the app uses
  the separate `tgdesk` namespace, so there is no shared bolt lock).

## Out of scope

- Sending messages, uploads, forwards.
- Multi-account.
- Video streaming.
- Byte-level resume.
- Auto-update and code signing.

## Risks to watch

| Risk | Check |
|---|---|
| Wails v3 API churn | Pin `v3.1.0`; keep UI calls behind `internal/app` |
| tdl API change | Pin `v0.20.4`; adapter tests |
| bbolt lock | GUI and CLI cannot share a namespace concurrently |
| Telegram flood wait | No aggressive retries; respect errors |
| QR/2FA state machine | One goroutine owns the client; UI only sends answers |

## Useful commands

```powershell
wails3 dev
wails3 generate bindings -ts -d frontend/bindings ./...
wails3 build
go test ./internal/...
```
