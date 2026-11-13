# Telegram message support

This page records the Telegram message surface tgdesk parses, how each item is
shown, and the presentation rules that differ between private chats, groups and
channels. It is intentionally narrower than the full Telegram schema: the goal
is to render every message the desktop client can encounter without silently
turning it into an empty bubble.

## Parsing pipeline

1. `GetMessages` calls `messages.getHistory` for the opaque peer id. Users,
   chats and channels returned by the call are indexed by Telegram id.
2. Each `Message` and `MessageService` becomes a `MessageDTO`; media becomes a
   `MessageMediaDTO` with a stable `kind`.
3. `mapMedia` classifies documents by their `DocumentAttribute*` metadata, not
   only by MIME type. This is required because stickers, voice notes, round
   videos, GIFs and ordinary files can all share `video/mp4` or `audio/ogg`.
4. Reply metadata is carried as `replyToId`/`replyToText`; the frontend resolves
   loaded targets and shows a quoted block that jumps back to the original
   message. When the quoted message is older than the loaded page, the kernel
   resolves all such ids in one `messages.getMessages` /
   `channels.getMessages` batch and fills `replyToText`.
5. Sender names and opaque `senderId`s come from the same history response.
   `senderAvatarUrl` and `avatarUrl` are loopback HTTP URLs, so the WebView loads
   avatars natively and lazily instead of calling a base64 RPC per avatar.
6. Photo/video/sticker thumbnails are registered while mapping history and
   exposed as `media.thumbUrl`; photos also carry `media.photoUrl` for the
   full-size viewer. No per-image JPEG is written next to the executable.

## Supported message kinds

| Kind | Telegram source | Rendering |
| --- | --- | --- |
| Text | `Message.message` + `MessageEntity*` | Rich text: bold/italic/underline/strike, code, pre, quote, spoiler, links, mentions |
| Photo | `MessageMediaPhoto` | Natural-aspect full-bleed card; transparent pixels reveal the wallpaper (no white plate); click opens the full photo viewer; spoiler reveal |
| Video | `DocumentAttributeVideo` | Aspect-correct thumbnail, duration badge and native player |
| GIF / animation | `DocumentAttributeAnimated` | Inline muted looping video with a GIF badge |
| Sticker | `DocumentAttributeSticker` | 200 px contained WebP, WebM or TGS/Lottie animation |
| Voice | `DocumentAttributeAudio.Voice` | Waveform bars, seek and playback from MTProto |
| Video note | `DocumentAttributeVideo.RoundMessage` | Circular video card and player |
| Audio | `DocumentAttributeAudio` | Title/performer, artwork, progress and playback |
| File | any other document | File card with extension, size and download icon |
| Poll / quiz | `MessageMediaPoll` | Question, vote bars, chosen/correct state, quiz solution |
| Location | `MessageMediaGeo` | Map preview and coordinates |
| Live location | `MessageMediaGeoLive` | Map preview with live flag |
| Venue | `MessageMediaVenue` | Map preview with title and address |
| Contact | `MessageMediaContact` | Contact card with name and phone |
| Web page | `MessageMediaWebPage` | Text then a wide image-under-text preview card (full photo when available, thumbnail fallback), site/title/description |
| Dice | `MessageMediaDice` | Animated emoji glyph and rolled value |
| Game | `MessageMediaGame` | Game card with title/description |
| Invoice | `MessageMediaInvoice` | Product card with formatted amount/currency |
| Story | `MessageMediaStory` | Story card with caption/short id |
| Giveaway | `MessageMediaGiveaway*` | Prize count, Premium months and end date |
| Paid media | `MessageMediaPaidMedia` | Locked media card with Stars amount and item count |
| Checklist | `MessageMediaToDo` | Title, progress, completed/uncompleted items |
| Inline keyboard | `Message.reply_markup` | Button grid under the bubble; URL buttons open externally |
| Unsupported | `MessageMediaUnsupported` or future media | Explicit unsupported card, never a blank bubble |
| Service | `MessageService` actions | Centered service pill, localized for common actions |

Forwarded headers, captions, reply quotes, reactions, album mosaics, edited
labels, view counts, signatures and sent/read ticks sit inside the same visual
unit. Media cards use the intrinsic width/height from Telegram, capped at 420 px
and 68 vw, so portraits do not get cropped into a generic 360×220 box. All
photo/video/animation/sticker media keeps the 15 px Telegram Web corner radius;
stickers and media-only cards also get the translucent timestamp overlay instead
of a separate metadata row.
A media-only portrait photo keeps its intrinsic narrow frame, exactly like
Telegram Web; no blurred side plate is added. Only when a caption makes the
bubble wider than the photo does the card keep the photo's height and fill the
side bands with a blurred copy, so the photo itself is never cropped. Landscape
photos keep their natural ratio.
Media-only photos, videos, GIFs and albums have no white/dark bubble plate: the
bubble and the `<img>` background are transparent, so PNG alpha reveals the
wallpaper exactly like Telegram Web. A small loading skeleton is kept only until
the image decodes.

