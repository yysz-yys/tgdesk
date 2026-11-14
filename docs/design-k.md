# Design K — Telegram Web K 1:1 port

This document records how the **native Telegram Web K (tweb)** look is reproduced
in tgdesk: where the tokens come from, how the components map to tweb's markup,
which assets are bundled, and what is still missing. The goal is a pixel-faithful,
page-by-page replacement of the earlier "F" design language, starting from the
signed-in main screen (chat list + empty chat column, light "Day" theme).

## Status

| Screen | State |
|---|---|
| Signed-in main screen (chat list, folder chips, archive row, empty chat column, tips lightbulb, new-message FAB) | **Port done** (light theme) |
| Login / auth flow | still the F design |
| Conversation view (bubbles, composer, header) | still the F design |
| Main menu (hamburger), settings, downloads, search results pages, archive view, tips deck | still functional F screens, not yet re-styled |

The reference capture is the Web K **`light`** AppTheme (`baseThemeDay`, the blue
"Day" palette) — not the older Classic `day` theme (green wallpaper/outgoing
bubbles). All colours below are that theme.

## Code map

```
frontend/src/components/k/          the Web K UI
  KMainScreen.tsx                   .page-chats → #main-columns → #column-left/#column-center
  KChatList.tsx                     left column: header, folder chips, list, archive, FAB
  KChatRow.tsx                      one .chatlist-chat row (title/time + subtitle + avatar)
  KAvatar.tsx                       54px avatar: photo / peer colour gradient / saved / archive
  KFolderTabs.tsx                   .menu-horizontal* chip strip with sliding active plate
  KSearchField.tsx                  InputSearch "old-style" 44px pill
  KEmptyChat.tsx                    service pill + chatTips lightbulb (portalled to the page)
  KWallpaper.tsx                    page-wide gradient + doodle canvas
  KIcon.tsx                         tgico glyphs + the verified-badge SVG sprite
  model.ts                          Web K helpers (colour index, abbreviation, badges)
  icons.ts                          tgico name → codepoint map (653 icons)
  wallpaper.ts                      freeform gradient + pattern tiling algorithms
  useRipple.ts                      tweb's press ripple
frontend/src/styles/k/              plain CSS ported from tweb's SCSS
  tokens.css                        light "Day" theme custom properties
  base.css / fonts.css              reset, tgico font-face, Roboto 400/500/600
  shell.css / sidebar.css / tabs.css / chatlist.css / empty.css / wallpaper.css
frontend/public/assets/             bundled tweb assets
  img/pattern.svg                   doodle wallpaper pattern (1440×2960)
  fonts/tgico.{ttf,woff}            Web K icon font
  fonts/KFO*.woff2                  Roboto subsets (400/500 latin + latin-ext)
  fonts/Roboto-LICENSE.txt          Apache-2.0 text
frontend/src/dev/KPreview.tsx       `/k-preview.html` fixture harness for screenshots
```

