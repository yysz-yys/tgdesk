# UI and design system

tgdesk uses **one** visual language everywhere: Google Material 3 as applied by
Google Workspace (Chat, Gmail, Drive). Login is not a separate marketing skin and
the working shell is not Telegram Desktop. Both are composed from the same
tokens and the same React primitives, in light and dark themes.

## References

- Material 3 foundations: <https://m3.material.io/>
- Material 3 interaction states: <https://m3.material.io/foundations/interaction/states/overview>
- Google's official web components: <https://material-web.dev/>
- Google Chat Material 3 redesign: <https://workspace.google.com/blog/product-announcements/welcome-new-google-chat>
- Google TypeScript style (`gts`): <https://github.com/google/gts>

Do not copy component internals from random UI kits. Prefer, in order:

1. `@material/web` components already wrapped in `components/ui`.
2. A new shared primitive in `components/ui`.
3. Feature CSS only for layout that is genuinely specific to that feature.

## 1. Foundations

All values live in [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css).
Feature CSS must consume token aliases; it must not introduce raw hex colours,
one-off radii, or arbitrary easing.

### Colour

Material 3 roles are defined for `:root[data-theme="light"]` and
`:root[data-theme="dark"]` and consumed through `--app-*` aliases.

| Role | Light | Use |
|---|---|---|
| primary | `#0b57d0` | primary actions, links, focus, active indicators |
| on-primary | `#ffffff` | text/icons on primary |
| primary-container | `#d3e3fd` | selected rows, outgoing bubbles, active drawer item |
| on-primary-container | `#041e49` | content on primary-container |
| secondary-container | `#cee5ff` | tonal selection in controls and menus |
| surface | `#ffffff` | panes, cards, menus |
| surface-container-low | `#f8fafd` | window background, sheet background |
| surface-container | `#f0f4f9` | incoming bubbles, search backgrounds, tonal fills |
| surface-container-high | `#e9eef6` | hovered tonal surfaces |
| on-surface | `#1f1f1f` | primary text |
| on-surface-variant | `#444746` | secondary text and icons |
| outline | `#747775` | strong borders and controls |
| outline-variant | `#c4c7c5` | dividers and quiet borders |
| error | `#b3261e` | destructive actions and errors |
| inverse-surface | `#303030` | snackbars and tooltips |

Dark mode uses the Google Workspace dark map (`#131314` surface, `#1f1f1f`
container, `#a8c7fa` primary). Selected rows and outgoing bubbles use the dark
primary-container, not a saturated blue.

### Type

Roboto is bundled (variable WOFF2 in `frontend/public/fonts`). CJK falls back to
the Windows UI font so Chinese and Japanese keep native metrics.

| Level | Size / line | Weight | Use |
|---|---|---|---|
| pane title | 22 / 28 | 400 | pane headers (downloads) |
| conversation title | 18 / 24 | 500 | chat app bar |
| headline | 24 / 32 | 400 | login card titles |
| title | 16 / 24 | 500 | empty states |
| body | 14 / 20 | 400 | messages, list titles, controls |
| label | 12 / 16 | 500 | metadata, supporting text |
| caption | 11 / 16 | 400 | timestamps, counters |

Use `font-variant-numeric: tabular-nums` only for aligned counters/timers.
Letter spacing follows the Material 3 type scale; do not add tracking to CJK.

### Spacing, shape and motion

- 4dp spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Radii: 4 (menus/tooltip), 8 (fields, buttons, cards), 12 (rows, controls),
  16 (panes, surface cards), 24 (sheets/cards), pill (badges, search, buttons).
- Motion: 120 ms for hover/press, 200 ms for menus/sheets, 300 ms for surfaces.
  Easing is `cubic-bezier(0.2, 0, 0, 1)`. Never bounce or animate layout.
- Reduced motion is honoured globally in `base.css`.

### Elevation

`--app-elevation-1` for raised cards, `-2` for menus/sheets, `-3` for snackbars.
Panes are separated by `outline-variant` borders, not shadows. Do not stack
shadows on top of tonal containers.

## 2. Window and app layout