Web-page previews are a wide card under the message text: the full preview photo
is fetched when Telegram exposes one, with the small thumbnail as a fallback; the
old 76 px right-hand thumbnail is gone.

## Chat actions

The conversation screen follows Telegram Web's interaction model rather than a
checkbox selection mode:

- A message can be right-clicked or revealed via the hover `⋯` button. The menu
  exposes Reply, Copy text, Forward, Edit (own text messages), Download (media)
  and Delete.
- Reply opens a quoted composer banner, sends with `reply_to_msg_id`, and the
  quote in the bubble scrolls back to the original message.
- Forward opens a searchable chat picker and calls `messages.forwardMessages`.
- Edit replaces the text of an own message through `messages.editMessage`.
- Delete offers "Delete for me" and, for outgoing messages, "Delete for
  everyone"; channel posts use `channels.deleteMessages`.
- URLs in message text are linkified and open in the system browser.
- Clicking a photo opens a full-size dialog; the image is streamed from MTProto
  on demand, never saved beside the executable.
- The reaction action opens an emoji grid. Existing reactions render as a footer
  inside the bubble (emoji + count), with the timestamp on the same footer;
  clicking a chip toggles that emoji for the current user. Custom Telegram emoji
  reactions are streamed as images and toggled by their document id, not sent as
  a placeholder glyph. There is no detached reaction pill row and no permanent
  `+` circle.
- Incoming albums (`grouped_id`) render as one mosaic bubble. Forward, delete and
  download actions use every message id in the album.
- The attach button opens the native multi-file picker. Files are uploaded with
  512 KiB parts and a progress bar in the composer; the caption is taken from
  the composer text.

## Live updates

While the shared client is connected, an update dispatcher pushes new messages,
edits, deletions, reaction counts and read receipts to the UI. Short private
messages are mapped directly; short group messages and `updatesTooLong` request a
resync because they do not carry sender entities. History requests merge with
messages that arrived while the request was in flight, so a live message is not
lost to a slightly older snapshot.

The open conversation is also kept in sync by a two-second delta poll:
`GetNewMessages(chatID, newestRenderedId)` uses Telegram's `min_id` history
filter, so only newly arrived messages/replies are mapped. This is a fallback for
transient update-stream gaps and avoids re-registering or re-downloading the
already visible media.

## Bubble presentation

The message surface follows Telegram Web K's proportions: a 15 px bubble
radius, 5 px corners where a group joins, 4/9/5 px text padding, 21 px line
height, a 480 px text column and a wallpaper canvas. Bubbles are fully rounded
(no protruding tail; the same clean silhouette as Telegram Web's grouped
layout). Incoming bubbles are white, outgoing bubbles use Telegram's pale green
in the light theme and steel blue in the dark theme. The sender name is rendered
inside the top of the bubble with the sender's premium emoji status next to it
(resolved from `user.emoji_status` custom-emoji documents and served through the
loopback thumbnail endpoint). Avatars are shown only once at the bottom of a
sender group. For a media message the name/status sit in a bubble-coloured header
band above the image, so they never float on the wallpaper. Reactions are the
bubble's footer: emojis and the timestamp share the same bubble shape instead of
floating in a detached pill row. The time/checks float at the end of the last text
line; media-only cards get a translucent overlay pill instead.

Cards use intrinsic Telegram dimensions. A portrait photo is tall, a landscape
photo is wide, a round video stays circular, and a sticker sits on the canvas
without a bubble. Entry uses a short translate/fade and media zooms only 1.5% on
hover; both respect `prefers-reduced-motion`.

## Instant paint and history

The kernel persists the last dialog snapshot and up to 50 messages per opened
chat under `data/cache/`. On launch the frontend calls `GetCachedChats` /
`GetCachedMessages` and paints them immediately (typically under 400 ms in the
WebView), then replaces them with `GetChats` / `GetMessages` when the network
answers. Process-local image URLs are stripped from the snapshot so stale
loopback ports are never requested; images fill in with the network refresh.
This mirrors the local database first-paint of official clients without turning
the portable directory into a media cache.

## Message loading

Recent history is kept in a frontend memory cache per chat, so returning to a
chat renders instantly while a background refresh replaces the snapshot. The
main dialog list loads independently from archived chats and folders, and a short
kernel-side dialogs cache prevents duplicate `messages.getDialogs` calls (and
their flood waits) when the WebView reloads. Main/archive results are deduped by
peer id with the archived flag winning, so a message refresh can never pull an
archived chat back into the main list. History pagination prepends older
pages without a full reload. Thumbnails and avatars load natively through the
loopback image server (see below); no Wails call is made per image.

