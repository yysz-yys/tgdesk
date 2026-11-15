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
| Stickers tip card (suggest mode + trending packs), its sticker-set preview popup and the trending Stickers tab | **Port done** (light/Night, en/zh/ja) |
| Settings (Web K home: self profile header, phone, sections, header menu, version) | **Port done** (light theme) |
| New Channel / New Group / Add Members flow | **Port done** (light theme) |
| Main menu (hamburger) with the More submenu and the Downloads entry | **Port done** |
| Letter avatars (non-photo peers, sender avatars, account avatar) | **Unified** on Web K's peer-colour gradients |
| Login / auth flow | still the F design |
| Conversation view (bubbles, composer, header) | still the F design |
| Downloads screen, search results, chat info sidebar | still the F screens (the chat list's K frame is around them) |

The reference capture is the Web K **`light`** AppTheme (`baseThemeDay`, the blue
"Day" palette) — not the older Classic `day` theme (green wallpaper/outgoing
bubbles). All colours below are that theme.

## Code map

```
frontend/src/components/k/          the Web K UI
  KMainScreen.tsx                   .page-chats → #main-columns → #column-left/#column-center
  KChatList.tsx                     left column: header, folder chips, list, archive, FAB, super-tab host
  KChatRow.tsx                      one .chatlist-chat row (title/time + subtitle + avatar)
  KAvatar.tsx                       54px avatar: photo / peer colour gradient / saved / archive
  KFolderTabs.tsx                   .menu-horizontal* chip strip with sliding active plate
  KSearchField.tsx                  InputSearch "old-style" 44px pill
  KEmptyChat.tsx                    service pill + chatTips lightbulb (portalled to the page)
  KSuperTab.tsx                     tweb's SliderSuperTab stack + KSuperTabHeader (slide in/out)
  KSettings.tsx                     the Settings home (peer profile + all sections + header menu)
  KNewChatFlow.tsx                  New Channel / New Group / Add Members pages
  KAppMenu.tsx                      main menu + the hover-opened More submenu
  KNewMenu.tsx                      the pencil/new-chat menu
  KArchiveMenu.tsx                  the archived-chats header menu
  KChatTips.tsx                     the tips deck
  KStickerMedia.tsx                 one sticker (still frame, looping TGS/WebM, premium lock)
  KStickerSetPopup.tsx              the sticker-set preview popup (tweb popups/stickers)
  stickerPopupStore.ts              popup state; App renders it in the page overlay slot
  stickerLockColor.ts               premium effect lock plate tint (tweb computeLockColor)
  KStickersPage.tsx                 "Stickers and Emoji" page: the trending pack list
  KThemeEmoticon.tsx                one theme tile's animated-emoji figure (Lottie)
  KThemeTileMask.tsx                a tile's Night mask wallpaper (gradient × doodles canvas)
  themeEmojiAssets.ts               the nine bundled TGS figures (first-paint assets)
  themeEmojiCache.ts                figure resolution: bundled → IndexedDB/kernel URL
  themeStore.ts                     global-theme application (accent + wallpaper) and active-theme store
  globalThemes.ts                   the eight global themes + factory tile (offline/preview fallback)
  tipsStore.ts                      tips deck state (open/index, persisted)
  KWallpaper.tsx                    page-wide gradient + doodle canvas
  KIcon.tsx                         tgico glyphs + the verified-badge SVG sprite
  rowIcons.ts                       tweb's colour-tile row-icon backgrounds
  model.ts                          Web K helpers (colour index, abbreviation, badges)
  icons.ts                          tgico name → codepoint map (653 icons)
  wallpaper.ts                      freeform gradient + pattern tiling algorithms
  useRipple.ts                      tweb's press ripple
frontend/src/styles/k/              plain CSS ported from tweb's SCSS
  tokens.css                        light "Day" theme custom properties
  base.css / fonts.css              reset, tgico font-face, Roboto 400/500/600
  shell.css / sidebar.css / tabs.css / chatlist.css / empty.css / wallpaper.css
  supertab.css / forms.css          sidebar super tabs + shared page atoms (sections, rows, inputs)
  settings.css / newchat.css        the two new page families
  archive.css / menu.css / scrollable.css / windowchrome.css / tips.css
  popup.css / stickers.css          the sticker-set popup + the Stickers settings page
frontend/public/assets/             bundled tweb assets
  img/pattern.svg                   doodle wallpaper pattern (1440×2960)
  tgs/UtyanSearch.json              the "No results" duck (Lottie, empty search state)
  tgs/themes/*.tgs                  the nine Appearance figures (TGS = gzipped Lottie JSON)
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
`light`/`night` entries of `colorMap` plus `base.scss`'s `:root`/`.night` blocks)
instead of living in SCSS. `styles/k/tokens.css` carries the resolved values for
both shells — the light block on `.k-root`, the Night block on
`.k-root[data-k-theme="dark"]` (surface `#212121`, background `#181818`, accent
`#8774E1`, secondary text `#AAAAAA`, the Night menu/ripple/shadow values, with
`--light-filled-*` re-mixed against the Night surface and `--dark-*` keeping the
same HSL `l-4` convention). The light values:

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

