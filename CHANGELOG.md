# Changelog

## Unreleased

### Design K: the conversation view is now the real Web K chat page

- **Pinned messages use Web K's floating plate**: the pinned bar is now the
  48 px plate under the top bar (`topbar-floating-plates`), with the accent
  "Pinned Message" title, the message preview (media label + text, no sender
  prefix), a 40×40 media thumbnail, the dashed 3 px border and `#N` counter for
  multiple pins, the pin menu (pinned list / unpin / hide, depending on
  `canPin`), a single close button, the 8 % accent hover, the `.2s` row roll on
  a pin switch and the per-chat "hidden until a newer pin" memory. The kernel
  returns the pin count, newest pinned id and the account's `canPin`
  (`GetPinnedMessageInfo`, `UpdatePinnedMessage`); `messages.updatePinnedMessage`
  unpins one message instead of dropping every pin.
- **The chat header is the Web K top bar**: 696 px lane, 48 px height, 24 px
  radius, the surface plate with the reference shadow, a 40 px avatar with a
  16 px gap, a 16/24 title with the verified badge, a 14/18 status line that
  turns accent for online/typing (with the animated three-dot typing line),
  search and more buttons as 40 px circles with 24 px glyphs and the in-chat
  search overlay with its result counter.
- **The scroll-to-bottom button is the real corner button**: 48 px circle at
  the composer lane end, `bottom: 48px + 8px`, surface plate with the Web K
  shadow, hidden with opacity/visibility (`.2s` standard-out transition,
  visibility delayed on hide), visible only when the history is more than
  300 px from the bottom (or the end is not loaded) and not in search mode, with
  the unread counter badge (primary, secondary when muted) and a smooth jump.
- **Composer per peer type, 1:1**: one 24 px/48 px plate shared by messages and
  composer (`--tg-chat-lane` 696 px, 16 px bottom gap), 40×40 controls with
  24 px glyphs, the morphing send/voice button and the official placeholders —
  "Message", "Broadcast" for channel admins, "Send anonymously" for anonymous
  admins, "Text is not Allowed" for read-only members — plus START (now via
  `messages.startBot`), Unblock, JOIN, APPLY TO JOIN GROUP, SUBSCRIBE and the
  Mute/Unmute footer with the gift button; restricted groups keep the normal
  plate with a read-only field instead of a separate bar, the invented slow-mode
  chip is gone (the send button shows the Web K tooltip countdown), bot commands
  are anchored to the plate (`/cmd@bot` in groups), the attach menu follows the
  Web K menu geometry and the emoji trigger gets the gray active plate.
- **Typing indicators end-to-end**: the kernel now forwards
  `updateUserTyping` / `updateChatUserTyping` / `updateChannelUserTyping` as
  `chat:event` typing events (display name resolved from the update entities,
  own user/bots/broadcast channels skipped) and sends `messages.setTyping`
  (`SendTyping`), throttled to once per 6 s with cancel when the field empties.
  The chat-list row swaps its preview for Web K's three animated dots plus
  "typing" / "Name is typing" / pair / "Name and N others are typing" (6 s
  expiry, 120 ms crossfade, white on the selected row), and the open chat's
  header shows the same line in accent.
- **Sent files are Web K document bubbles**: the 54 px document row (54×54
  extension plate, middle-ellipsised 16 px name, 14 px size line without the
  invented "· PDF"), extension colours (ZIP/PDF/APK/…), the dog-ear that opens
  on hover, and the download arrow that only appears on hover over the icon
  plate. Downloading morphs it into the Web K 12-dot preloader ring with the
  centre cross, progress arc and dots wave, pause returns the arrow, failure
  shows the retry glyph and a finished transfer removes the badge and opens the
  file. The always-on corner download badges on photos/videos are gone, the date
  plates are the accent-tinted 15 px pills, reaction chips are the 30 px
  Web K chips, sender names moved inside the bubble and message time/ticks use
  the reference sizes; the message column is the 696 px lane with the 46 px
  incoming gutter.
- **The third first-run tip is the real Web K Chats card** (`ChatTips.Chats`):
  the Popular / Searched / Recently closed segmented row that only shows the
  filters that have peers, the first-available fallback, the 4×2 grid of 54 px
  avatar tiles with one-line names, the official
  "Use Ctrl+F to enter search mode." description with a working search link
  (`Ctrl+F` focuses the sidebar search), the empty state, the reference
  card/nav geometry and the day/night colours. Popular comes from
  `contacts.getTopPeers` (cached 24 h in the kernel, `GetTopPeers`); Searched /
  Closed are recorded in the app's own recent-peer store from sidebar-search
  picks and chat switches. i18n en/zh/ja (the zh-hans WebK pack still lacks
  `ChatTips.*`, so those strings are app translations, documented).
- **New Group / New Channel / New Private Chat flows match the reference**: New
  Group starts on the Add Members page (search row with selected chips, results
  list with checkboxes, the duck empty state, the always-available corner arrow)
  and moves to the name/photo page with the Members section and a suggested
  title. Both creation pages can pick a profile photo: the avatar circle opens
  the file picker, the image is centre-cropped to an 800×800 JPEG in the canvas
  and, after the chat exists, uploaded with the new `SetChatPhoto`
  (`channels.editPhoto` / `messages.editChatPhoto` + `InputChatUploadedPhoto`);
  a failed photo upload keeps the created chat and shows a toast. "New Private
  Chat" opens Web K's contacts page (search pill, name/online sorting, 56 px
  rows, corner add-contact button) backed by `contacts.getContacts`
  (`GetContacts`).
- **Settings home reaches the reference geometry**: the profile block starts
  20 px from the top (the 4.5 px offset found by measuring the reference at the
  same viewport), desktop rows get the 16 px hover plate and the version line
  gets the reference bottom padding — the rest of the page already matched the
  reference row pitch/card/icon metrics.
- Tests cover the new kernel paths (top peers mapping/cache, typing action
  mapping/peer decoding/self-bot-channel skips, contacts mapping with presence,
  chat-photo validation/dispatch, pinned count/canPin) and the preview harness
  gained the full chat-page scenario matrix (peers, pinned states, files'
  download states, typing seeds, new-chat pages, tips data) used to verify the
  reference geometry.

### Performance: media-heavy chats and older history feel like Telegram Web

- **Message bubbles stopped fetching full-size photos**: `PhotoCard` used the
  full `/photo` URL as the bubble image, so opening a photo chat downloaded the
  largest Telegram size (up to 2560 px) for every photo near the viewport — on a
  25-photo group that was 1.4 MB and several seconds through the loopback media
  server, all competing with the history call. Bubbles now render the thumbnail
  (`media.thumbUrl`) exactly like Telegram Web; the full photo is fetched only
  by the detached viewer. Web-page preview cards also prefer the thumbnail and
  keep the full page photo as a fallback.
- **Instant blurred photo preview from the bytes already in the message**:
  every photo/video message Telegram ships a tiny stripped JPEG
  (`photoStrippedSize` / `photoCachedSize`). The kernel now rebuilds that JPEG
  into a data URL (`media.placeholderUrl`, size-selection helper
  `strippedThumbJPEG`) and the bubble paints it with a 12 px blur under the
  real thumbnail, which is the same first paint Telegram Web gets from its
  stripped-thumb canvas: no loopback request and no MTProto round trip per
  image. Because data URLs stay valid across restarts, the local message
  snapshot keeps the placeholder and a cold start also paints the blurred
  photos immediately.
- **Media data-center connections are opened in parallel and warmed early**:
  Telegram stores every file in the DC it was uploaded to, so one chat needs
  thumbnails from several DCs; connecting a DC costs an auth transfer plus a
  handshake (measured 3–4 s through the configured proxy). The kernel now keeps
  one file connection per DC, opens different DCs concurrently instead of
  serializing them in tdl's single pool lock, and starts those connections while
  history/dialog DTOs are still being mapped — the chat-list avatars and the
  first message thumbnails no longer pay the handshake on their critical path.
- **The loopback media origin is stable across launches**: the media token is
  persisted (`data/media/token`) and the loopback port is derived from the
  portable data path, so image URLs are identical on every start and the
  WebView's HTTP cache keeps serving previously seen avatars and thumbnails
  instead of re-downloading them. The loopback image id also ignores Telegram's
  rotating file reference (it only hashes the photo/document id, access hash,
  thumb size and DC, which name the same bytes), so message thumbnails and full
  photos keep their URLs too — previously every file reference refresh made all
  of them cache misses. This mirrors Telegram Web's persistent media cache; a
  second launch shows the chat list avatars from disk immediately.