## Chat-specific presentation

- **Private chats:** neither side shows an avatar or sender name. Only the
  header avatar identifies the peer.
- **Groups and channels:** the sender name is shown on the first bubble of a
  group and the avatar once at the bottom of that group, like Telegram Web.
  The avatar is fetched lazily; initials are the fallback while loading or when
  the peer has no photo.
- The chat header is a floating surface; clicking the avatar/title toggles the
  right-hand info pane. It has Members / Media / Links tabs: members come from
  the recent-participant API, media is a thumbnail grid from loaded messages,
  and links collect the chat's `t.me` URL plus URLs found in loaded messages.
- The conversation list is a set of floating rows with real peer photos; there
  is no divider between the list and the chat surface.

## Known boundaries

- Media playback: video/video-note use progressive range streaming by default,
  or tdl's parallel download-while-watching when the setting is enabled. Voice
  and audio use the same loopback range endpoint. Attachments can be sent from
  the composer; multiple files are sent as separate messages rather than one
  outgoing album.
- Polls are rendered with results and the quiz solution, but voting is not yet
  wired to `messages.sendVote`; callback keyboard buttons show a toast instead of
  running bot callbacks.
- Paid media, full story bodies, giveaway channel lists and live-location updates
  are represented as cards but not expanded into dedicated viewers.
- Rich text supports the common Telegram entities. Custom emoji are rendered as
  a styled placeholder instead of downloading each emoji document.
- A history call returns the latest 50 messages. Scrolling to the top of the
  timeline automatically requests the previous page (`GetOlderMessages` with
  `OffsetID`); there is no load-more button, and a first page too short to fill
  the viewport keeps paging. The scroll position is anchored to the previous
  first message while the older page is prepended. Live updates are pushed while
  connected but have no persisted gap-recovery state; `updatesTooLong` asks the
  UI to reload.
- Images are served by the same loopback server under `/thumb`, `/avatar` and
  `/photo` prefixes with a per-process token. Thumbnails and avatars are cached
  in memory (48 MiB LRU) and by the WebView HTTP cache; full photos are streamed
  as ranges and cached by the WebView. The old `data/thumbs/` and `data/avatars/`
  directories are deleted on startup and are no longer written.
- Videos are never fully downloaded before the player opens.
  - **Default / Telegram mode:** the local loopback server exposes
    `/stream/<token>/<session>` and fetches `upload.getFile` byte ranges on
    demand with `precise` and `cdn_supported=false`, so the browser can start
    playing as soon as the first chunks arrive. This mirrors the Telegram Web
    approach of a service-worker range endpoint; the implementation here is
    original and uses gotd directly.
  - **tdl mode (setting):** tdl's multi-connection downloader writes a growing
    cache file under `data/media/stream_*`; the same loopback server waits for
    each requested byte range and streams it as soon as it is written. Playback
    starts while the rest downloads in parallel, bypassing Telegram's official
    range throttle.
  - Scrub/seek requests re-enter the same range handler and are satisfied from
    MTProto or the growing file.
  - The video dialog shows a preparation spinner only while message metadata is
    resolved; the actual transfer happens while the native player is open.

## License note

The streaming implementation is original Go/TypeScript code built on gotd and
tdl, both consumed as dependencies. No source code is copied from Telegram Web
(tweb, GPL-3.0), Telegram Desktop or the official mobile clients. The protocol
behaviour was researched from the public `upload.getFile` method description and
public tweb architecture notes; only the wire-level API shape is used.

## Research references

- Telegram Bot API message/media field list: <https://core.telegram.org/bots/api#message>
- Pyrogram media type enumeration (covers stickers, animations, voice notes,
  web pages, dice, stories, giveaways, invoices and paid media):
  <https://github.com/TelegramPlayGround/PyroTGFork/blob/144e433abb4b99646c9eed805f33224d87b4997e/pyrogram/enums/message_media_type.py>
- Telegram Web K message rendering architecture:
  <https://deepwiki.com/morethanwords/tweb/2-core-messaging-system>
- Telegram Web K service-worker media cache (session keys in localStorage,
  state in IndexedDB, media in CacheStorage, service worker streams files):
  <https://github.com/morethanwords/tweb/blob/2e4bbb52b6aec5e95ee32e5c2882c1f05de32200/.oss-scanner/threat_model.md>
- Telegram Web K feature inventory:
  <https://github.com/morethanwords/tweb/blob/2e4bbb52b6aec5e95ee32e5c2882c1f05de32200/TELEGRAM_FEATURES.md>
- Telegram React message actions and context menus:
  <https://deepwiki.com/evgeny-nadymov/telegram-react/3.3-message-actions-and-menus>
