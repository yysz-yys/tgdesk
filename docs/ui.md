# UI and design system (archived)

> **Archived 2026-11.** This document described the Material 3 shell. Every
> surface has since migrated to the **F** design language; see
> [design-f.md](design-f.md) for the current tokens, atoms, layout and preview
> workflow. The Material components, `components/ui` wrappers and `ui.css`
> referenced in older revisions were deleted, and `@material/web` is no longer a
> dependency.

Current entry points:

- [`frontend/src/ui`](../frontend/src/ui) — the F atom layer (Radix Themes
  backed): `AppTheme`, `Button`, `IconButton`, `TextField`, `SelectField`,
  `Switch`, `Slider`, `SegmentedControl`, `Menu`, `Dialog`, `Callout`, `Badge`,
  `Chip`, `EmptyState`, `Avatar`, `Progress`, `Spinner`, `Toast`, `ContextMenu`
  and `Icon`.
- [`frontend/src/ui/f.css`](../frontend/src/ui/f.css) — canvas/surface tokens,
  typography, shared field/dialog/menu patterns.
- [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css) — the
  legacy `--app-*` aliases kept for the chat media/window CSS, now defined
  directly from F values with no Material roles.
- [`frontend/src/styles/base.css`](../frontend/src/styles/base.css) — element
  defaults, focus rings, scrollbars and the reduced-motion guard.

The Material 3 rules live only in git history; do not reintroduce the old token
roles or component wrappers.
