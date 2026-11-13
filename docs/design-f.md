# F design language (Radix Themes)

Status: **migration complete (2026-11).** Login, the caption bar, shell, chat,
downloads, app menus, the right chat-info pane, settings, dialogs, toast and
context menus all use the F language and the `src/ui` atoms. `@material/web`,
Material Symbols and Roboto were removed from the app; message media keeps its
structural CSS but now reads the F palette.

F is the direction picked from the six visual studies: a cool grey canvas,
floating surfaces, hairline borders, one indigo accent and line icons. Radix
Themes supplies behaviour, focus management and the colour scales; tgdesk owns
the canvas, surface rhythm and typography.

## Tokens

Defined in [`frontend/src/ui/f.css`](../frontend/src/ui/f.css):

| Token | Light | Dark |
|---|---|---|
| `--f-canvas` | `#eceef3` | `#0f0f11` |
| `--f-surface` | `#ffffff` | `#1d1d23` |
| `--f-surface-muted` | `#f6f7f9` | `#26262c` |
| `--f-line` | `#e3e6eb` | `#34343d` |
| `--f-text` | `#1c2024` | `#ededf0` |
| `--f-muted` | `#646a73` | `#a1a1aa` |
| `--f-faint` | `#8f959e` | `#7f7f89` |
| `--f-accent` | `#3e63dd` | `#8b95ff` |

- Radix Themes root: `accentColor="indigo"`, `grayColor="slate"`,
  `radius="large"`, `panelBackground="solid"`, no background paint.
- Type: bundled Inter for Latin, `Microsoft YaHei UI` for CJK. Sizes follow the
  Radix scale (1 = 12, 2 = 14, 3 = 16), with 11–12 px for chrome.
- Radii: 8 px controls, 14 px cards, 16 px login card, 18 px window panes.
- Elevation: `--f-shadow-card` for the login card, `--f-shadow-pop` for
  popovers/dialogs; panes rely on 1 px lines rather than shadows.
- Icons: Lucide through [`src/ui/Icon.tsx`](../frontend/src/ui/Icon.tsx).
  Material-style names are kept as compatibility aliases in the icon map.

## Atomic layer

`frontend/src/ui` is the only visual base for migrated screens:

| Atom | Backing | Notes |
|---|---|---|
| `AppTheme` | Radix `Theme` | appearance, accent, radius, font |
| `Button` | Radix `Button` | solid / soft / surface / outline / ghost / danger |
| `IconButton` | Radix `IconButton` + `Tooltip` | label is the tooltip |
| `TextField` | Radix `TextField.Root` | label, hint/error, slots, Enter |
| `SelectField` | Radix `Select` | same label rhythm as TextField |
| `Callout` | Radix `Callout` | error / info / success / warning |
| `Menu` | Radix `DropdownMenu` | trigger is one real button |
| `Dialog` | Radix `Dialog` | title, description, close, actions |
| `Spinner` | Radix `Spinner` | pixel size mapped to Radix sizes |
| `Progress` | Radix `Progress` | 0..1 value, 4 px track |
| `Badge` | Radix `Badge` | unread counter, solid/soft |
| `Chip` | app | filter tabs, black active state |
| `EmptyState` | app | icon tile + title + description + action |
| `Avatar` | app | photo/initial avatar with online dot |
| `Switch` | Radix `Switch` | labelled indigo switch |
| `Slider` | Radix `Slider` | single-value 0..1 style API |
| `Toast` | app | inverse pill at the bottom centre |
| `ContextMenu` | Radix context menu | F menu surface for portalled menus |
| `Icon` | Lucide | Material-style name map |

The product mark is **not** part of the F atom set: every surface keeps the
existing `BrandMark` asset (`frontend/public/brand-192.png`) unchanged.

Rules:

- Feature CSS owns layout only; colour, radius and control states come from
  tokens or Radix variables.
- Use the atoms before adding a new primitive. A new primitive belongs in
  `src/ui` and gets a row in the table above.
- Radix triggers use `asChild`, so `Menu` / `Popover` / `Dialog.Close` always
  receive exactly one real `<button>`.
- Every icon-only control has an `aria-label`; decorative icons are hidden.

## Login

`frontend/src/components/auth` is a pure composition of the atoms:

- 34 px caption bar (`TitleBar`) with the three system controls.
- Centered column: 32 px brand lockup (existing `BrandMark`), 432 px card,
  11 px footer.
- QR step: 228 px white tile, 200 px QR (`level="H"`, centred brand stamp),
  countdown, refresh/proxy toolbar and a ghost phone-login action.
- Phone: unified country + number control; code: 52 px spaced OTP field;
  password: reveal toggle; success: tonal check + spinner.
- Country picker: Radix `Popover` opening upward, search + 224 options.
- Proxy: 440 px Radix `Dialog` with Radix `Select` and 32 px fields.

### Dev preview

`npm run dev`, then open:

```
/login-preview.html?state=qr&theme=light
```

States: `qr`, `phone`, `code`, `password`, `success`, `network`, `country`,
`menu`, `error`, `expired`, `loading`. Theme: `light` or `dark`. The preview
mounts `TitleBar` and the real `LoginShell`, so it is the fastest way to check a
login change without the Go backend.

## Shell and chat

`App` wraps the chats view in `.f-shell`; the conversation list and chat pane are
floating 14 px cards on the canvas with 10 px gaps. Opening chat info adds a
third card on the right. [`shell-f.css`](../frontend/src/components/layout/shell-f.css)
maps the legacy `--app-*` aliases onto the Radix scales inside that scope, so the
existing message media, scroll anchoring and composer code keeps working
without a rewrite.

- Sidebar 316 px: the header is the app menu plus a full-width search field
  (the old compose action was removed). Below it are the folder selector
  ("所有" plus the user-created folders, with counts; no synthetic Unread tab;
  rendered as a dropdown only when at least one custom folder exists, otherwise
  as a plain "所有" label), the archived-chats row rendered with the same 64 px
  row geometry, and 64 px rows (40 px avatar, 13.5 px title, 12 px preview,
  10.5 px time). There is no bottom account row; the signed-in user's avatar and
  name live in the app-menu header.
- **Archive**: an “Archived chats” row with the archive icon, a preview of the
  archived titles and a count opens a Telegram-style archived view: back arrow +
  title + three-dot menu, and archived rows. Search is hidden until chosen from
  the menu; it then replaces the title row with back arrow + search input +
  close button. The menu has exactly Search, Hide/Show in Chat List and Mark all
  as read. Hiding
  the archive removes its row from the main chat list while keeping the archive
  reachable from the app menu; the choice is persisted. New messages update the
  archived row's preview/unread count without moving the chat into the main list.
- **App menu**: a Radix dropdown in the sidebar header. Its header shows the
  signed-in user's avatar + name; the items are Chats, Downloads with a live
  count, Archived chats (when any exist), then Settings and Log out. A compact
  download shortcut also sits next to the filter dropdown.
- **App-wide wallpaper**: once signed in, the window canvas (caption bar, the
  gaps between the floating panels and the whole centre chat column) uses the
  same light/dark doodle pattern; the chat pane paints no surface of its own, so
  the header and composer read as cards floating on it. The login screen keeps
  its quiet flat backdrop.
- Chat header: a floating 48 px surface card (12 px radius, soft shadow, max
  760 px, centred) over the wallpaper, matching Telegram Web K's top bar. The
  peer lockup toggles the right info pane; search takes over the header; a
  Radix dropdown holds download-all.