The dark shell's wallpapers all use the reference's **mask** render path, the
one tweb picks for a Night-base theme (`chatBackground.tsx`): the gradient is
dimmed to `max(.3, |intensity| / 2)` and covered by a black canvas with the
doodles punched out (`destination-out`), so the page reads almost black with the
theme's gradient showing through the doodle line art. That is what the official
Web K does for the factory Night wallpaper *and* for a cloud theme applied in
dark mode — the chick theme becomes a black page with the zoo doodles in its
night-green gradient, the snowman theme a black page with blue snowflakes, and
so on. (tweb's full-opacity inverted-overlay blend only applies to its separate
"Tinted" dark-blue theme, which this port does not expose.) The Appearance
tiles preview the same look through `KThemeTileMask`: a 72×96 canvas that keeps
the gradient only along the doodles, because a cross-origin SVG cannot be used
as a CSS `mask-image` while drawing it into a canvas works.

Cloud themes carry four palette variants in the reference: Day, Classic, Night
(`baseThemeNight`) and Tinted. The Night entry is the one the dark shell paints —
its `accent_color` drives the selected dialog row's fill, the folder chip's 8%
plate and label, Saved Messages' gradient, links and the pencil button, and its
wallpaper gradient feeds the black mask wallpaper. For example the 🌷 theme's
Night accent is `#eb6b8e` (the row fill the reference shows) where the Tinted
entry — the only dark variant the `account.getChatThemes` answer reachable here
carries — is `#bd6384`, which is why dark mode used to read duller, and the 🎄
theme's Night accent is `#7db55d` (an olive green pencil button) where Tinted is
`#59854a`. The bundled theme table (`globalThemes.ts`) carries the official
Day/Classic/Night/Tinted entries for all eight themes; `themeStore` prefers the
Night entry for dark mode, and the live list is merged onto the bundled one so
the kernel's pattern-document URLs still paint the wallpapers. The light shell
prefers the Day entry (`baseThemeDay`), which is a slightly different accent from
Classic (💎 `#9475c8` vs `#b858d1`) and whose own wallpaper is the plain white
day no-file one, so the Classic pastel doodle wallpaper is kept instead — the
reference's `getCloudThemeWallpaper` behaviour. The Appearance strip fetches its
themes the way the reference does —
`account.getThemes` with the `macos` format first, then `account.getChatThemes` —
so custom account themes show up too.

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
  saved gradient, localized `我的收藏` title. The saved gradient follows the theme
  accent with tweb's formula (bottom = the accent, top = the accent mixed 64% with
  white), so it stays the bright two-tone gradient in the dark shell too.