- **Older history is prefetched**: opening a chat now fetches the two pages
  above the viewport in the background (`olderPrefetch` buffer in `App.tsx`),
  so reaching the top of the timeline prepends them from memory with no
  spinner and no `messages.getHistory` wait, then refills one page ahead. This
  is the local-database scroll behaviour Telegram Web has; the kernel dialog
  cache and the per-chat snapshot are unchanged.
- Kernel tests cover the stripped-JPEG frame rebuild, the cached-size
  preference and the data-URL mapping.

### Design K: resize and drag cursors on the frameless window

- **The top edge now shows a resize cursor only where the window resizes**: the
  frameless window resizes from Windows' native outer border
  (`SM_CYSIZEFRAME + SM_CXPADDEDBORDER`, 8 CSS px at any DPI), but the WebView
  kept painting the page's cursor over that band, so the top edge looked the same
  everywhere and a drag attempt there could become a resize. `KWindowChrome` now
  paints the matching system cursors exactly on the native resize band —
  `ns-resize` on the top and bottom edges, `ew-resize` on the sides,
  `nwse-resize`/`nesw-resize` on the corners — while the caption drag strip starts
  below the band (the inner 8 px of the wallpaper inset) with the plain caption
  cursor. The resize overlays hide again while the window is maximised (Windows
  disables the resize border then); the floating narrow layout has only the 8 px
  inset — all of it resize band — so it hides the drag strip rather than shadowing
  card clicks. Native resize, Aero snap, double-click maximise and the fade-in
  window controls are unchanged.

### Design K: the Stickers tip and the sticker-set preview popup

- **The second first-run tip is now the real Web K Stickers card**: the
  "Suggest Stickers by Emoji" title and the None / My Sets / All Sets segmented
  row (tweb's `appSettings.stickers.suggest`, default `all`, persisted in
  `tgdesk.settings`), the Trending Stickers content with three 88×88 looping
  pack covers (Telegram's `messages.getFeaturedStickers` showcase, first
  document of each set) over the pack names, and the description linking into
  the ported Stickers-and-Emoji page. Opening a pack opens the sticker-set
  popup; the content row keeps the reference's geometry in every language (the
  description reserves two lines) and an empty/failed featured read leaves the
  row blank like tweb.
- **Sticker-set preview popup ported 1:1** (tweb `popups/stickers.tsx` over
  `PopupElement`): 420×420 container, 40px radius, 30% black backdrop, 56px
  header (close / 20/26 bold set title / three-dot menu), a 5-column grid of
  80px sticker cells on an 82px pitch with the 12px hover plate, and the
  floating footer whose white gradient fades the last row under the 48px pill
  button. The footer button installs or removes the set — `ADD 40 STICKERS`
  filled in the accent, `REMOVE 40 STICKERS` on the framed danger plate — and
  closes when the RPC resolves, exactly like the reference; the menu copies the
  `t.me/addstickers` link and archives an installed set. Opening plays tweb's
  150ms fade + 48px slide-up, Esc and the backdrop close it, the scroll area
  uses the Web K custom scrollbar and draws the reference's top hairline once
  scrolled. While loading it keeps tweb's preloader, "Loading..." title and
  secondary footer button.