tweb itself is a **dev-only reference checkout** (`temp/tweb`, gitignored); it is
not needed to build or run tgdesk. Ported styles/logic were transcribed from the
2026-11 tweb tree (paths are cited in each file's header comment).

## Tokens

The theme is generated at runtime in tweb (`helpers/themeController.ts`, the
`light` entry of `colorMap`) instead of living in SCSS. `styles/k/tokens.css`
carries the resolved values:

- accent `#2D7ED5`; `--light-primary-color` = `rgba(45,126,213,.08)`;
  `--light-filled-primary-color` = `#EEF4FB` (`mix(accent, surface, .08)`).
- text `#333333` / secondary `#8C8E91`; surface `#FFFFFF`; background
  `#F4F4F5`; border `#DFE1E5`; secondary `#C4C9CC`; saved `#2D7ED5` with the
  saved-avatar top `#78ACE4`.
- service plates (empty-column pill, tips toggle) use the factory
  `baseThemeDay` highlighting colour `hsla(210, 67.7419%, 50.5882%, .4)`
  (`config/state.ts` `DEFAULT_HIGHLIGHTING_COLORS`). The wallpaper-average
  variant (`hsla(202, 69%, 52.25%, .4)`) is exposed as
  `--wallpaper-highlighting-color` for chat service messages later.
- geometry: page padding 16px, sidebar 360px, column radius 24px, column shadow
  `0 0 4px #0000001a`, row 72px / avatar 54px / row radius 16px, chip strip 48px
  with 8px inset, FAB 54px at 20px from the card edges.
- motion: `.3s/.25s cubic-bezier(.4,0,.2,1)`, tab stripe `.2s ease-in-out`,
  ripple `.7s` scale 0→2, hover alpha `.08`.

## Wallpaper

tweb renders the factory wallpaper on canvas, not as a CSS gradient
(`components/chat/bubbles/chatBackground.tsx`, `gradientRenderer.ts`,
`patternRenderer.ts`, `helpers/freeformGradient.ts`). We ported the algorithms:

1. a 50×50 `ImageData` freeform gradient over four colours
   (`#B1E0FA/#82B0D8/#A0D8E8/#E5F0F8`, phase 0/progress 1, swirl
   `theta = (0.35·d)²·0.8·8`, `max(0, .9 − dist)⁴` weights), CSS-stretched to
   `height: 150%; top: -25%`;
2. `pattern.svg` tiled with tile height `(500 + innerHeight/2.5)·dpr`, width
   `1440·ratio`, rows centred vertically, then composited with
   `mix-blend-mode: soft-light` at the wallpaper intensity `0.5`.

At a 1450×790 viewport this gives the same doodle tile (~398×816 CSS px) as the
reference capture; the colours differ from the JPEG only by its wide-gamut (P3)
capture encoding.

## Components map to tweb markup

- Chat list rows follow `components/dialogElement.ts` + `components/rowTsx.tsx`:
  `a.row.no-wrap.row-with-padding.row-clickable.hover-effect.row-big.chatlist-chat.chatlist-chat-bigger`
  with `.row-row.row-title-row.dialog-title` (`.row-title.user-title.peer-title`
  + `.row-title-right.row-title-right-secondary.dialog-title-details` with a
  `.message-status` check and `.message-time`) and
  `.row-row.row-subtitle-row.dialog-subtitle` (`.row-subtitle.dialog-subtitle-parts`
  + `.dialog-subtitle-badge.badge.unread`); the avatar is the absolutely
  positioned `.row-media.row-media-bigger.dialog-avatar`.
- The archived-chats row is tweb's `archive-dialog` (`components/archiveDialog.tsx`):
  fixed `linear-gradient(#5CAFFA, #408ACF)` avatar with `archive_filled` at 28px,
  title weight 500, subtitle = up to ten archived titles joined by `, `
  (each cut to 20 symbols), grey badge whose count is the number of *unread
  archived chats* (`getFolderUnreadCount` returns a peer count, not messages).
- Saved Messages is an ordinary row for the self peer: `saved_filled` glyph on the
  saved gradient, localized `我的收藏` title.
- Folder chips are tweb's `FoldersTabs`: `.menu-horizontal-scrollable` plate
  (margin 8px, radius 24px, `0 1px 8px rgba(0,0,0,.1)`) holding
  `.menu-horizontal-div-item` chips (40px, radius 20px, 16px/500) and one
  `.menu-horizontal-div-item-background` plate that slides between chips with the
  `.2s` transition. Folders come from the kernel; a chip badge counts unread
  *chats* and goes grey when they are all muted.
- The empty column is tweb's collapsed `chatTips` deck: the
  `.chat-tips-select-chat-pill` service pill (`padding 5px 12px`, radius 16px,
  15px/20px white text on the highlighting colour) centred in `#column-center`,
  and the lightbulb `.chat-tips-toggle` pinned top-right. The toggle is rendered
  outside `#column-center` on purpose: that column carries tweb's empty-state
  `translateX((360+16)/2)` centring, which would otherwise become the containing
  block of the `position: fixed` button.
- The FAB is `btn-corner btn-circle` (54px, primary fill, pencil `newchat_filled`
  24px) anchored 20px from the sidebar's bottom-right corner.
- Icons are the real **tgico** font: `K_ICONS` is tweb's name→codepoint map and
  `KIcon` renders the glyph as text, exactly like tweb's `Icon()`.

## Behaviour notes

- The signed-in page opens with **no chat selected** (Web K behaviour): the
  middle column shows the empty state until a row is clicked.
- **Folders**: the folder list is cached per account in `localStorage`
  (`tgdesk.k.folders.<account id>`) and painted from that snapshot the moment the
  shell mounts, then refreshed by the `GetFolders` round trip — the tabs are
  therefore up before the first connection completes, like telegram web, which
  keeps its dialog filters in storage. Folder membership follows the server
  filter: included peers (`chat:…`/`channel:…` keys from
  `messages.getDialogFilters`), category flags (`groups`, `broadcasts`,
  `contacts`, `nonContacts`, `bots`) and the exclude rules; archived chats belong
  to a folder unless the filter sets `exclude_archived`, so a folder can consist
  of archived chats only (the "444" folder here is exactly that — it holds one
  archived channel), and the chip badge counts the folder's unread *chats*
  including those archived ones.
- The sidebar search filters the loaded chats across all folders as tweb's search
  does; the input focus state is the old-style pill turning white with an accent
  border; the clear button appears with text.
- Hover plates, the active-row primary fill, ripple press feedback and the chip
  stripe transition are implemented as in tweb.
- The chat list scrolls **under** the floating folder/sidebar panel, as in webk:
  tweb's `.folders-tabs-gradient` (a `--surface-color` → transparent vertical
  gradient over the overlay) fades the rows out as they pass behind the chip
  plate, so a row leaving the top is a soft ghost in the 8px band above the
  plate instead of being cut off with a hard edge.