| Region | Size |
|---|---|
| frameless caption bar | 30px, app background, localized window controls |
| navigation drawer | 300px, left inset, M3 modal surface |
| conversation list | 360px (336 / 304 / 264 at the same breakpoints) |
| app bar | 64px, transparent over the chat wallpaper |
| chat message column | max 840px, 24px gutters |
| downloads content | max 960px, 32px gutters |
| composer | 64px bar, floating 48px field, max 132px textarea |
| login card | 420px, 24px radius, QR tile 220px |
| settings sheet | 480px, 24px radius, 8px inset from title bar and window edge |

The shell is a Telegram-style two-column workspace: the conversation list sits
on `surface-container-low` and the chat pane is a full-bleed wallpaper with a
transparent app bar. There is no permanent navigation rail and no vertical
divider; the hamburger opens the M3 navigation drawer. The chat wallpaper is an
original low-opacity Material outline pattern, not Telegram artwork.

![Telegram-style chat shell](assets/ui-chat-home.png)

![Telegram-style chat shell, light](assets/ui-chat-home-light.png)

![Navigation drawer](assets/ui-nav-drawer.png)

![New message picker](assets/ui-new-message.png)

## 3. Shared component layer

Everything under `frontend/src/components/ui` is the base layer. Feature
components must use these instead of raw buttons, fields, popups or bespoke
state layers.

| Primitive | Backing | Notes |
|---|---|---|
| `Button` | `@material/web` filled/tonal/outlined/text | pill, 40px default, 48px `lg` |
| `IconButton` | `@material/web` icon buttons | 40px target, tooltip by default |
| `TextField`, `SelectField` | `@material/web` outlined fields | 56px default; 48px in settings |
| `Switch`, `Slider`, `Tabs`, `LinearProgress`, `Spinner` | `@material/web` | tokens themed once in `ui.css` |
| `SegmentedControl` | native buttons | M3 segmented button, `aria-pressed` |
| `SearchField` | native input | 48px pill, 40px compact, real `type="search"` |
| `PaneHeader` | layout | 64px app bar for downloads and contained panes |
| `NavDrawer` | Radix Dialog | left modal navigation, account and destinations |
| `Menu`, `ContextMenu` | Radix primitives | M3 menu surface, 40px items, keyboard managed |
| `Sheet` | Radix Dialog | focus trap, Escape, inset side sheet |
| `Dialog` | Radix Dialog | portalled centred modal for contained tasks such as proxy setup |
| `Avatar`, `Badge`, `Icon`, `Callout`, `EmptyState`, `Toast` | app | shared geometry and colour roles |

Rules:

- `ui.css` owns the visual state layer. Feature CSS must not restyle
  `md-filled-button`, `md-outlined-text-field`, etc.
- Icon names are Material Symbols Rounded ligatures. Do not add another icon
  font or inline SVG set.
- Every icon-only control has an accessible label. Decorative icons are
  `aria-hidden`.
- Popup content that can leave a scrolling pane (for example the country picker)
  renders in a portal and is positioned against the viewport.

## 4. Surface patterns

### Login

![Login](assets/ui-login-current.png)

![Phone login](assets/ui-login-phone.png)

![Proxy settings](assets/ui-login-proxy.png)

![Successful login](assets/ui-login-success.png)

The login screen is intentionally QR-first and almost copy-free: tdata is
checked before it is mounted, so it only has to answer "QR or phone?".

- Single centred 420px card on the app background; the only chrome is a 36px
  brand lockup above the card and a language/legal footer below it.
- No marketing panel, feature list, welcome step or duplicate card brand.
- QR login starts automatically. One heading, one hint, the QR tile, countdown,
  a visible **Refresh** action and a text link to phone login. While the MTProto
  handshake runs the card says "Connecting to Telegram…"; the countdown keeps a
  stable deadline when the same token event is replayed.
- The QR toolbar can force a new token after a proxy/network warning; the
  countdown then restarts with the new token.
- Phone login is one outlined 56px field (country trigger, divider, number),
  one hint, one primary action. No redundant eyebrow or fine-print block. The
  country prefix is **empty by default**; the user must pick a country, then the
  +code appears and the continue action enables.