- **Premium effect locks**: the kernel now exposes `StickerDocDTO.effect`
  (from the document's `video_thumbs`, tweb `getStickerEffectThumb`), and the
  popup paints tweb's 20px lock badge at the bottom centre of premium "sticker
  effect" documents, tinted from the sticker's own bottom-centre colour
  (`computeLockColor`) — the Duck pack's four effect stickers match the
  reference plate for plate. Premium accounts hide the badge
  (`AuthUser.premium`, mirroring tweb's `body.is-premium`).
- **Sticker cells load like the rest of the app**: still thumbnails paint
  immediately, TGS/WebM players mount only for the cells in view (staggered
  40ms each) and the still frame stays under a player until its first frame is
  painted, so a forty-sticker pack neither builds forty Lottie instances in one
  frame nor shows blank cells while the loopback server streams the files.
- **New "Stickers and Emoji" page** (opened by the tip's description link and
  by the Settings row): initially a reduced trending list; it now says goodbye to
  the row layout and becomes the full trending tab described below.
- i18n: the tip and popup strings live in `tips.*` / `stickerSet.*` for
  en/zh/ja, using the official WebK zh wording where it exists ("根据表情符号建议贴纸",
  "不推荐", "我的表情包", "全部", "热门贴纸", "添加 N 张表情") and matching ja labels;
  the lock badge and popup menu strings are covered too. `AddStickersCount`'s
  Japanese word order is baked into the per-language strings.

### Design K: the trending Stickers tab

- **The "Stickers and Emoji" tab is now the real Web K trending browser**: the
  tab Web K opens from the Stickers tip's "Trending Stickers" link (and from the
  Settings row) swaps its title slot for the 44px `InputSearch` field and lists
  Telegram's featured packs under tweb's `#stickers-container` rules — a 140px
  section per pack with the name (16 bold) over "N 张表情" (14 secondary), a 30px
  Add/Added pill (accent fill, or tweb's literal `#f1f3f4` plate with secondary
  text once added) and the pack's first five stickers at 68×68 spaced
  `space-around`. The previews load lazily as each section scrolls into view,
  pressing a pack (or one of its previews) opens the sticker-set popup, the pill
  installs/removes the set through the same kernel calls as the popup, scrolling
  switches the header to the surface plate with its hairline, and the page uses
  the Web K custom scrollbar. The Night surface (`#181818` page, `#2f2f2f` search
  ring) and text tokens are the reference's. Search filters the trending and
  installed packs by title in the client (the reference asks
  `messages.searchStickerSets`, which the kernel exposes only to the composer);
  the installed/archived sections, server-side search and the
  `readFeaturedStickers` read receipts remain future work.
- **The trending tab keeps loading like the reference**: reaching within 300px of
  the end of the list (tweb's `onScrolledBottom` offset) appends the next page of
  older trending sets through the new kernel `GetOldFeaturedStickerSets`
  (`messages.getOldFeaturedStickers`, tweb's `OLD_FEATURED_STICKERS_LIMIT` of 40,
  a short page ends the list) — the current 231 packs then 40 rows per end, page
  after page. A page that maps to no rows chases the next one, a failed page
  leaves its offset for the next scroll, search pauses paging and clearing it
  restarts from the current list.
- Verified live against the reference capture from a live account, driven headless
  through the server-mode build: the search ring (44px), back arrow, title/count
  baselines, 140px section pitch, Add/Added pills and the 68px preview grid land
  within one device pixel, the pill installs/removes the real set, and scrolling
  to the end of the 231 current packs appended the older pages one at a time
  (231→271→311→…→511 rows, each a real older featured set).
- `?page=stickers` on the preview harness (`k-preview.html`) renders the tab with
  fixture packs, so its layout can be captured without a kernel or network.

### Design K: the dark (Night) theme

- **The Web K shell now has its Night theme**: dark mode (the menu entry and the
  Appearance tip's System / Dark / Light pills) switches the K pages from the
  light token set to Web K's Night one — `#212121` surfaces, `#181818` page and
  search fields, white primary text, `#AAAAAA` secondary text, the `#8774E1`
  factory accent, Night hover/ripple/scrollbar/menu/shadow values and the Night
  highlighting colour. The whole ported surface follows: chat list, folder chips,
  search, FAB, settings, new-chat pages, menus, window-chrome pill and the tips
  deck, all derived from tweb's `colorMap.night` + `base.scss .night` formulas.
- **Night wallpapers render like the reference**: every dark wallpaper uses the
  doodle *mask* path from tweb's `chatBackground` — a black plate with the
  doodles punched out, the gradient dimmed to `max(.3, |intensity|/2)` and
  showing through the line art. That matches the official Web K for the factory
  Night wallpaper and for a cloud theme applied in dark mode (the chick theme
  becomes a black page with its zoo doodles in the theme's night-green gradient,
  the snowman theme a black page with blue snowflakes, …); the Appearance tiles
  preview the same look on a small canvas (a cross-origin SVG cannot be a CSS
  mask, but it can be drawn into a canvas).
- **Applied themes follow the shell**: a global theme now switches between its
  day (Classic/Day) and night (Tinted/Night) settings when the shell flips
  brightness — accent, derived mixes, highlighting and wallpaper all repaint in
  the same layout frame; the Appearance strip previews the matching side.
- **The Saved Messages avatar keeps its bright gradient in dark mode**: its top
  colour is the accent mixed with white (tweb `applyAppColor` saved-color:
  `lightenAlpha .64`, `mixColor` white, in every theme), so a dark-shell theme
  shows `#93bb99 → #56945f` for the chick theme instead of the dark-olive mix it
  had before. The factory Night pair is `#b2a6eb → #8774e1`.
- **Menus are portalled outside `.k-root`**, so the K dropdowns (hamburger,
  archive, new-chat, settings menu) key their Night plate/text/hover colours off
  the app-wide `html[data-theme="dark"]` signal instead of the K tokens; the
  light theme is pixel-identical (verified by A/B screenshots).
- `?night=1` on the preview harness now renders the whole shell dark; the light
  theme, layout geometry, typography and motion are unchanged.

### Design K: cloud-theme accents on the dark shell

- **The light shell uses the Day palette of a global theme**: the official
  theme objects carry a separate `baseThemeDay` palette from Classic, and the
  reference's light mode paints the Day entry (a slightly different accent —
  e.g. 💎 `#9475c8` instead of Classic `#b858d1`). Its own wallpaper is usually
  the "plain day white" no-file wallpaper, so the reference borrows the Classic
  pastel doodle wallpaper instead (tweb's `getCloudThemeWallpaper`). The shell
  now does the same: light mode picks the Day accent and keeps the Classic
  wallpaper, matching the official folder chip (plate `#f5f3f9`), Saved
  Messages gradient and Appearance tiles.
- **Light/dark switches spread from the clicked control**: switching the theme
  from the main menu, the Appearance tip or Settings now uses the reference's
  View Transitions reveal — the new appearance grows as a circle from the
  clicked button (`themeController.setTheme`'s standard 300/250 ms easing,
  stretched to the snapshot duration). The reduced-motion level cross-fades
  instead, and animations off (or a browser without View Transitions) switch
  instantly. A stalled transition is force-skipped after 2.5 s.

- **Global themes use the reference's Night palette in dark mode**: the official
  theme objects carry four palette variants — Day, Classic, Night
  (`baseThemeNight`) and Tinted — and the Night entry defines the dark shell's
  accent and wallpaper (the 🌷 theme's `#eb6b8e` accent, the chick theme's
  `#84ce65`, the tree theme's `#7db55d`, each with its own dark wallpaper
  gradient). The `account.getChatThemes` answer this port can fetch predates
  those variants and ships only Classic + Tinted, so the shell used to paint
  dark mode with the Tinted palette — a dull mauve row where the reference is
  bright pink, and a teal pencil button where the reference is olive green.
  The bundled theme table now carries the official four variants, the shell
  picks the Night entry for dark mode, and the live list is merged onto it
  (keeping the live pattern-document URLs), so dark mode matches the reference
  for all eight themes. The light shell keeps the Classic/Day palettes and the
  factory Day/Night accents are untouched.
- The Appearance strip now prefers the official Web K theme source: the kernel
  asks `account.getThemes` with the `macos` format first (what the reference
  appearance card calls) and falls back to `account.getChatThemes`, so custom
  account themes appear the way they do in the reference.

### Design K: chat-list auto-delete badges and avatar colours

- **The TTL badge is back on every avatar**: chats with an auto-delete timer draw
  tweb's `avatar-auto-delete-timer` in the avatar's bottom-right corner — the
  dashed outline glyph with the period number and unit ("1D", "2D", "3W", …) on a
  plate tinted with the avatar colour. Image avatars get the plate from the
  blurred bottom-right quarter of their photo (`computeLockColor`), so the "2D"
  chip sits on a photo logo the way the official Web K shows it; previously the
  badge was only drawn on letter avatars and always said "1D".
- The period is matched against tweb's option list (1–8 hours, 1–6 days, 1–3
  weeks, 1–6 months, 1 year) with its 10% tolerance; unmatched periods show the
  clock glyph. The badge shows for photo and coloured avatars alike, in both
  shells.
- Saved Messages' avatar keeps the reference's bright accent/white gradient in
  the dark shell (formula from the previous entry); the rest of the peer palette
  is the same fixed Web K palette in both themes, so the letter avatars match the
  official colours.

### Design K: Telegram Web K main screen

- **Signed-in main screen rebuilt 1:1 from Telegram Web K (tweb)**, light "Day"
  theme: the page-wide doodle wallpaper (50×50 freeform gradient + tiled
  pattern.svg composited with `soft-light`, ported algorithms), the floating
  360 px white sidebar card on a 16 px page inset, the 48 px bottom-right pencil
  FAB, and the empty middle column with the "选择一个会话开始聊天" service pill
  and the top-right tips lightbulb. The F caption bar is hidden while signed in;
  the empty chat column is the window drag surface.
- **Sidebar markup/CSS ported from tweb**: hamburger + old-style 44 px search
  pill (focus state, clear button), folder chip strip (sliding active pill,
  unread-chat badges, 24 px plate radius), and 72 px chat rows built on Web K's
  geometry — 54 px avatar on the `abs(peerId) % 7` gradient palette, 16 px/500
  title with verified and muted icons, 16 px preview, 12 px time with Web K
  single/double read checks, unread badge, auto-delete "1D" avatar badge — plus
  the archived-chats row (blue gradient avatar, unread *chat* count and a
  ten-title preview list) and Saved Messages.
- **Real Web K icons and fonts**: bundles the tgico icon font (653-glyph
  codepoint map) and the Roboto 400/500/600 subsets, replacing Material icons and
  Inter on this screen; CJK still falls back to the Windows UI font.
- **Web K behaviour**: the app opens with no chat selected; row hover plates,
  active-row primary fill, press ripples and the folder-pill slide animation are
  ported from tweb; sidebar search filters across all folders; the folder strip
  scrolls with a clipped last chip.
- **Web K buttons and first launch**: the hamburger now paints webk's round
  hover/menu-open plate, and a fresh profile opens on the empty screen Web K
  shows first — just the "Select a chat to start messaging" pill, with the tips
  deck folded until the lightbulb is pressed.
- **Web K menus**: the hamburger now opens Web K's main menu (account row, Add
  account, Saved Messages, Archived chats with its unread-chat badge, My
  stories, Contacts, Calls, Settings and the More submenu), and the pencil opens
  the new-chat menu above it (New channel / New group / New private chat — no
  group-call entry; the pencil turns into a cross while open). Both use tweb's
  frosted `.btn-menu` plate and its 0.2s scale/fade, and are localized in
  English, 中文 and 日本語.
- **Chat-tips deck**: the lightbulb folds in and out a Web K-style tips deck —
  a 320×320 card centred on the empty column with Appearance / Stickers / Chats
  tips and Previous / Next pills. Appearance shows the System / Dark / Light row,
  the theme-preview strip and the link into Settings; Chats is a grid of recent
  chats. The deck scales and fades between the card and the "select a chat"
  pill, and remembers whether it was left open.
- **Archived chats screen**: clicking the archive row now opens a proper Web K
  sidebar tab — its own header (back arrow, "已归档对话", three-dot menu) and an
  archive menu (mark all as read, hide/show the archive row), with tweb's
  navigation slide animation in and out (back button, Escape or picking a chat
  returns to the list, which keeps its place).
- **Sender names in group previews**: chat rows now prefix a group's last
  message with its author — "Name: text" and "You: text" for your own — the way
  the real client's list does (kernel `ChatDTO.lastSender`).
- **Folder counters match Web K**: the chip counter is the 20px badge sitting
  5px after the folder name (Web K's `badge-20` + its 5px gap), and an unselected
  folder chip keeps its counter
  grey only while every unread chat in it is muted (one unmuted unread chat makes
  it blue), and the selected chip always paints its counter in the accent, even
  for an all-muted folder.
- **Muted chats count in grey**: the unread badge of a muted chat is the grey
  `--secondary-color`, only unmuted chats get the blue accent badge (and the
  selected row paints its badge white) — matching Telegram Web K instead of
  colouring every counter blue.
- **Soft fade under the floating sidebar panel**: the chat list now scrolls under
  the search/folder panel like webk, with the surface-coloured gradient that
  fades a row out as it passes behind the chip plate — the soft "ghost" under
  the tabs — instead of cutting the row off sharply.
- **Folder tabs on cold start**: the folder list is cached per account locally
  and shown immediately when the app opens, then refreshed from the server in
  the background (no more empty tab strip while the first connection is being
  established). Folders now also include their archived chats unless the folder
  excludes them, so a folder that only holds archived chats is no longer empty,
  and its tab counts those unread chats.
- **Web K scrollbars everywhere**: the conversation's message list now uses the
  same 5px capsule scrollbar as the chat list (translucent `rgba(0,0,0,.2)`,
  1px from the edge, fades in on hover, draggable, system bar hidden so it takes
  no layout width) instead of the old always-visible 8px bar.
- **Web K scrolling**: the folder chip strip now scrolls with the mouse wheel
  (a plain wheel walks it sideways, a tab picked out of view scrolls itself to
  the centre), and the chat list uses Web K's own overlay scrollbar — the native
  bar is replaced by a 5px capsule that fades in on hover, can be dragged, and
  no longer takes 6px off the row width (rows now end 8px from the column edge,
  exactly like the real client).
- **Frameless window chrome**: the signed-in shell has no caption bar, so an
  invisible drag strip along the top 16 px (the wallpaper inset) moves the window
  with native caption behaviour and the empty chat column stays draggable; a
  Web K-styled pill with minimise / maximise / close fades in when the pointer
  reaches the top edge and hides itself again, so the idle page stays 1:1. The
  tips lightbulb steps aside while the controls are shown.
- Kernel `ChatDTO` gained the list decorations this needs: `lastOut`,
  `lastChecks` (single vs double check), `lastMedia` (media icon), `ttl`
  (auto-delete period) and `colorIndex` (avatar palette).
- Remaining pages (login, conversation, downloads, search, archive-view
  styling, expanded tips deck) are still the F design; see
  [docs/design-k.md](docs/design-k.md).

### Design K: Web K settings, main menu, new chats and unified avatars

- **Settings rebuilt as a Web K sidebar page**: opening your account row or
  Settings in the main menu now slides in the real Web K settings screen (tweb's
  `SliderSuperTab` navigation animation) — the self profile header with the
  gradient avatar, name and online status, the tappable phone-number section, and
  the coloured-icon section cards: Notifications and Sounds, Data and Storage,
  Privacy and Security, General Settings, Chat Folders, Stickers and Emoji,
  Speakers and Camera, Devices (with the account's session count from
  `account.getAuthorizations`), Language and Keyboard Shortcuts, then Telegram
  Premium / Business / Send a Gift and Telegram FAQ / Ask a Question, closing with
  the version line. The header has the search button and the three-dot menu (Edit
  Profile, QR Code, Log Out). Sections whose screens are not ported yet explain
  themselves; Data and Storage, General Settings and Language open the existing
  settings dialog. Every string is localized in English, 中文 and 日本語
  (`kSettings.*`).
- **Main menu matches Web K**: the account row opens Settings, and a new
  **Downloads** entry sits in the menu. The **More** submenu opens on hover with
  Web K's entries — Enable/Disable Dark Mode, Reduce/Disable/Enable Animations,
  Switch to A version, Telegram Features, Report Bug, Install App and
  Picture-in-Picture — closing with the "Telegram WebK 2.3 (687)" version line.
  Dark Mode toggles the classic screens' theme; Reduce/Disable Animations cycles
  Web K's three animation levels (slides become fades, then everything is
  instant) and is remembered; Features and Report Bug open the Telegram pages,
  while the A-version, installer and Picture-in-Picture entries explain why they
  do not apply to this desktop build.
- **New Channel / New Group / Add Members pages**: the pencil menu now opens the
  Web K creation flow as a sidebar super tab. New Channel has the 120 px avatar
  editor circle, the channel-name field, the optional description and Web K's
  caption; New Group has the same form and its corner arrow opens the Add Members
  page — search over your contacts and global Telegram users, checkbox rows, and
  Web K's duck illustration with "No results / Try searching." when nothing
  matches. Both corner arrows slide in as the form becomes valid (the Add Members
  one is always available, since adding people is skippable) and creation calls
  the new kernel APIs (`channels.createChannel`, `messages.createChat`), then
  opens the new chat in the middle column.
- **Letter avatars unified with Web K**: every non-photo avatar — chat list, chat
  header, message sender avatars, member lists, the main-menu account avatar and
  the F screens' avatar atom — now uses Web K's seven-colour peer gradient
  (`abs(peerId) % 7`, red/orange/violet/green/cyan/blue/pink), uppercased
  initials at tweb's letter scale, instead of a flat fill. The flat colour is
  kept where it is really text (sender names).
- Kernel additions: `CreateChannel`, `CreateGroup`, `InviteToChannel`,
  `SearchContacts` (contacts.search) and `GetActiveSessionCount`, plus
  `AuthUser.colorIndex` and a `ContactDTO`.
- Remaining pages (login, conversation, downloads, search, archive-view styling,
  expanded tips deck, settings sub-pages, dark theme) are still the F design; see
  [docs/design-k.md](docs/design-k.md).

### Design K: Telegram's global themes in the Appearance tip

- **The Appearance tip now shows the real Web K theme strip**: nine horizontally
  scrolling 72×96 mini-chat thumbnails — the factory "no theme" tile plus
  Telegram's eight global themes 🐥 ⛄ 💎 👨‍🏫 🌷 💜 🎄 🎮 — each painted with its
  gradient wallpaper, doodle pattern, an outgoing accent-gradient bubble and an
  incoming bubble, with the theme's emoticon at the bottom and a 2px accent ring
  around the selected tile. Scrolling works with the mouse wheel, and the strip
  fits the 320px tips card without pushing the description out.
- **Picking a theme applies it for real**: the accent repaints the Web K shell
  and the wallpaper (gradient stops + tiled pattern) replaces the page canvas
  immediately, and the choice survives restarts. The first tile restores the
  factory Day wallpaper.
- **System / Dark / Light work**: the pills set the app's theme preference, and
  the strip previews the themes' day or night variants accordingly.
- **Kernel now returns the actual global theme set**: `account.getChatThemes`
  (not `account.getThemes`, which returns an empty list for this account) with
  each theme's day (`baseThemeClassic`) and night (`baseThemeTinted`) settings —
  accent, message colours, signed wallpaper intensity and gradient stops. The
  wallpaper pattern documents (gzipped SVG) are served lazily by the loopback
  media server as `image/svg+xml`, and the eight themes also ship as an offline
  fallback so the strip is never empty.
- **The theme tiles click reliably**: the empty column is the window drag
  surface, and the tips card / Previous-Next pills used to inherit it, which
  swallowed clicks on the tiles and toggled maximise on double-click. They now
  opt out of the drag surface. Also, the selected folder chip no longer loses
  its label under a theme: the chip plate is Telegram's 8%-accent-on-surface
  mix (it had been mixed the other way round, ending up nearly the accent
  colour) and the theme's accent is also applied to the primary button, link
  and Saved Messages colours.
- **The tile figures are alive**: each tile's figure is the theme's Telegram
  *animated emoji* (the house for the factory tile, then the chick, snowman,
  diamond, …), rendered paused with the bundled lottie-web. Clicking a tile plays
  the reference's micro-animation — after a 250 ms beat the figure pops to twice
  its size, its Lottie runs once to the last frame and it settles back; another
  click cancels the previous figure. Motion follows the full animation level and
  the OS reduce-motion preference and the active tile is no longer a click
  target. The nine figures ship with the app as their original TGS files
  (`public/assets/tgs/themes`, ~276 KB), so the very first launch — and the
  offline/dev-preview state — shows and animates them without waiting for a
  download; a click that lands while a non-bundled figure is still loading is
  replayed once it is ready. The figures and the lottie renderer are warmed at
  idle, and the fallback glyph is now only painted when no figure can be loaded at
  all - tiles no longer flash the system emoji for a moment before their artwork
  appears. The kernel's animated-emoji sticker-set endpoint remains the live
  source for any emoticon not bundled (a theme Telegram adds later), with its
  answer cached in IndexedDB.

### Telegram parity III: Saved Messages 2.0, gifts, search, presence, pinned bar, live emoji

- **Saved Messages ("我的收藏")** now matches Telegram Web on every surface: the
  dialog row, chat header and slide-over info pane all use one localized title,
  the header shows the message count, and the info pane has no hero/action
  tiles — its first tab lists the Saved Messages 2.0 **source chats**
  (`messages.getPinnedSavedDialogs` + `messages.getSavedDialogs`) with pinned
  chats first and click-to-open, while the shared-media tabs stay available.
  Fixed the chat-header title clipping (flex+overflow text box) and Saved
  Messages is now rendered as a self-chat: every saved message is outgoing
  (right aligned) with no read receipts, exactly like Telegram Web K.
- The **chat info column slides over the conversation** from the right (190 ms
  entry animation, Esc/× close, chat keeps its full width) instead of being a
  third flex column that squeezed the message canvas.
- **New chat-info Gifts tab** for users/channels with star gifts: paged grid
  with gift sticker thumbnail, title, sender, stars, date and Unique badge
  (`payments.getSavedStarGifts`), plus loading/empty/error states.
- **Pinned message strip** under the chat header: first pinned message preview,
  click to jump, unpin-all, dismiss, and live pin/unpin refresh. Kernel gained
  `GetPinnedMessage` / `UnpinAllMessages` and `pinned` live events.
- **Real presence/last-seen** for private peers: dialog rows, chat header and
  info pane show online, exact last-seen or the coarse privacy buckets, kept
  current through `UpdateUserStatus` live events. `ChatDTO` and
  `ChatProfileDTO` gained `online`/`lastSeen`/`status`.
- **Linked discussions open in-app even when they are not in the dialog list**:
  `ChatProfileDTO.linkedChat` is mapped by the frontend and merged into the
  router on demand.
- **Sticker/GIF picker search, favorites and set management**: server-side
  sticker search with installable set rows (`messages.searchStickers`),
  favourites section and cell toggle (`getFavedStickers`/`faveSticker`), recent
  clear, set install/uninstall/archive, featured/trending sets,
  inline-bot GIF search with paging and send (`getInlineBotResults` /
  `sendInlineBotResult`), save/unsave GIF hearts (`saveGif`).
- **Telegram mini-app JS bridge**: iframe `postMessage` bridge for
  `web_app_ready`, `web_app_close` (with closing-behaviour confirm),
  `web_app_data_send` (`messages.sendWebViewData`), header/background/bottom
  colours, BackButton/MainButton (host-rendered), expand/collapse,
  theme/viewport pushes, open-link/TG-link, and 50 s `prolongWebView` keepalive.
- **Emoji picker parity**: the full Telegram Web K catalogue (1,903 base emoji,
  7 categories, exact order) rendered with the same 3,787 Apple emoji PNGs
  Telegram Web ships (no more Segoe UI glyphs or missing flags), message text
  also renders emoji as images, and a Web-K-style skin-tone picker (right-click
  or long-press → 6 swatches, persisted per emoji) was added. Search keywords
  stay localized (en/zh/ja), and panel geometry matches Web K's 382×420 panel.
- **Profile home from the top-left menu**: clicking the account avatar opens a
  Telegram-style profile/settings sheet (large avatar, online, phone/@username,
  edit-profile hint) with the official settings rows (notifications, data and
  storage, privacy, general, folders, stickers and emoji, speakers, language,
  about) wired to the existing settings screen where available.
- Internal: new kernel files for presence/saved/pinned/gifts/sticker search/GIF
  search/webview bridge, regenerated bindings, 31 new round-3 Go tests and a new
  `EmojiText` renderer, `telegramExtra.ts` typed façade, profile-home and
  pinned-bar components. Docs/CHANGELOG updated.
- Fixed a Windows/WebView2 first-composition artifact that left four square
  corners visible around the rounded window until it was resized or captured:
  the window frame is invalidated once after show/restore so the WebView2
  surface is clipped inside the Windows 11 rounded frame immediately.

### Telegram parity II: stickers/GIFs, in-app mini apps, links, header, Saved Messages

- The emoji picker's **Stickers** and **GIFs** tabs now work like Telegram
  Web K: installed sticker sets in a 49 px cover rail plus a recent-stickers
  row and per-set grids (5 × 72 px cells, lazy sections), saved GIFs in a
  3-column grid, still thumbnails in the grid with a single animated
  hover/hold preview, click-to-send through `messages.sendMedia` (no upload),
  pending/blocked/empty/error states and zh/ja/en strings. Sticker/GIF data is
  fetched through new kernel APIs (`GetStickerPacks`, `GetStickerSet`,
  `GetSavedGifs`, `SendSticker`, `SendGif`) with opaque document refs and
  loopback thumb/stream URLs.
- Bot **Web Apps now open in an in-app overlay**, matching Telegram Web's
  browser panel instead of a separate frameless OS window: non-modal floating
  480×688 panel (radius 24, translucent blurred wash, no dark corner wedges),
  48 px header with close, bot avatar/title tab, a `+` Apps popover (recently
  opened mini apps + reload + open in browser) and minimize/restore (328×48,
  iframe kept alive); drag by the header, 8 resize strips, loading/error
  states, sandboxed iframe with Telegram's allow list and theme params in the
  URL hash. The old `miniapp.html` window plumbing is gone.
- The chat **top bar** matches Telegram Web K: floating 696 px plate with
  24 px radius, 48 px height, 40 px avatar, 16 px/500 title, 14 px status line,
  40 px search/more buttons, Web K light/dark palette (online status is accent
  text, not a dot), and the more menu now carries pin/unpin, mark as read,
  archive/unarchive and download-all.
- **Broadcast channel info** parity: Telegram's action tiles (Mute/Unmute,
  Discussion, Leave, More), the `个人信息`/Info bio card, a single t.me link row
  with a QR-code dialog and the alternate collectible usernames (“also @x, @y”),
  subscriber counts in the hero, no more duplicate username/count rows, and
  confirmed Leave (`channels.leaveChannel`) and Discussion navigation.
  Profile DTOs gained multiple usernames, gift/admin counts and linked chat.