- Chats with an auto-delete timer wear tweb's TTL badge on the avatar
  (`avatar-auto-delete-timer`): a 22px circle in the bottom-right corner with the
  dashed outline glyph, the period number and its unit ("1D", "2D", "3W", …) over
  a plate tinted with the avatar colour — or with the blurred bottom-right quarter
  of the photo for image avatars (`computeLockColor`), so the "2D" chip sits on
  the 一分机场 logo exactly like the reference. The period is matched against
  tweb's option list (1–8 hours, 1–6 days, 1–3 weeks, 1–6 months, 1 year) with its
  10% tolerance; other values fall back to the clock glyph.
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
  Contacts, Calls, Settings, **Downloads** and the More submenu, split by the
  same separators. It is a `.k-menu` on tweb's desktop metrics (`.btn-menu`: frosted
  `rgba(255,255,255,.85)` + `blur(50px)`, radius 16, shadow `0 0 10px rgba(0,0,0,.15)`,
  32px items with 20px icons, 14px/500 labels) and animates in with the 0.2s
  `cubic-bezier(.4,0,.2,1)` scale(.8)→1 + fade. The account row opens Settings, like
  the real client. Pages that are not ported yet (Add Account, My Stories, Contacts,
  Calls) surface a localized "arrives with the next pages" toast.
  **More** opens its submenu on hover (tweb's `createSubmenuTrigger`): Enable/Disable
  Dark Mode, Reduce/Disable/Enable Animations, Switch to A version, Telegram Features,
  Report Bug, Install App and Picture-in-Picture, with the muted version line
  "Telegram WebK 2.3 (687)" at the bottom (tweb `getVersionLink`). The entries the
  desktop shell cannot do (A version, PWA install, Document PiP) announce themselves
  with a localized explanation; Features/Report Bug open the Telegram URLs.
- **New-chat menu (pencil / FAB)**: `KNewMenu` opens above the corner button, aligned to its
  end, with tweb's three entries — New channel, New group, New private chat (the group-call
  entry is intentionally left out); the pencil icon morphs into a cross while open
  (`.menu-open` swap with a scale/fade) and the menu itself uses the same `.k-menu` plate.
  New channel/group open their page as a sidebar super tab (below); New private chat
  still announces the contacts page.
- **Sidebar super tabs**: `KSuperTabHost` reproduces tweb's `SliderSuperTab` stack
  (`slider.ts` + sliderTab.ts + `transition.ts`): settings and the new-chat flow slide
  in over the chat list from the inline end while the page underneath moves a quarter of
  the column towards the start and dims to 80%, and closing reverses the pair (250–300 ms,
  `--transition-standard-in/out`). The header is tweb's `.sidebar-header` with the
  `.sidebar-close-button` back arrow; the content scrolls with the same overlay scrollbar
  as the chat list. The stack is owned by `App` (`sidebarPage`), so opening a chat,
  Downloads or the archive closes the page.
- **Settings (Web K home)**: `KSettings` follows tweb `sidebarLeft/tabs/settings.tsx` +
  `peerProfile.tsx`: the self profile header (120px gradient avatar, 20px/500 name,
  online status), the phone section (the number is grouped like Telegram Web and a
  tap copies it), then the section cards
  built from tweb's `Section`/`Row` atoms — Notifications and Sounds, Data and Storage,
  Privacy and Security, General Settings, Chat Folders, Stickers and Emoji, Speakers and
  Camera, Devices (count from `account.getAuthorizations`), Language (current UI
  language) and Keyboard Shortcuts; then Telegram Premium / Telegram Business / Send a
  Gift, then Telegram FAQ / Ask a Question, then the version line. Row icons are tweb's
  colour tiles (`rowIcons.ts`, `getRowIconBackground`). The header carries the search
  button and the three-dot menu (Edit Profile, QR Code, Log Out — QR reuses the existing
  QR sheet for accounts with a username, Log Out is the real one). Sections this build
  has no screen for show the localized "arrives with the next pages" toast;
  Data and Storage / General Settings / Language open the existing settings dialog.
  Strings live in `kSettings.*` for en/zh/ja.
- **New Channel / New Group / Add Members**: `KNewChatFlow` follows tweb
  `newChannel.tsx`, `newGroup.tsx`, `addMembers.tsx` and `emptySearchPlaceholder`:
  the grey page with one white 24px section card holding the 120px `.avatar-edit`
  circle (camera glyph), the name input and — for a channel — the optional description
  plus the caption, and the 54px corner arrow that only slides in once the name is
  valid (`btn-corner.is-visible`). New Group's arrow opens the Add Members page (the
  same navigation slide, inside the tab) with the old-style search pill, contacts/global
  search results as checkbox rows, and the duck Lottie + "No results / Try searching."
  empty state; its arrow is always available (skippable, like webk) and creates the
  group with the selected users. Creation goes through the kernel
  (`channels.createChannel`, `messages.createChat`), and the new chat opens in the
  middle column as soon as the dialog list refreshes. Strings live in `kNewChat.*`.