- **Main menu (hamburger)**: `KAppMenu` follows tweb's `sidebarLeft.createToolsMenu` — the account row,
  Add Account, Saved Messages, Archived chats (badge = unread archived chats), My Stories,
  Contacts, Calls, Settings and the More submenu (Downloads, Night mode), split by the
  same separators. It is a `.k-menu` on tweb's desktop metrics (`.btn-menu`: frosted
  `rgba(255,255,255,.85)` + `blur(50px)`, radius 16, shadow `0 0 10px rgba(0,0,0,.15)`,
  32px items with 20px icons, 14px/500 labels) and animates in with the 0.2s
  `cubic-bezier(.4,0,.2,1)` scale(.8)→1 + fade. Pages that are not ported yet (Add Account,
  My Stories, Contacts, Calls) surface a localized "arrives with the next pages" toast.
- **New-chat menu (pencil / FAB)**: `KNewMenu` opens above the corner button, aligned to its
  end, with tweb's three entries — New channel, New group, New private chat (the group-call
  entry is intentionally left out); the pencil icon morphs into a cross while open
  (`.menu-open` swap with a scale/fade) and the menu itself uses the same `.k-menu` plate.
- The hamburger is a webk icon button: a 40px round plate on
  `--light-secondary-text-color` while hovered or while its menu is open
  (`.menu-open`), exactly the plate the real client paints under it.
- **Cloud themes (Appearance tip)**: the theme engine is wired end-to-end —
  `themeStore.ts` applies a theme's accent to every shell token (`--primary-color`
  and its light/dark mixes) and publishes its wallpaper (gradient stops,
  intensity, pattern SVG) to `KWallpaper`, and the kernel's `GetChatThemes`
  (account.getThemes) plus the wallpaper/pattern media pipeline pull the real
  Web K theme set from Telegram and serve the pattern documents over the loopback
  media server. The Appearance strip renders server themes when the account
  returns them and keeps local preview tiles as a fallback (this account's
  account.getThemes answers with an empty list, so the factory previews still
  show; the 69-wallpaper catalog with its pattern SVGs is already available for
  the next step, which is mapping the nine default Appearances to their
  wallpapers/accent presets).
- **Chat-tips deck**: the lightbulb in the page's top-right corner folds the deck in and out
  (`KTipsToggle`, lamp ↔ cross), exactly like tweb `components/chatTips` after the macOS
  widget: a 320×320 card centred in the empty column with custom Previous / Next service
  pills, all cards mounted in a stage and cross-faded/slid (±50px) by the step, the deck
  itself scaling down to .1 and fading out to the "Select a chat to start messaging" pill
  underneath (state persisted). Tips: **Appearance** (System / Dark / Light segmented row,
  the cloud-theme strip with live previews, and the description linking into Settings),
  **Stickers** (suggest mode row; the trending packs await the sticker data sync) and
  **Chats** (a 4×2 grid of recent chats, click to open). Strings live in `tips.*` for
  en/zh/ja. A fresh profile starts with the deck collapsed — only the
  "Select a chat to start messaging" pill is on the wallpaper, like the
  reference capture.
- **Archived chats** are a sidebar screen of their own, not a swapped list:
  `KChatList` keeps two tabs in tweb's `.sidebar-slider.tabs-container`
  (`item-main` + the archived tab) and opens the second one with the same
  navigation slide `TransitionSlider`/`SliderSuperTab` performs — 250–300 ms,
  the leaving screen moves 25% towards the start and dims to 80% while the
  entering one comes in from the full column width (or the reverse on the way
  back). Its header is tweb's: `.sidebar-close-button` (tgico `left`), the
  `.sidebar-header__title` and a three-dot `more` button that opens the archive
  menu (`.btn-menu` metrics: 180 px min width, radius 16, frosted
  `rgba(255,255,255,.85)` + `blur(50px)`, 32 px items with 20 px icons) — the
  menu offers Mark all as read and Hide/Show the archive row in the chat list.
  Back button, Escape and picking a chat leave the tab; the chat list keeps its
  scroll position underneath.