- **Saved Messages** now behaves like Telegram: localized title and bookmark
  avatar instead of initials, no unread badge, "N messages" header subtitle
  (`messages.getHistory` count), a saved-specific info pane with shared-media
  tabs only (no hero/action tiles/profile rows) and Telegram's “Your cloud
  storage” empty state.
- **Telegram links open inside the app**: t.me/telegram.me/tg:// username and
  post links (including package-prefixed post links) are resolved through
  `contacts.resolveUsername` and open the chat in-app, paging the history
  around the post id when it is older than the loaded page; invite links ask
  for confirmation and join via `messages.importChatInvite`; `@username`
  mentions and profile links use the same router; unsupported deep links show a
  toast instead of leaking to the browser. A new `ResolveTelegramLink`,
  `JoinByInvite`, `JoinPublicChat`, `LeaveChat` and `GetMessagesAround` kernel
  API backs it.
- Internal: kernel sticker/GIF caches and ref map, in-app link classifier
  (pure, unit-tested), removed the detached mini-app window API
  (`OpenBotWebView`/`OpenMiniApp`/`TakeMiniAppState`), regenerated bindings,
  new frontend `src/lib/telegramLinks.ts` + `MiniAppOverlay` component and
  picker subcomponents, docs/CHANGELOG updated.