- **Letter avatars unified**: every non-photo avatar (chat list, chat header, sender
  avatars, member lists, the account avatar in the main menu, the F screens' `Avatar`
  atom) uses Web K's peer-colour gradient palette (red, orange, violet, green, cyan,
  blue, pink) picked by `abs(peerId) % 7` — `peerAvatarBackground()` in
  `data/telegram.ts`, with `Avatar`'s new `seed` prop; the flat colour is kept for
  text drawn in the peer's colour (sender names). The letters follow tweb's
  `getAbbreviation` (first glyph of the first word + first glyph of the last), are
  uppercased, and are 37% of the circle at weight 500.
- **Reduce/Disable Animations**: the More entry cycles tweb's liteMode levels
  (full → reduced → off → full, `settings.animations`); the K shell gets
  `data-animation-level` on `.k-root`, where reduced turns slides into fades and off
  disables transitions/animations. The saved preference survives restarts, like the
  other settings. The Dark Mode entry (and the Appearance tip's System / Dark /
  Light pills) toggles the whole app: the classic (F) screens through the Radix
  theme root and the Web K shell through `data-k-theme`, both resolving the same
  `settings.theme` preference.
- **Dark shell**: the Web K shell's brightness is `data-k-theme="light|dark"` on
  `.k-root` (`KMainScreen`), fed by `useTheme(settings.theme)` in `App.tsx`;
  `styles/k/tokens.css` carries the light block and a
  `.k-root[data-k-theme="dark"]` Night block ported from tweb's `colorMap.night`
  and `base.scss .night` (surface `#212121`, background `#181818`, accent
  `#8774E1`, white primary text, `#AAAAAA` secondary, Night menu/ripple/shadow/
  scrollbar values; every accent-derived `--light-*`, `--light-filled-*` and
  `--dark-*` value is re-mixed against the Night surface with tweb's formulas).
  The applied cloud theme follows the shell's side: `KThemeEmoticon`/`KWallpaper`
  aside, `themeStore.syncShellTheme` repaints `--primary-color` and its mixes from
  the theme's day or night settings in a layout effect, so System↔Dark↔Light
  switches repaint the accent, the wallpaper and the strip previews in one frame.
  The wallpapers themselves switch to `KWallpaper`'s Night render paths (the
  factory Night mask plate, the tinted overlay for cloud themes), and the
  Radix-portalled K dropdown menus (which live outside `.k-root`) key their Night
  colours off the app-wide `html[data-theme="dark"]` signal that `useTheme` sets,
  so the menus, archive menu and new-chat menu follow too.

- The hamburger is a webk icon button: a 40px round plate on
  `--light-secondary-text-color` while hovered or while its menu is open
  (`.menu-open`), exactly the plate the real client paints under it.
- **Global themes (Appearance tip)**: the theme engine is wired end-to-end —
  `themeStore.ts` applies a theme's accent to every shell token (`--primary-color`
  and its light/dark mixes) and publishes its wallpaper (gradient stops,
  intensity, pattern SVG) to `KWallpaper`. The kernel's `GetChatThemes` now calls
  `account.getChatThemes` (the live probe showed this is where Telegram keeps the
  global theme set: `account.getThemes` returns an empty list for this account),
  maps the eight global themes (🐥 ⛄ 💎 👨‍🏫 🌷 💜 🎄 🎮) with their day
  (`baseThemeClassic`) and night (`baseThemeTinted`) settings — accent, message
  colours, signed wallpaper intensity and gradient stops — and registers each
  wallpaper's pattern document on a lazy loopback endpoint (the document is a
  gzipped SVG; the kernel gunzips and serves it as `image/svg+xml`). The
  Appearance card is a horizontally scrolling strip of nine 72×96 mini-chat
  tiles: the factory "no theme" tile plus the eight themes, each with its
  gradient + pattern, outgoing accent bubble, incoming bubble and emoticon, and
  the active tile ringed in the accent. Selecting a tile applies the theme
  instantly (accent + page wallpaper) and is persisted in
  `tgdesk.k.themeId`; the first tile restores the factory Day wallpaper. The
  System / Dark / Light pills set the app theme preference and switch the strip
  between the day and night previews, and the applied theme follows the shell: its
  day (Classic/Day) side paints the light shell, its night (Tinted/Night) side the
  dark one, wallpaper included.
  `globalThemes.ts` carries the same eight themes as an offline/preview fallback,
  so the strip is complete even before the kernel answers.