- **Right info pane** 320 px (300 px below 1180): close + title, 84 px avatar,
  title/status, mute/pin/read actions, then a sticky,
  horizontally scrollable tab rail mirroring Telegram Web:
  - The tab set comes from `messages.getSearchCounters` (cached for 60 s):
    Members for groups, then Media, Files, Links, Music, Voice and GIFs, each
    hidden while the server reports no matching messages. The first visible tab
    opens by default (Members for groups, Media otherwise).
  - Media and GIFs are three-column thumbnail grids; Files, Links, Music and
    Voice use Telegram Web's 48 px leading slot + two-line row anatomy. Every
    list loads its own `messages.search` page on scroll, including while the tab
    is merely hovered, and a short page keeps filling until the pane is covered.
  - The Media tab carries Telegram Web's Photos/Videos filter: the header kebab
    opens a two-checkbox menu (at least one stays checked) and the profile
    subtitle becomes the matching "N photos, M videos" line.
  - Right-click on a shared item opens Telegram Web's context menu: Forward,
    Copy Media (images only), Download, Show in chat, Select/Clear selection,
    Delete. Copy and Download are hidden where Telegram hides them (outgoing or
    protected messages, non-media link rows), so each category gets its own
    item set. Select switches the list into multi-select with a
    count/forward/download/delete bar.
  - Downloadable rows stay in place: a transparent round download control sits
    in the corner of every media/GIF tile and over the file/music/voice icon.
    It turns into a circular progress ring during the transfer and a green
    check afterwards; clicking it starts the download without leaving the
    panel, and a finished badge opens the containing folder after re-checking
    that the file still exists (missing → download again). The header check
    button filters any downloadable tab to already-downloaded items.
  - Members pages through `channels.getParticipants` (50 first, then offset
    pages) rather than filtering the dialog list. Member admin/tag actions are
    not exposed yet because those management features are not built.
  Clicking the title again or the close button dismisses the pane; changing
  chats closes it. Open panes merge the newest page when new messages arrive.
  The pane always keeps its own column; below 990 px the chat list hides while
  it is open so it can never cover message bubbles.
- Message column max 760 px: Telegram Web K bubble geometry (15 px radius,
  5 px grouped corners, 4/9/5 px padding, no protruding tail), white incoming
  and pale-green outgoing in light, steel-blue outgoing in dark, 480 px text
  column, 11 px inline time/checks, fixed avatar gutter, sender name on the first
  and avatar on the last message of a group. Short histories anchor to the bottom
  of the doodle wallpaper canvas. Albums use a compact mosaic grid; reactions are
  pill chips under the bubble; attachment uploads show a thin progress card above
  the composer.
- Media cards use intrinsic Telegram width/height capped at 420 px **or the
  available bubble width, whichever is smaller**, full bleed inside the bubble,
  overlay timestamps, and rounded/circular video notes. Captioned photos,
  albums and web previews reflow when the info pane narrows the chat column
  instead of being clipped by it. Message photos/videos/GIFs and album cells
  carry the same inline download button/ring as the info pane in their top-right
  corner; document cards centre it on the file icon.
- Composer: a floating surface card like Telegram Web K's input plate (14 px
  radius, soft shadow, max 760 px, centred) with 18 px line icons and a solid
  indigo send circle; the text field itself is transparent inside the card.
  Drafts, auto-grow and Enter-to-send are unchanged.
- Media cards (file/photo/poll/voice/…) inherit the mapped palette and radii
  from the F aliases; all surrounding dialogs have been migrated.
- Field focus is one hairline (`gray-a6`) instead of the browser/Radix double
  outline.
- At 860 px and below the floating gaps collapse and the list narrows to 280 px.

### Shell preview

```
/shell-preview.html?state=chat&theme=light
```

States: `chat`, `empty`, `typing` (pre-filled draft). Theme: `light` or `dark`.
It mounts the real `TitleBar`, `Sidebar`, `ChatView`, `ChatHeader` and
`ChatComposer` with mock conversations, so it exercises the same components as
the app. Additional states: `downloads` (downloads in the right pane while the
sidebar stays), `settings`, `toast`. Click the chat title in `chat` to open the
right info pane; the archived row opens the archived view.

## Downloads, menus and dialogs

- **Downloads** replaces only the chat pane on the right: the conversation list
  and its app menu stay in place, and a 960 px page card fills the right pane.
  The header is title + live summary, one Pause all/Resume all toggle plus
  direct Open folder and Clear completed buttons; the sidebar app-menu /
  download shortcut handles navigation. Active/completed/failed are F chips;
  task rows are 64 px with a
  tonal file tile, extension chip, meta line and a 4 px indigo progress track.
  Each tab has an F empty state with an open-folder action.
- **App menu** replaces the old navigation drawer. Its trigger sits left of the
  sidebar search (and in the downloads header); it opens a dropdown with the
  account name, chats, downloads/count, settings and logout.
- **Video** uses the F `Dialog` atom: a 760 px video dialog on a black stage.
  Chat info is the right-hand pane described above. The new-message picker was
  removed with its sidebar button. The existing callbacks, avatar loaders and
  video streaming stay unchanged.