- Proxy settings open as a centred Material dialog, not an inline expanding
  panel, so the login card never changes height or clips the QR code. The dialog
  uses compact 48px fields and hides its scrollbar; proxy edits are local until
  Save; saving on the QR step restarts the token with the new proxy.
- Language is a footer menu with **Follow system**, English, 简体中文 and 日本語.
  The default is `system`; the choice is written to `AppSettings` immediately
  and restored on the next launch. The footer shows `Follow system · <resolved>`
  while following the OS.
- A footer theme button opens System / Light / Dark. The default follows the OS,
  explicit choices persist, and the theme change applies to the login surface
  immediately.
- Language changes never restart an in-flight QR token or cancel the auth flow.
- QR code sits on a white tile even in dark mode (scan contrast) and expires with
  an explicit refresh state.
- Code, 2FA and success reuse the same card, typography and toolbar. Success
  shows only the check, “登录成功 / 正在加载页面…” and the opening spinner.
  The tdata success chip is intentionally absent; only a tdata export failure
  adds a tonal error callout.
- Import errors are tonal `Callout`s; passcode-protected tdata is reported but
  QR login stays available.

Automatic tdata lifecycle:

1. On startup `AuthStatus` attempts to import a Telegram Desktop `tdata` folder
   next to the executable before deciding whether to show this screen.
2. If the import yields a completed login, `App` goes straight to the chat
   shell; no login UI is shown.
3. On a successful QR/phone/2FA login the kernel writes an official-compatible
   no-passcode `tdata` and returns a `TDataExport`; the success card does not
   mention the write. Only a failed export is surfaced, without invalidating the
   login.

### Conversation list

- 66px flat rows with 42px avatars; hover uses the 8% state layer and the
  selected row uses `primary-container`. Real photos load lazily and fall back to
  initials.
- Unread: preview weight 500, unread badge only on non-selected rows.
- Pin/mute are quiet 13px icons before the preview, not inline with the title.
- A hamburger + search pill form the top row; the hamburger opens the navigation
  drawer with Chats, Downloads, Settings and Log out.
- “全部 / 未读” filter chips show counts; there is no “聊天” heading.
- A floating pencil FAB opens the new-message picker.
- Loading uses skeleton rows with the same geometry as real rows.
- No footer count and no permanent rail.

### Chat

- App bar: 38px avatar, 18px conversation name, 12px presence/member line,
  40px search/menu actions. It is transparent over the wallpaper; clicking the
  avatar/title opens the chat-info dialog.
- The chat pane is full-bleed, with an original low-opacity Material outline
  wallpaper; there is no outer rounded card.
- Incoming bubbles are white with a subtle M3 shadow in light mode and
  `#1f1f1f` on the darker canvas in dark mode; outgoing bubbles remain
  `primary-container`. Date labels are compact tonal pills, not full-width rules.
- Private chats show no message avatars or sender names. Groups and channels
  show the sender avatar on every message; photos load lazily and fall back to
  deterministic initials. Grouped messages align under the first avatar.
- The header opens a chat-info dialog with the peer/chat photo, title, type,
  username, member count and last message.
- Message media support covers text, photo, video, GIF, sticker, voice, video
  note, audio, file, poll/quiz, location/live/venue, contact, web page, dice,
  game, invoice, story, giveaway, paid media, checklist and an explicit
  unsupported fallback. Reply quotes and forwarded headers sit inside the
  bubble. See [messages.md](messages.md) for the mapping table.
- Comfortable density: 32px avatars on the first message of a group, sender name
  above the bubble, 18px bubbles, opposite alignment for outgoing messages.
- Incoming bubble `surface-container`; outgoing `primary-container`. The last
  bubble in a group gets a 4px corner on the message side.
- Timestamp and read state sit inside the bubble at bottom-right. Grouped
  messages indent under the bubble; avatars repeat only on sender/date changes.
- Hover reveals a 22px selection control and a quiet row state layer; the
  context menu exposes download/select/copy.
- Media cards use 12px radius; photo/video captions sit on a scrim. File cards
  use a tonal icon tile based on the extension.