- **Animated tile figures**: the figure at the bottom of each tile is the theme's
  Telegram *animated emoji* (`🏠` for the factory tile, then the theme emoticon),
  not a system font glyph. The nine the strip needs ship with the app as the
  original TGS files (`public/assets/tgs/themes`, gzipped Lottie JSON, ~276 KB in
  total), so the figures and their animations are ready on the very first launch,
  offline, and in `KPreview`; `KThemeEmoticon.tsx` renders them with the bundled
  lottie-web paused on their first frame. The kernel's `GetAnimatedEmojiStickers`
  (Telegram's animated-emoji sticker set via `messages.getStickerSet` +
  `inputStickerSetAnimatedEmoji`, served lazily on a `/emoji/…` loopback endpoint
  as gunzipped Lottie JSON) remains the live source for any emoticon not bundled
  — a theme Telegram adds later — and those downloads are cached in IndexedDB.
  Clicking a tile plays the reference's micro-animation (tweb's
  `chatThemesPicker`): after a 250 ms beat the figure is scaled to 2× over the
  standard transition, the Lottie runs once to its last frame and the figure
  settles back; a click on another tile cancels the previous one, and a click that
  lands while a non-bundled figure is still loading is replayed as soon as it is
  ready. The figures and the lottie renderer are warmed at idle, so opening the
  deck paints finished figures instead of flashing the fallback glyph. The motion
  only runs at the full animation level (2) with the OS reduce-motion preference
  off, and the active tile is not a click target, both as in tweb. The plain emoji
  glyph is only painted when no figure can be loaded at all.
- **Chat-tips deck**: the lightbulb in the page's top-right corner folds the deck in and out
  (`KTipsToggle`, lamp ↔ cross), exactly like tweb `components/chatTips` after the macOS
  widget: a 320×320 card centred in the empty column with custom Previous / Next service
  pills, all cards mounted in a stage and cross-faded/slid (±50px) by the step, the deck
  itself scaling down to .1 and fading out to the "Select a chat to start messaging" pill
  underneath (state persisted). Tips: **Appearance** (System / Dark / Light segmented row,
  the cloud-theme strip with live previews, and the description linking into Settings),
  **Stickers** (the `stickers.suggest` segmented row, the three trending packs and the
  description linking into the Stickers-and-Emoji page — see the next bullet) and
  **Chats** (a 4×2 grid of recent chats, click to open). Strings live in `tips.*` for
  en/zh/ja. A fresh profile starts with the deck collapsed — only the
  "Select a chat to start messaging" pill is on the wallpaper, like the
  reference capture.
- **Stickers tip card** (tweb `chatTips/stickersCard.tsx`): the segmented row is the real
  app setting — `tgdesk.settings` `stickersSuggest` with tweb's default `all`, three
  options None / My Sets / All Sets (`SuggestStickersNone/Installed/All`); the composer has
  no emoji→sticker suggestion feature yet, so the preference is stored for the future
  rather than consumed. The content is Telegram's `messages.getFeaturedStickers` showcase:
  the first three packs, each with the first document of `messages.getStickerSet` as an
  88×88 looping cover (static fallback = the pack thumbnail) over the pack title, fetched
  when the deck is opened and cached by the sticker API. Clicking a pack opens the
  sticker-set preview popup. The description (`ChatTips.Stickers.Description`, two lines
  reserved so the row sits where the reference has it in every language) links to the new
  Stickers-and-Emoji page. An empty/failed featured read keeps the content title and
  leaves the row blank, like tweb.- **Sticker-set preview popup** (tweb `popups/stickers.tsx` + `PopupElement`): a page-level
  modal, 30% black backdrop, 420×420 container with a 40px radius, a 56px header (40px
  close, 20/26 bold set title, three-dot menu) and a 5-column grid of 80px sticker cells
  (82px pitch, 2px row gap, hover plate at 12px radius) over a floating footer whose
  white→transparent gradient fades the last row under the 48px full-width pill button.
  Opening plays the reference's 150ms fade + 48px slide-up; Esc or a backdrop click closes
  it, and the page's overlay stack means the sidebar super tab behind stays put. The
  footer button installs/uninstalls the set (`messages.installStickerSet` /
  `messages.uninstallStickerSet`) — "ADD 40 STICKERS" filled in the accent, then
  "REMOVE 40 STICKERS" on the framed danger plate — and closes the popup when the RPC
  resolves, exactly like tweb; failures surface a toast. The three-dot menu offers Copy
  Link (`https://t.me/addstickers/<short_name>`) and, once installed, Archive Stickers
  (`messages.toggleStickerSets` via the existing kernel call). While the set and its first
  25 still frames load, the popup keeps tweb's preloader, the title reads "Loading..." and
  the footer is the unfilled secondary button. The scroll area uses the same Web K custom
  scrollbar as the chat list (5px capsule, fades in on hover) and draws the reference's
  top hairline once scrolled away from the start.