- Group previews carry their author in front, as webk renders them: "Name: text"
  from the kernel's `lastSender` (the last message's `from_id` resolved against
  the dialog entities) and "You: text" for outgoing messages. Private chats and
  broadcast channels stay unprefixed.
- Folder-chip counters follow tweb's fold: a chip counts the folder's unread
  *chats* and is grey only when every one of them is muted
  (`getNotificationCountForFilter`: muted = no unmuted unread, some unread and no
  mentions) — a folder holding a muted and an unmuted unread chat is blue. The
  selected chip always paints its counter in the accent (`_slider.scss`: the
  `.active .badge` rule), even when the folder is entirely muted. The counter
  itself is tweb's `badge-20` (20px, 6px side padding, 14px text) sitting 5px
  after the label (`_badge.scss` size variants + `_slider.scss`
  `.menu-horizontal-div-item .badge`).
- Unread counters follow the row state, as in webk (`_chatlist.scss`:552-567 and
  the active-row block above it): an unmuted chat's badge is the accent
  (`--chatlist-status-color` = `--primary-color`), a **muted** chat's badge is
  `--secondary-color` (grey), and the selected row paints the badge white with
  the accent number. Rows carry tweb's `.is-muted` class
  (`dialogElement.setMuted`) so these states are plain CSS, and folder chips use
  the same muted/grey rule.
- The folder strip scrolls with the mouse wheel exactly like tweb's
  `Scrollable axis="x"` (`components/scrollable2.tsx`): a plain vertical wheel
  moves it by `deltaY / 4`, the native horizontal bar stays hidden, and picking
  a tab that is out of view scrolls it to the centre.
- Scrollbars are tweb's custom overlay bars (`_scrollable.scss`, the
  `custom-scroll` branch a Windows WebView2 gets): the native bar is hidden — so
  it takes no width from the rows — and a 5px `--scrollbar-color` capsule is
  drawn 1px from the inline edge, sized by tweb's formula
  (`max(20px, client / (scroll / client / 0.75))`), moved with `translateY`,
  faded in on hover and draggable. Rows therefore end 8px from the column edge
  with the bar floating in that gutter, like the real client. The same
  `useScrollThumb` hook is mounted on the conversation's message scroller
  (`MessageList`), so both the chat list and an open chat wear the identical
  capsule (the F conversation page otherwise still uses its own layout). Travel
  is clamped to the scrollport, so a padded scroller does not push the capsule
  past the bottom edge.
- Window chrome: with a signed-in session the F caption bar is hidden and the
  page fills the window like telegram web. A frameless desktop window still needs
  caption behaviour, so `KWindowChrome` adds an invisible 16 px strip along the
  very top (it covers only the wallpaper inset, never a control): dragging it
  moves the window with native caption behaviour (Aero snap, double-click), the
  same as dragging the empty chat column. Hovering the top edge (or that strip)
  fades in a Web K styled pill with minimise / maximise / close in the top-right
  corner; it hides itself again after the pointer leaves, and the tips lightbulb
  steps aside while it is up — at rest the page is indistinguishable from the
  reference. The maximise glyph switches to restore while maximised.

## Verification

`frontend/k-preview.html` (+ `?chat=1`) renders fixture data at a chosen viewport
and is used to diff screenshots against the reference capture:

```powershell
cd frontend; npm run dev
# http://127.0.0.1:9245/k-preview.html — headless Chrome/CDP captures at 1446×790@2
```

The reference was normalized from a P3 (wide-gamut) 2× screenshot; compare
structure/geometry directly, colours through a Display-P3 conversion.

## Remaining work (page-by-page)

1. Main menu (hamburger) — Web K menu panel.
2. Conversation view + composer + chat header.
3. Login/auth screens (their F caption bar is still the window chrome).
4. Settings, downloads, search results, archive view, chat-info column, tips deck
   (collapsed state is in place, the expanded deck is not).
5. Dark ("night"/"tinted") themes; the token file is ready for them.
6. Animated/moving wallpaper, custom chat backgrounds, stories rings, avatars
   videos — not part of the reference page.