### Telegram parity: chat info, composer, bot buttons, mini apps, emoji

- The chat-info pane is now a real Telegram profile instead of three generic
  buttons: per-type titles and headers (User info / Bot info / Group info /
  Channel info / Saved Messages), Telegram Web K action tiles (message, call,
  mute, more), an expandable bio/description card with clickable links, rows for
  username, phone, `t.me` link, invite link, member/subscriber counts, bot
  commands and the bot menu, and the existing shared-media tabs below.
- Pin/unpin and mute/unmute are now written to Telegram
  (`messages.toggleDialogPin`, `account.updateNotifySettings`) instead of being
  local-only UI flags, and survive restarts; mark-as-read was already
  server-side. The profile "More" menu also archives/unarchives server-side.
- The composer was rebuilt to Telegram Web K's floating plate: one 24 px card
  with the reply/edit header and upload progress inside it, a 696 px lane, 40 px
  icon buttons and a single morphing send/mic button. It switches on posting
  capability rather than chat kind: private users, bots, Saved Messages, groups
  and channel admins get the composer (Broadcast placeholder), while broadcast
  channels you cannot post in get the wide Mute/Unmute footer plus the gift
  action. Restricted chats show a read-only bar.
- Composer capabilities: bot menu button pill (web app), `/` command
  autocomplete with name + description and keyboard navigation, slow-mode
  countdown, attach menu, Telegram placeholders (Message/Broadcast/Send
  anonymously/Text is not Allowed), IME-safe Enter/Shift+Enter/Ctrl+Enter,
  drafts and per-chat focus handling.