- **Sticker rendering**: cells paint the kernel's still thumbnail first and hand the loop
  to the picker's TGS/WebM players only while they are in view, staggered 40ms per cell, so
  opening a 40-sticker pack never builds forty Lottie instances in one frame and a loading
  cell is never blank (the still frame stays under the player until its first painted
  frame). Static documents use the full image. With animations disabled (lite mode 0) the
  grid stays on stills.
- **Premium effect locks**: Web K paints a 20px lock badge at the bottom centre of a
  premium "sticker effect" document (`withLock: true` in tweb's `wrapSticker`). The kernel
  now exposes `StickerDocDTO.effect` (the document's `video_thumbs`, i.e. tweb
  `getStickerEffectThumb`) and the badge uses tweb's `computeLockColor`: the sticker's
  bottom-centre colour dimmed by the grey 30% plate, so the Duck pack's four effect
  stickers wear the same warm plate as the reference. Premium accounts get no badge
  (`AuthUser.premium`, mirroring tweb's `body.is-premium`).
- **Stickers and Emoji tab** (`KStickersPage`): the tips description link and the
  Settings "Stickers and Emoji" row open the tab Web K composes from
  `sidebarLeft/tabs/stickersAndEmoji.tsx` + its trending body
  `sidebarRight/tabs/stickers.tsx`. The tab title slot holds the 44px `InputSearch`
  field ("查找贴纸" / "Search Stickers") next to the back button, and the content is
  one section per trending pack under tweb's `#stickers-container` rules: 140px
  `.sticker-set` blocks with the pack name (16 bold) over "N 张表情" (14 secondary),
  an Add/Added pill at the end (30px, radius 16, accent fill / tweb's literal
  `#f1f3f4` + secondary text plate), and the pack's first five stickers at 68×68
  spaced `space-around` (82px+ section rhythm). The previews load per section as it
  scrolls near the viewport; pressing a pack or one of its stickers opens the
  sticker-set popup, the Add/Added pill installs/removes the set with the same
  kernel calls as the popup, and scrolling switches the header to the surface
  colour plus its hairline (tweb's `scrollable-y-bordered`) over the Web K custom
  scrollbar. Reaching within 300px of the list's end (tweb's `onScrolledBottom`
  offset) appends the next page of older trending sets
  (`messages.getOldFeaturedStickers`, tweb's `OLD_FEATURED_STICKERS_LIMIT` of 40;
  a short page ends the list), so the tab keeps loading past the current packs the
  way the reference does: a page that maps to no rows chases the next one, a
  failed page leaves the offset for the next scroll, search pauses paging and
  clearing it restarts from the current list. Search filters the trending +
  installed lists by title in the client — the reference asks
  `messages.searchStickerSets`, which the kernel exposes only to the composer
  today. The Night palette comes from the K tokens, matching the reference's
  `#181818` page / `#2f2f2f` search ring. The full tweb tab (installed and archived
  sections, server search, the `readFeaturedStickers` read receipts) remains
  future work; the composer's picker still owns day-to-day sticker management.
  Dev screenshots for this page use `k-preview.html?page=stickers` with fixture
  packs (the preview does not page).
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
  same as dragging the empty chat column — except over the tips card and its
  Previous / Next pills, which opt out of the drag surface
  (`--wails-draggable: no-drag`) so the theme tiles and buttons take every
  click. Hovering the top edge (or that strip)
  fades in a Web K styled pill with minimise / maximise / close in the top-right
  corner; it hides itself again after the pointer leaves, and the tips lightbulb
  steps aside while it is up — at rest the page is indistinguishable from the
  reference. The maximise glyph switches to restore while maximised.
  The frameless window resizes natively from Windows' outer border
  (`SM_CYSIZEFRAME + SM_CXPADDEDBORDER`, 8 CSS px at any DPI), but the WebView
  paints its own cursor over that band, so before the fix the whole top edge
  showed the same arrow and trying to drag sometimes resized instead.
  `KWindowChrome` therefore paints the matching system cursors on the native
  resize band — `ns-resize` top/bottom, `ew-resize` sides, `nwse`/`nesw` corners
  — and the caption strip starts below it (the inner 8 px of the wallpaper
  inset) with the plain caption cursor; the band comes back when the window is
  restored from maximised, where Windows disables the resize border, and the
  floating narrow layout (8 px inset = only the resize band) hides the drag
  strip instead of shadowing card clicks.

## Verification

`frontend/k-preview.html` renders fixture data at a chosen viewport and is used to
diff screenshots against the reference capture:

```powershell
cd frontend; npm run dev
# http://127.0.0.1:9245/k-preview.html            main screen (empty state)
# http://127.0.0.1:9245/k-preview.html?chat=1     open-chat layout check
# ?page=settings                                 Settings home
# ?page=stickers                                 the Stickers-and-Emoji trending tab
#                                                (fixture packs; dark/light by ?night)
# ?page=channel / ?page=group                    the new-chat flows (group: click
#                                                the corner arrow for Add Members)
# ?menu=1                                        the hamburger menu (hover More for
#                                                its submenu via CDP Input events)
# ?tips=1                                        the chat-tips deck opened on the
#                                                Appearance theme strip
# ?night=1                                       the whole K shell in its Night
#                                                (dark) variant: dark tokens,
#                                                Night wallpaper and night theme
#                                                previews in the Appearance strip
# ?lang=en|zh|ja                                 UI language of the fixture
```

The setup runs headless Chrome/CDP at 1446×790@2 (or 754×1516@2 for the phone-like
reference captures of the sidebar pages). The archived chat list screenshot inside
the 360px column is the desktop check: the super-tab pages fill that column only, as
in the real desktop Web K.

The reference was normalized from a P3 (wide-gamut) 2× screenshot; compare
structure/geometry directly, colours through a Display-P3 conversion.

The Stickers tip card, its sticker-set popup and the trending Stickers tab need the
kernel's sticker API, so they are also checked against the reference in the running
app rather than the fixture harness. Two ways to do that without an app window in the
foreground:

```powershell
# 1. server mode serves the same build over HTTP (no WebView window at all)
go build -tags server -o bin/tgdesk-server.exe .   # embedded frontend/dist
$env:TGDESK_HOME = "E:\tg\tgdesk-verify"            # throwaway portable root
bin/tgdesk-server.exe                                # http://localhost:8080
# 2. drive it from headless Chrome over CDP
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=temp/chrome-verify about:blank
#    then Page.navigate to http://localhost:8080, set tgdesk.settings
#    (language/theme/proxy) in localStorage and use Emulation + Page.captureScreenshot
```

The trending tab was captured this way with the real featured packs and matches the
reference's 720×1518-device-pixel card crop on the search ring, back arrow,
title/count baselines, section pitch, Add/Added pills and preview grid; scrolling to
the end of its 231 current packs appended the older pages 40 rows at a time
(231→271→311→…→511) exactly as the reference's `getOldFeaturedStickers` paging does.
Use a copy of `bin/tdata` in the throwaway root (and remove it afterwards) so
account checks never run on the only `tdata`; install/uninstall checks are reverted
in the same session. `k-preview.html?page=stickers` stays the offline check for the
tab's layout.

## Remaining work (page-by-page)

1. Conversation view + composer + chat header (the biggest F page left).
2. Login/auth screens (their F caption bar is still the window chrome).
3. Downloads screen, search results, archive-view styling and the chat-info column —
   still the F screens inside the K frame.
4. Settings sub-pages (notifications, data and storage, privacy, chat folders,
   stickers, speakers and camera, devices, keyboard shortcuts, edit profile) and the
   settings search layer; the home screen is ported and those rows currently open the
   legacy settings dialog or announce themselves. The "Stickers and Emoji" tab's
   trending browser is ported (see above, including its older-featured infinite
   scroll); its installed/archived sections, the server-side
   `messages.searchStickerSets` search it opens with and the read receipts are still
   missing.
5. Animated/moving wallpaper, custom chat backgrounds, stories rings, avatars
   videos — not part of the reference page.
6. Avatar editing for new chats (the camera button on the new-channel/group pages
   announces itself today: the media editor is still the F one).
