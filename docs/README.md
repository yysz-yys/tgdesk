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
5. [design-k.md](design-k.md) — design K: the 1:1 Telegram Web K port of the
   signed-in main screen (tokens, wallpaper renderer, tweb markup/CSS map,
   bundled tgico/Roboto assets, verification workflow, remaining pages).
6. [design-f.md](design-f.md) — the earlier F design language, still used by
   login, conversation, settings and other not-yet-ported screens: tokens,
   `src/ui` atoms, composition and preview workflow.
   ([ui.md](ui.md) is the archived Material 3 record.)
7. [messages.md](messages.md) — Telegram message/media parsing support and
   chat-specific avatar rules.
8. [assets/](assets/) — current screenshots and brand source files.
9. [../CONTRIBUTING.md](../CONTRIBUTING.md) — contribution rules and review
   checklist.
10. [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) — bundled fonts and
   third-party licenses.
11. [../CHANGELOG.md](../CHANGELOG.md) — milestone summary.

## Source-of-truth rules

- The current code, `.gitignore` and this index override any older notes.
- `internal/kernel` DTOs are the frontend contract; generated Wails bindings
  under `frontend/bindings` are derived and must not be hand-edited.
- Portable data rules live in `data-and-privacy.md`; never add account data,
  `tdata`, downloaded media or WebView state to docs/screenshots.
- Visible UI changes should update the matching design document (`design-k.md`
  for the Web K-ported screens, `design-f.md` for the rest) and, when they
  affect the screenshots, `assets/`.