- Bot inline keyboards keep Telegram's row layout and button styles and now do
  something for every button kind: URL, copy, callback
  (`messages.getBotCallbackAnswer` with alert/URL results and a pressed-cell
  spinner) and web-app buttons.
- Bot Web Apps open in a detached Telegram-style mini-app window (480×688,
  rounded, own header with close/open-in-browser) that loads our local wrapper
  page and embeds the authenticated `messages.requestWebView` URL in a sandboxed
  iframe; the composer's bot menu pill ("JISO发现" in the tests) launches the
  same window. Simple-webview buttons open their raw URL without a web view
  request.
- Telegram Web's emoji picker replaces the old "append 😊" button: 1,895 emoji in
  7 categories plus a popular/recents section, localized search keywords
  (en/zh/ja), quick category filters, sticky headers, skin-tone-ready grid,
  light/dark styling, keyboard navigation, and caret-preserving insertion that
  sends as plain text. Data is generated from permissively licensed sources
  (iamcal/emoji-data MIT + Unicode CLDR) and bundled offline.
- Chat list: Saved Messages is titled/localized like Telegram, channels show
  "N subscribers" instead of "N members", and bot chats show their @username.
- Internal: new kernel APIs `GetChatProfile`, `SetChatMuted`, `SetChatPinned`,
  `SendBotCallback`, `RequestBotWebView` and app-level `OpenBotWebView` /
  `OpenMiniApp` / `TakeMiniAppState` (generated bindings updated); inline button
  DTOs gained `row`/`style` and the `webview_simple` kind; new
  `mini-app` window modelled on the detached media viewer.

### Media viewer

- Chat photos, videos, GIFs, round video notes and albums now open in a
  **detached viewer window**, like Telegram Desktop's viewer: the chat window is
  never covered and keeps working (drag/minimize/browse) while the viewer is
  open. The viewer has its own dark caption bar with window controls, and
  closing it returns focus to the chat.
- The window is modelled on Telegram Desktop's media viewer, with geometry and
  layout read from the official tdesktop sources (`media_view.style`,
  `media_view_playback_controls.cpp`): black surface, media fitted above the
  bottom chrome, side arrows, a rounded caption plate, tdesktop's group thumb
  strip for albums, and a bottom info row with the bold file name / "N / M"
  counter plus sender • date on the left and download / rotate / ⋮ on the
  right.
- Videos use tdesktop's playback block: volume slider, play/pause, speed menu,
  picture-in-picture and fullscreen on the first row, current time / seek line /
  remaining time below, fading out while the video plays. Short videos loop,
  GIFs autoplay muted, round video notes stay round and chromeless. The stream
  URL is cached per message so reopening a video does not start a second
  transfer session.
- Photos keep wheel and double-click zoom (0.5–4×), pan, rotate and drag
  paging/close; Escape closes the window; arrows page through the conversation
  or through the info pane tab the viewer was opened from.
- Forward, delete, copy and show-in-chat keep running in the chat window: the
  viewer emits `mediaViewer:action` events, the chat opens its existing pickers
  and confirmation dialogs (and is brought to the front for them).
- The viewer is a second Wails webview (`/viewer.html`): `OpenMediaViewer` stores
  the serialized media session in memory and opens/reuses the window,
  `TakeMediaViewerState` hands it to the page. It has a backend-free dev preview
  at `/media-preview.html` with photo, album, video and round-video states.

### Window and archive polish

- The archived-chats header menu now has a Downloads entry next to Search, so
  the transfer page is reachable without leaving the archive view first.

- Wide message media now sizes against the conversation column instead of the
  viewport: captioned photos, albums and bleed bubbles lost their 68vw/72vw
  minimum/maximum widths, so opening the chat-info pane and narrowing the chat
  reflows the media instead of clipping its right edge.

- The chat pane no longer paints its own wallpaper or white card: the message
  canvas is transparent, so the signed-in window's doodle wallpaper runs
  continuously behind the conversation.
- The chat header and the message composer are now floating rounded surface
  cards with soft shadows over that wallpaper, copied from Telegram Web K's top
  bar and input plate (48 px, centred, max 760 px); the channel bar uses the
  same floating shape.
- The chat wallpaper is the canvas for the whole signed-in window: the
  floating sidebar, chat and info cards sit on the same doodle pattern as the
  message surface instead of a flat gray backdrop. The login screen keeps its
  own backdrop.
- The chat-info pane never covers the conversation: it always occupies its own
  column, and below 990 px the chat list steps aside while it is open so the
  bubbles keep their full width.
- Archive search is a compact 30 px field inside a fixed 44 px header, so
  switching from the title to the search box no longer pushes the chat list
  down.

### Chat read state

- Opening a chat (or focusing it, or receiving a message while it is open) now
  sends the read marker to Telegram (`messages.readHistory` /
  `channels.readHistory`) instead of only clearing the local badge. Previously
  the optimistic local clear was overwritten by the server on the next dialog
  refresh, which made a group look unread again shortly after reading it.
  Requests are coalesced per chat and only sent while the window is visible.

### Downloads

- The downloads header now has Clear all failed next to Clear completed; both
  disable themselves when their tab is empty, and clearing failed removes the
  whole failed list.
- The downloads header now uses one Pause all / Resume all toggle that follows
  the task state, and shows Open folder and Clear completed as plain icon
  buttons instead of hiding them in a dropdown.
- Download rows keep only the state action (Pause / Resume / Retry) and Cancel;
  the per-row Open folder button is gone, and the remaining action buttons sit
  farther apart so they are no longer cramped.
- Added Resume all next to Pause all in the downloads header; it starts every
  paused transfer with the same tdl core the individual rows use.
- Fresh transfers stay on tdl's multi-connection downloader (8-connection DC pool
  by default, like tdl itself); resumed files no longer fall back to a sequential
  single-connection range loop — the missing tail is fetched as parallel 1 MiB
  ranges through the same tdl DC pool.
- Removing a task now waits for its writer and deletes its partial `.tmp`, and a
  brand-new task only resumes a partial file that it owns. Re-downloading a file
  after removing its paused task therefore starts clean instead of stitching an
  orphaned temp file into the result.
- Duplicate clicks for the same message reuse the running task, and a completed
  transfer is size-checked before it is renamed into place, so short or corrupt
  files are reported as failed instead of being delivered.
- Chat-info file rows can start a download even when that message is not part of
  the chat's loaded history page.

### Chat-info downloads and tdl settings

- Message bubbles get the same inline download affordance as the chat-info
  pane: photos, videos, GIFs and album cells carry a small round download
  control in their top-right corner, and document rows show it centered on the
  file icon. It becomes the familiar progress ring while the transfer runs,
  downloads without opening the Downloads page, and does not trigger the
  photo/video viewer. Completed transfers leave no badge, so a delivered media
  item shows no mark in the conversation (open the Downloads page for the file).
- Inline download badges now toggle like the Downloads page: first click starts
  the transfer, clicking the progress ring pauses it, clicking the paused ring
  resumes it, and a failed ring retries. Tooltips state the action
  ("Downloading 42% · click to pause", "Paused 42% · click to resume").

- Shared-media downloads no longer jump to the Downloads page: photos, GIFs,
  videos, files, music and voice rows carry an inline download control. Media
  tiles show a transparent round button in the top-right corner, file rows show
  it over the file icon, and the button becomes a circular progress ring while
  the transfer runs. Finished downloads show no badge at all; paused and failed
  states keep their ring so they can be resumed or retried.
- The chat-info header has a "Downloaded only" filter for every downloadable
  tab; it keeps only items whose local task is done.
- Downloads are grouped under the configured folder by Telegram's own mobile
  categories, using stable English folder names: `Images` (photos), `Videos`
  (videos and round videos), `GIFs`, `Audio`, `Voice`, `Stickers` and `Files`
  (documents).