- **Settings** is a 560 px centred F `Dialog` with a scrollable body of grouped
  cards. There is no visible subtitle and no footer button: the header close
  button is the only dismiss action.
  - Appearance uses a custom three-option theme picker (horizontal icon + label,
    selected surface tile, no blue segmented focus ring) and a language select.
  - The download-folder row shows the current path, a **Change** button that
    opens the native folder picker, and an open-folder shortcut. The chosen path
    is persisted and may live anywhere on disk.
  - The rest is the Enter-to-send switch; the tdl download controls (threads,
    DC pool, concurrent files, reconnect timeout, skip-same, takeout,
    rewrite-extension), the tdl streaming toggle, filename template; and the
    proxy type/host/port/credentials/NTP group. Defaults follow tdl's documented
    values (4 threads, pool 8, 2 concurrent files, 5 min reconnect).
- **Toast** is an inverse pill at the bottom centre; **context menus** use the F
  menu surface (portalled, so they read the global `--f-*` tokens).

## Cleanup

The Material layer was removed once every surface had an F equivalent:

- `frontend/src/components/ui` (Material wrappers and `ui.css`) deleted; the
  reusable pieces now live in `frontend/src/ui`.
- `@material/web`, `@fontsource/material-symbols-rounded`, Roboto and Material
  Symbols assets removed from `package.json` and `public/fonts`.
- `styles/tokens.css` now defines the F app aliases directly (no `--md-sys-*`
  roles); `styles/base.css` no longer carries the Material Symbols helper.
- Only one Radix peer package remains outside Radix Themes:
  `@radix-ui/react-context-menu` for the F context menus.
- Production bundle after cleanup: **~94 kB CSS gzip / ~220 kB JS gzip**, plus
  the 48 kB Inter Latin subset. The old Material Symbols font alone was 370 kB.- The navigation drawer and modal chat-info dialog were deleted outright once
  the shared app dropdown and right info pane replaced them. The custom theme
  picker also replaced the old `SegmentedControl` atom, which was removed; the
  new-message dialog was deleted together with its sidebar button.

## Migration map

| Surface | Status |
|---|---|
| Window caption bar | done |
| Login (QR / phone / code / 2FA / success / proxy / country) | done |
| App theme root | done |
| Main shell frame + sidebar (menu/search header) | done |
| App dropdown menu | done |
| Chat header + search + menu | done |
| Chat composer + channel bar | done |
| Message actions, reply/edit banner, forward picker and photo viewer | done |
| Message list, bubbles, dates, service rows | done |
| Message media cards + context menu | done (F palette; legacy structural CSS) |
| Right chat info pane | done |
| Chat info members / media / links tabs | done |
| Archived chats view + dropdown | done |
| New message dialog | removed (sidebar button and dialog deleted) |
| Video dialog | done |
| Downloads | done |
| Settings | done |
| Toast, context menus, empty states | done |
| Remove `components/ui` + `@material/web` | done |

## Known follow-ups

- Message media still uses the legacy structural selectors/classes in
  `chat.css`; the palette is F, but individual media shapes can be refined
  opportunistically.
- Country flags fall back to ISO letters on Windows (no colour flag emoji);
  decide between a small flag sprite or keeping the ISO badge.
- The production CSS is still dominated by Radix Themes' full stylesheet
  (~94 kB gzip); code-split or trim if startup time becomes noticeable.
- The context menu is portalled outside the Theme element and therefore reads
  the global `--f-*` tokens; any new portalled surface must do the same or wrap
  itself in a Radix `Theme`.
- The archived view is intentionally a compact Telegram-style screen: the menu
  exposes search, mark-all-read and help. Official “hide from chat list” and
  per-folder archive settings are not implemented yet.
- The app-menu header loads the signed-in user's real profile photo through
  `GetSelfAvatarURL`, falling back to the F initials avatar when no photo exists.
- The right info pane overlays the chat below 1050 px; if a future layout needs a
  permanent third column at that width, revisit the chat pane minimum width.
- Members loads the 100 most recent participants and uses initial avatars; a
  paginated member list and per-member photos would be the next step if needed.
- The download folder uses the native Wails directory picker; the browser
  preview only exercises the settings layout, not the native dialog.
- Re-run the 1280×800 and narrow-window screenshot pass after any future token
  change; the login, shell, downloads and settings previews all live under
  `frontend/*-preview.html`.