- Composer: a transparent bottom area with one floating 48px outlined pill
  containing attach, textarea, emoji and send/mic. Focus is a single 1px primary
  ring; the textarea suppresses the global outline. A “jump to latest” tonal icon
  button floats above the composer when the reader is more than 180px away from
  the bottom.
- In-chat search closes on Escape and only searches loaded messages, with an
  explicit hint.

### Downloads

- Same `PaneHeader` as chat: 22px title, 12px live summary, pause-all and menu.
- 48px primary tabs with counts; content aligned to the same 32px gutter as the
  header.
- Tasks are individual floating cards with no separators; hover raises the
  card and failed downloads keep an error-container tint.
- Each row: 40px tonal file tile, 14px name, 12px `chat · size · status`, 4px
  progress indicator, hover-revealed 40px actions.
- Empty tabs use a shared 56px tonal icon, title, explanation and a text action
  to open the download folder.
- Failed rows get an error-container tint and an explicit retry action.

### Settings

- 480px inset side sheet; 64px header with a close action.
- Sections are 13px labels plus a single tonal surface card. Rows are 68px with
  no internal rules; spacing and typography group the controls.
- Controls align to a 184px rail; stack below the label when the sheet is
  narrow or the control needs the full width (theme segments).
- Theme is a three-segment M3 control; language, proxy type and NTP use outlined
  selects; threads use a slider with a numeric chip.
- The sheet scrolls independently; the header and close action stay fixed.

## 5. Interaction and accessibility

- Hover state layer: 8% on-surface. Pressed: 12%. Selected: primary-container.
- Focus: 2px primary ring, 2px offset (or a 1px inset ring for filled fields).
  Focus is never removed without a replacement.
- Disabled: 38% content, no pointer events.
- Minimum interactive target is 40×40; primary fields/buttons are 48px.
- Keyboard: Escape closes menus, search, sheets, dialogs and the country picker;
  focus returns to the trigger. An open Material select consumes Escape before
  its containing dialog. Enter submits forms; Enter sends a message only when
  the setting is on; Shift+Enter inserts a newline.
- Chat list rows are real buttons (no `role="listitem"` override). Search inputs
  are `type="search"`.
- Message selection uses a selected state plus a visible check; hidden selection
  controls are removed from the tab order.
- Lists scroll independently and use `overscroll-behavior: contain`.
- All user-visible strings exist in `en`, `zh` and `ja`; window controls included.

## 6. Responsive rules

| Breakpoint | Change |
|---|---|
| ≤1120px | list 336 |
| ≤980px | message column 76%, media cards narrower |
| ≤900px | list 304 |
| ≤760px | list 264, download gutters tighten |
| ≤560px | sheets go full-bleed; settings rows stack |
| ≤520px | login card loses outline/shadow and runs nearly full-width |
| ≤620px height (login) | compact card, 160px QR tile, hint hidden |
| ≤460px height (login) | brand hidden, 140px QR tile, footer retained |

The minimum supported window is 640×420. Verify at 640×480, 840×620 and
1107×725; the reference size is 1107×725 at 100% DPI.

## 7. Verification

1. `cd frontend && npm run build` (runs `tsc` and the production bundle).
2. Start Vite and check both themes at 1107×725.
3. Exercise: list search, in-chat search/Escape, message context menu, selection
   bar, settings theme switch, download hover actions, downloads empty state,
   login QR/phone/code, language menu (system/English/中文/日本語) and its
   persistence, country search in Chinese and English, proxy dialog.
4. Confirm the startup path: a valid `tdata` enters the chat shell without a
   login request; a missing/unauthorised `tdata` opens the QR card; a successful
   login reports a written tdata.
4. Confirm no console/page errors and no horizontal overflow at 640×480.
5. Keep private screenshots in `temp/`; only login screenshots belong in
   `docs/assets/`.

## 8. Brand and assets

- Brand: `docs/assets/brand/`, runtime copies in `frontend/public`.
- The mark is a white rounded tile in both themes so the blue plane keeps its
  contrast; do not recolour it per theme.
- Bundled fonts and their license live in `frontend/public/fonts`.
- Material Symbols Rounded comes from `@fontsource/material-symbols-rounded`.