- Settings → Downloads now exposes tdl's real download knobs with tdl's
  documented defaults: folder, file-name template, threads per file (4), DC
  pool size (8), concurrent files (2), reconnect timeout (5 min), skip-same,
  takeout session and rewrite-extension. The kernel honours each option for new
  tasks (pool size, tdl `--limit`, tdl `--skip-same`, takeout clients,
  extension sniffing, and tdl's reconnect middleware window).
- The delete-message dialog buttons are baseline-aligned again (both 32 px).
- Downloaded rows are re-checked against disk when the conversation is opened
  or the window regains focus: if the file was deleted or moved the stale
  "done" record is forgotten and the message can start a fresh download, like
  Telegram Desktop's downloaded-path behaviour. `GetDownloads` applies the same
  cleanup, so no fake completed row survives. If an unrelated file already
  occupies the rendered name, the new download is saved as `name (2).ext`
  instead of overwriting it.

### Chat info and history loading

- Chat info now mirrors Telegram Web's profile column: one
  `messages.getSearchCounters` call per peer (cached for a minute, like the web
  client) decides which shared-media tabs exist, so Files, Music, Voice and GIF
  tabs appear only when the chat actually contains those messages; groups open
  on Members, every other peer opens on the first available tab.
- Each chat-info tab pages its own server-side `messages.search` filter (photos
  and videos combined, documents, URLs, RoundVoice, music, GIFs) with infinite
  scroll instead of filtering the 50 messages already painted in the chat;
  Members pages through `channels.getParticipants` with the same 50-first-page
  behaviour as Telegram Web.
- The Media tab has Telegram Web's Photos/Videos filter menu (checkmarks in the
  header kebab, at least one half always enabled) and shows the matching
  "N photos, M videos" subtitle, switching between the combined photo+video
  filter and each half without leaving the tab.
- Shared-media items answer right-click with Telegram Web's per-category menu:
  Forward, Copy Media (images), Download, Show in chat, Select/Clear selection
  and Delete, with Copy/Download hidden for protected chats or non-media rows,
  so links, videos, music, voice, files and photos each get their own item set.
  Select starts a multi-select mode with a count/forward/download/delete bar.
- Chat-info lists follow the same rows as the web profile: a three-column media
  and GIF grid with duration/GIF badges, file rows with extension icon and size,
  link rows with preview and copy action, and music/voice rows sharing one
  player. New messages and deletions refresh the counter set and merge the
  newest page into the open tab.
- History no longer needs a "load older messages" button: reaching the top of
  the message list automatically requests the previous page, keeps the scroll
  anchored and fills a short viewport, matching Telegram Web and other chat
  platforms.

### Chat surface and loading

- Rebuilt the message surface around Telegram Web K metrics: 15 px/5 px bubble
  radii, fully rounded bubbles (no protruding tail), 4/9/5 px padding, 480 px
  column, inline time/checks, fixed avatar gutter, grouped sender avatars,
  doodle wallpaper, outgoing pale green / dark steel blue, reduced-motion-aware
  entry.
- Added rich text entities (bold, italic, underline, strike, code, pre,
  blockquote, spoiler, links) with a segment renderer that preserves Telegram's
  UTF-16 offsets.
- Added dedicated renderers for voice waveforms, audio, TGS/WebM stickers, GIFs,
  posters, web previews, polls/quizzes, checklists, invoices, giveaways, paid
  media, stories, games, dice, contacts and locations; inline keyboard buttons.
- Media now uses intrinsic aspect ratio (capped at 420 px), full-bleed photos
  and albums, and overlay timestamps; portraits are no longer forced into a
  360×220 crop.
- Media-only photos/videos/GIFs/albums no longer paint a bubble or `<img>`
  background plate; transparent PNGs show the wallpaper like Telegram Web.
- Captioned portrait photos keep their natural height and fill a wider caption
  bubble with a blurred copy of the photo instead of leaving a white side band.
- Stickers, GIFs and media-only photos keep the same 15 px rounded corners as
  Telegram Web; stickers get the translucent timestamp overlay and no square
  card edges.
- Media-only portrait photos keep the intrinsic narrow frame used by Telegram
  Web; the blurred side fill is reserved for captioned portraits. Media sender
  names get a bubble-coloured header band instead of floating on the wallpaper.
- Web-page previews are a wide image-under-text card using the full preview
  photo when available and the thumbnail as fallback; removed the tiny right-hand
  thumbnail and its empty white area.
- Added local dialog/message snapshots under `data/cache/` and `GetCachedChats` /
  `GetCachedMessages`; the WebView paints them before the network answer
  (measured ~0.3 s to first messages on reload).
- Removed the legacy F-shell message overrides so one message stylesheet owns
  the surface.
- Reactions moved from a detached pill row into the bubble footer, sharing the
  bubble background with the timestamp; removed the permanent `+` circle.
- Custom emoji reactions now stream their Telegram document thumbnail and toggle
  with the custom emoji document id instead of a placeholder glyph.
- Sender names now sit inside the top of the bubble like Telegram Web, with the
  premium custom-emoji status resolved from `user.emoji_status` and rendered
  next to the name.
- The archive search field is hidden by default and replaces the archive title
  row when Search is chosen; back arrow, input and close button share one row.
- All dropdowns share one quiet gray highlight; the blue selected row is gone.
- Sidebar icon buttons no longer show the saturated blue focus outline after
  clicking/closing a menu; keyboard focus uses a quiet gray background instead.
- Incoming rows always reserve the same 40 px avatar gutter, with the avatar
  wrapper absolutely positioned in it, so rows that do show an avatar and
  grouped continuation rows share exactly the same bubble left edge.
- WebView2 HTTP/JS cache is cleared once whenever the executable changes, so a
  rebuilt UI can no longer be masked by a stale cached `index.html`; cookies,
  localStorage and the Telegram session are preserved.
- The archived row's chat count is now plain muted text instead of a blue
  unread-style badge; the app-menu archived entry uses the same neutral count
  and its hover/highlight state is quiet gray rather than the accent fill.
- Archived chats no longer jump back into the main list when a new message
  arrives: main/archive dialog duplicates are merged with the archived flag
  winning, and the archived row's preview/unread is updated in place.
- The archive header menu now has exactly Search, Hide/Show in Chat List and Mark
  all as read; hiding the archive row is persisted and the archive remains
  reachable from the app menu.
- Mark all as read now calls `messages.readHistory` / `channels.readHistory`
  server-side for every archived unread chat, instead of only changing the local
  unread counter.
- Dialog rows now honour Telegram's `dialog.folder_id == 1`, so archived peers
  stay archived even when only the main dialog query has answered.
- Folder selector now shows "所有" plus the user-created folders only (no
  synthetic Unread tab). It is a dropdown when custom folders exist and a plain
  "所有" label when they do not. The archived row uses normal chat-row geometry
  and only appears under "所有"; custom folders exclude archived peers.
- Removed the bubble tail/foot and the hover three-dot circle. Every incoming
  row in a group chat reserves the same avatar gutter, so short and long bubbles
  share one left edge.
- Dark-theme audit: message text, time, reply quotes, captions, code and media
  cards use the dark palette; sender names are lightened for contrast.

### Chat and media loading

- Removed the click-to-select message mode and the blue selection outline;
  messages now behave like Telegram Web (text selection, hover actions and a
  right-click menu).
- Added Telegram Web-style message actions: reply, copy text, forward, edit own
  text messages, delete for me / for everyone, link detection and a full photo
  viewer.
- The composer shows a reply/edit banner and sends `reply_to_msg_id`.
- Thumbnails, avatars and full photos are served from MTProto by the loopback
  image server and loaded by the WebView as normal HTTP images. The per-image
  `data/thumbs/` and `data/avatars/` JPEGs are no longer written; legacy copies
  are deleted on startup.
- Dialog and history entities now provide avatar locations directly, avoiding a
  full-user RPC per avatar; thumbnails use a warm per-DC connection pool.
- Chat history keeps an in-memory snapshot so switching back renders instantly
  before the background refresh completes.
- The open chat now delta-polls `messages.getHistory(min_id)` every two seconds;
  only messages newer than the newest rendered id are mapped, so update-stream
  gaps no longer leave the conversation or reply targets stale.
- Live updates: a gotd update dispatcher pushes new/edit/delete/reaction/read
  events to the UI, with short-message mapping and `updatesTooLong` resync.
- Emoji reactions with counts, chosen state and an emoji picker.
- Album mosaic grouping for consecutive messages with the same `grouped_id`;
  forward/delete/download actions operate on every album message.
