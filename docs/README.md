# Documentation index

Start with the root [README](../README.md) for the product summary and quick
start. The documents below are ordered for a new contributor.

## Current documentation

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Layers, ownership rules, auth/chat/download/data flows, frontend structure, extension points, technical debt |
| [development.md](development.md) | Environment, build/test commands, generated bindings, DevTools/screenshot workflow, common tasks, troubleshooting |
| [data-and-privacy.md](data-and-privacy.md) | Portable layout, tdata import/export, backups, test-account handling, git hygiene |
| [frontend-rebuild.md](frontend-rebuild.md) | Measured Telegram Desktop reconstruction: geometry, atoms, login/chat/settings passes, verification notes |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution rules and review checklist |
| [../CHANGELOG.md](../CHANGELOG.md) | Milestone summary |

## Historical design documents

These describe earlier planning/spec iterations. They are kept for context but
may not match the current implementation:

| Document | Why it is historical |
|---|---|
| [tdl-desktop-plan.zh-CN.md](tdl-desktop-plan.zh-CN.md) | Initial Chinese product/architecture plan, written before the kernel and UI existed |
| [ui.md](ui.md) | Early Telegram-style UI specification and screenshots from before the official-size rebuild |
| [spike-plan.md](spike-plan.md) | First validation spike plan |
| [assets/](assets/) | Screenshots from earlier iterations; `ui-login-current.png` and `ui-login-phone.png` are current |

## Reading order for a first change

1. Root README and `architecture.md`.
2. `development.md` to get a build running.
3. `data-and-privacy.md` before touching any account.
4. `frontend-rebuild.md` before changing UI geometry or Telegram-style components.
5. `CONTRIBUTING.md` before opening a commit/PR.

## Source-of-truth rules

- The current code and `.gitignore` override old design documents.
- `internal/kernel` DTOs are the frontend contract; generated Wails bindings
  are derived and must not be hand-edited.
- Telegram Desktop reference measurements are documented in
  `frontend-rebuild.md`; new visual changes should record their measured values.
- Never add account data, `tdata`, downloaded media or WebView state to docs or
  screenshots. Use the isolated-home workflow in `data-and-privacy.md`.
