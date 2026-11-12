# Contributing

tgdesk is a Windows-first Wails desktop shell around tdl. Read
[docs/architecture.md](docs/architecture.md) and
[docs/development.md](docs/development.md) before changing code.

## Ground rules

1. **Do not fork or patch tdl upstream.** Depend on released Go modules and
   upgrade them deliberately.
2. **Keep the layer boundaries.**
   - Telegram logic → `internal/kernel`
   - Wails translation only → `internal/app`
   - React/bindings only → `frontend`
3. **Never commit private data.** tdata, sessions, downloads, thumbnails,
   WebView state, drafts, logs and conversation screenshots stay out of git. See
   [docs/data-and-privacy.md](docs/data-and-privacy.md).
4. **Do not fake UI capability.** If the kernel has no API, render an explicit
   placeholder, disabled state, or "coming soon" explanation.
5. **Keep the UI atomic.** New screens should be composed from
   `frontend/src/components/ui` primitives and `g-*` layout classes, not a new
   monolithic page.

## Development setup

```powershell
cd frontend
npm ci
cd ..
wails3 dev
```

Production build:

```powershell
wails3 build
```

Run the result from `bin/` so portable data is `bin/data`, `bin/tdata`,
`bin/downloads`.

## Before you commit

```powershell
gofmt -w internal main.go
go test ./internal/...
cd frontend
npm run build
cd ..
wails3 build
git status --short
git diff --stat
```

All checks must pass; on Windows treat `wails3 build` as successful when the
executable timestamp updated (the CLI may exit 1 after the build). Do not include
`bin/`, `temp/`, test tdata or screenshots in the staged set.

If you changed a kernel DTO or service method:

```powershell
wails3 generate bindings -ts ./...
```

Commit the generated files under `frontend/bindings` together with the Go change.

On Windows, `wails3 build` can exit 1 after a successful build because of the
Wails `uname/tail` probe. Verify `bin/tgdesk.exe` was updated before treating it
as a failure.

## Commit style

Match the existing log:

- `feat(ui): ...`
- `fix(ui): ...`
- `feat(kernel): ...`
- `docs: ...`
- `chore: ...`

One coherent change per commit. Include the measured or verified behavior in the
message when it is relevant.

## UI contribution rules

- One visual language everywhere: **Google Material 3 / Google Workspace**,
  light and dark. Do not reintroduce a separate Telegram palette or a one-off
  marketing skin.
- Build screens from `frontend/src/components/ui`. If a primitive is missing,
  add it there first, then use it in the feature. Feature CSS controls layout
  only; it must not restyle `@material/web` internals.
- Consume `frontend/src/styles/tokens.css` for colour, type, spacing, shape,
  elevation and motion. No raw hex colours or arbitrary radii in feature CSS.
- Use Roboto (already bundled) and Material Symbols Rounded. Do not add another
  icon font or an unrelated icon pack.
- Interaction states follow [docs/ui.md](docs/ui.md): 8% hover, 12% pressed,
  primary-container selection, visible 2px focus, 40px minimum target.
- Every pane header uses the shared `PaneHeader`; every icon-only control has an
  accessible label; search fields are real `type="search"` inputs.
- Strings: add `en`, `zh`, and `ja` keys together, including window controls and
  empty/error states.
- Settings: add the field to `AppSettings`, default it, apply its effect in
  `App.tsx`, and expose it through the shared settings controls.
- Measure at 1107×725, 840×620 and 640×480 in both themes. Record geometry
  changes in [docs/ui.md](docs/ui.md).
- Keep real screenshots of private chats out of commits. Synthetic UI fixtures
  belong in `temp/`; only login screenshots may live in `docs/assets/`.
- Bundled fonts live in `frontend/public/fonts` with their license; do not add
  remote font CDN dependencies to the desktop build.

## Review checklist

- [ ] Layer boundaries respected; no Telegram code in `internal/app` or React.
- [ ] DTO/binding changes regenerated and committed.
- [ ] `go test ./internal/...` passes.
- [ ] `npm run build` passes (`tsc` included).
- [ ] `wails3 build` leaves an updated `bin/tgdesk.exe` (Windows may exit 1).
- [ ] tdata import/export changes were tested against a disposable account copy
      and, when the format changes, with official Telegram Desktop.
- [ ] No `tdata`, sessions, downloads, thumbnails, WebView state or private
      screenshots staged.
- [ ] Locale keys added for all three languages.
- [ ] Placeholder/unavailable functionality is explicit.
- [ ] Docs updated when architecture, workflow or visible geometry changed.

## License

Contributions are accepted under AGPL-3.0, matching the repository license and
tdl's upstream license.