- Native multi-file attachment picker with 512 KiB-part uploads and an in-composer
  progress bar (caption and reply supported).
- Dialog list and archived/folder loads are independent; a 20 s kernel dialogs
  cache avoids duplicate flood-limited `messages.getDialogs` calls on reload.

### Login and tdata

- Rebuilt the login flow on a custom phone authenticator: code delivery method
  and length, resend with countdown, retry after an invalid code, 2FA password
  hint and flood-wait countdown.
- Structured `auth:event` payloads for QR expiry, code type/length/timeout,
  resend state, password hint, flood wait and tdata export result.
- Rewrote the Telegram Desktop exporter to match the official layout exactly:
  `key_datas`, `D877F783D5D3EF8Cs` and `D877F783D5D3EF8C/maps`, TDF$ hashes,
  encrypted descriptors, wide-id MTP authorization and random padding. Only the
  modern `s` suffix is written; stale `0`/`1` files are removed.
- Validated the generated tdata with official portable Telegram Desktop 7.2.5
  (build 7002005): accounts info, map, MTP keys and account startup are read
  successfully.
- Import now compares the authorization identity (user id + main DC + key id)
  instead of file timestamps, so Telegram Desktop rewriting its tdata does not
  re-import the same login or replace the cached display name.
- Export record in `data/tdata-export.json`; auth backup in
  `data/tdata-backup/`; `TDataExport`/`AuthStatus.TData` exposed to the UI.

### UI

- Rebuilt the whole frontend on one Material 3 / Google Workspace design
  system: shared colour/type/spacing/motion tokens, `@material/web` controls,
  `PaneHeader`, `SegmentedControl`, `Dialog` and a shared UI layer used by every
  surface.
- Login is now a single QR-first 420px card. Removed the marketing panel,
  feature list and welcome step; phone login is a secondary action, proxy
  settings open in a modal, and small windows compress the QR rather than
  clipping it.
- Language menu with **Follow system**, English, 简体中文 and 日本語. The default
  follows the OS and the choice is persisted. Switching language no longer
  restarts an in-flight QR token.
- Login footer theme menu (System / Light / Dark), defaulting to the system
  theme and persisted with the rest of `AppSettings`.
- Success is now only a check, “登录成功 / 正在加载页面…” and a spinner. The
  tdata success chip is gone; only a tdata export failure is surfaced.
- Phone login starts with **no country prefix**; the user must choose a country
  before the continue action enables.
- QR countdown keeps its deadline when the same token event is replayed; the
  toolbar has an explicit Refresh button and a connecting state for the MTProto
  handshake.
- Proxy settings use compact 48px fields in an overflow-free modal.
- Main page follows Telegram Web's two-column layout with a permanent-list /
  full-bleed-chat split: hamburger + search, All/Unread filters, flat rows,
  floating compose FAB, transparent chat header over an original Material
  wallpaper, and a floating composer. The navigation rail became a left M3
  drawer with Chats/Downloads/Settings/Logout and account details.
- Private chats show no message avatars; groups and channels show the sender
  avatar on every message, with real sender photos and initials fallback.
- Clicking the chat header opens a chat-info dialog with the peer photo, type,
  username, member count and latest message.
- Telegram message parsing expanded to text, photo, video, GIF, sticker, voice,
  video note, audio, file, poll/quiz, location/live/venue, contact, web page,
  dice, game, invoice, story, giveaway, paid media, checklist and an explicit
  unsupported fallback. Replies render a quoted block.
- Downloads are individual floating task cards with no separator lines; the
  hamburger from the downloads header opens the same navigation drawer.
- A tonal “jump to latest” button floats above the composer and replaces the old
  sticky FAB. The button is now a true circular control rather than a Material
  host square.
- Replaced hand-styled chat rows, filter buttons, search input, compose FAB and
  theme segmented control with Google's latest stable Material Web components
  (`@material/web@2.5.0`): `md-list`/`md-list-item`, `md-chip-set`/
  `md-filter-chip`, `md-filled-text-field`, `md-fab` and
  `md-outlined-segmented-button-set`.
- Removed the Telegram-style doodle wallpaper and floating header bubble; the
  chat surface is now a flat Google Chat-style surface with a divider and a clean
  Material canvas.
- Video playback is now progressive: the default mode serves
  `upload.getFile` byte ranges through the loopback server without downloading
  the whole file first. The new **Use tdl streaming** setting runs tdl's
  multi-connection downloader into a growing cache and feeds the player as bytes
  arrive, avoiding the official range throttle.
- Telegram archive and official dialog folders are loaded: archived dialogs use
  `messages.getDialogs(folder_id=1)`, and `messages.getDialogFilters` contributes
  folder titles, emoticons, explicit peer lists and the common category flags to
  the list filter row. The chat context menu can archive/unarchive a peer through
  `folders.editPeerFolders`; folder definitions themselves remain read-only in
  this iteration.
- Video/video-note cards open a native player backed by a cached file and a
  loopback HTTP Range server; the old nil progress handler that crashed on click
  is fixed with an explicit no-op progress adapter.
- Chat header is a floating bubble; search opens inline in the same bubble
  instead of inserting a second toolbar row.
- Earlier history is paginated with `GetOlderMessages` (`messages.getHistory`
  `OffsetID`) and a top-of-timeline “加载更早的消息” action; the previous first
  message stays anchored when older pages are prepended.

### Project hygiene

- Added [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), an `AGPL-3.0-only`
  package license and the bundled Material Symbols OFL text.
- Replaced the old login/theme CSS (`login-settings.css`, `atoms.css`,
  `settings-*.css`) with tokenised shared styles.
- Updated UI, architecture, development and handover docs, plus the new
  [message-support matrix](docs/messages.md), login, proxy and chat screenshots.
- Minor kernel cleanup: single `TDataExport` DTO, no duplicate export record
  type, simplified tdata identity check.

### Verification

- `go test ./internal/...`
- `npm run build` / `wails3 build`
- Playwright checks for QR/phone language switching and persistence, no-prefix
  phone state, the proxy modal at 1107×725 and 640×480, login theme persistence,
  tdata-authorized startup, floating chat layout, real chat/sender avatars,
  private/group avatar rules, chat info, rich media, downloads and login success.
- `TestTelegramDesktopImport` verifies the official tdata import/export path.

## v0.1.0 — 2026-11-11

First handoff-ready desktop milestone.

### Authentication and tdata

- Real QR, phone, code and two-step verification through tdl/gotd.
- Official Telegram Desktop tdata import, with one-time fingerprint and session
  backup.
- Re-import unchanged tdata when the stored session is only an abandoned QR
  attempt, so tdata dropped next to `tgdesk.exe` still logs in.
- No-passcode official-format tdata export, validated with Telegram Desktop
  7.2.5.
- Portable session separated from official tdata.

### Chat

- Real dialog list and latest-50 message history.
- Plain-text message sending.
- Telegram-style conversation header and channel action bar.
- Message grouping, date pills, tails, read/sent indicators.
- In-chat search over loaded messages and persistent per-chat drafts.
- Forwarded messages, service messages (localized), video cards and real
  thumbnails.
- Poll results, locations and contacts.

### Downloads

- Byte-resumable media downloads with pause/resume/cancel.
- Persistent task metadata and progress events.
- Thumbnail cache separate from full media downloads.

### UI

- Frameless Wails window with a 24px Telegram-style caption bar and working
  window controls.
- Atomic login/chat/layout/settings components under the `tg-*` CSS namespace.
- 1107×725 reference geometry: sidebar 394, chat header 56, chat row 60,
  avatar 48.
- English, 简体中文 and日本語 UI.
- Minimal settings sheet: language, send-on-Enter, download folder/threads/
  template, proxy and NTP. Appearance, About and placeholder Telegram sections
  were removed to keep the app focused on chats and downloads.

### Verification

- `go test ./...`
- `tsc` / `npm run build`
- `wails3 build`
- Login and chat CDP metric checks with no console errors.
- Live thumbnail, video, poll, service-message and draft checks.

### Known limitations

- Welcome illustration is a rebuilt approximation.
- Map tiles require network and fall back to a schematic surface.
- Pin/mute/mark-read are local UI state.
- Message pagination, live updates, reactions and server-side search are not
  implemented by the current kernel.
- Passcode-protected tdata is not supported.

## Roadmap

- Real map provider integration.
- Message pagination/live updates when kernel support exists.
- Remaining settings pages.
- Further typography calibration.
