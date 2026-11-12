# Documentation index

Start with the root [README](../README.md) for the product summary and quick
start. For a handover, read **[handover.md](handover.md)** first; it is the
Chinese “current state / where things are / what to verify” guide.

## Reading order

1. [handover.md](handover.md) — status, key decisions, code map, tdata gotchas,
   verification checklist.
2. [architecture.md](architecture.md) — layers, ownership rules, auth/chat/
   download/data flows, extension points.
3. [development.md](development.md) — environment, build/test commands,
   bindings, DevTools, common tasks, troubleshooting.
4. [data-and-privacy.md](data-and-privacy.md) — portable layout, tdata
   import/export, backups, test-account handling, git hygiene.
5. [ui.md](ui.md) — current Material 3 login and Telegram chat design system.
6. [assets/](assets/) — current screenshots and brand source files.
7. [../CONTRIBUTING.md](../CONTRIBUTING.md) — contribution rules and review
   checklist.
8. [../CHANGELOG.md](../CHANGELOG.md) — milestone summary.

## Source-of-truth rules

- The current code, `.gitignore` and this index override any older notes.
- `internal/kernel` DTOs are the frontend contract; generated Wails bindings
  under `frontend/bindings` are derived and must not be hand-edited.
- Portable data rules live in `data-and-privacy.md`; never add account data,
  `tdata`, downloaded media or WebView state to docs/screenshots.
- Visible UI changes should update `ui.md` and, when they affect the login
  screenshots, `assets/`.
