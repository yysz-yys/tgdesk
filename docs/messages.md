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
   the target against the loaded history and shows a quoted block.
5. Sender names and opaque `senderId`s come from the same history response.
   `GetChatAvatar` resolves a peer photo lazily and caches the small JPEG under
   `data/avatars/`.

## Supported message kinds

| Kind | Telegram source | Rendering |
| --- | --- | --- |
| Text | `Message.message` | Bubble text |
| Photo | `MessageMediaPhoto` | 360×220 thumbnail card |
| Video | `DocumentAttributeVideo` | Thumbnail card; click caches the file and opens the native video player |
| GIF / animation | `DocumentAttributeAnimated` | Thumbnail with a GIF badge |
| Sticker | `DocumentAttributeSticker` | 140px contained thumbnail plus emoji |
| Voice | `DocumentAttributeAudio.Voice` | Mic file card with duration |
| Video note | `DocumentAttributeVideo.RoundMessage` | Round-video card with the same player as video |
| Audio | `DocumentAttributeAudio` | Audio file card; uses title/performer when available |
| File | any other document | File card with extension, size and download icon |
| Poll / quiz | `MessageMediaPoll` | Question, options, vote bars, quiz badge |
| Location | `MessageMediaGeo` | Map preview and coordinates |
| Live location | `MessageMediaGeoLive` | Map preview with live flag |
| Venue | `MessageMediaVenue` | Map preview with title and address |
| Contact | `MessageMediaContact` | Contact card with copy-phone action |
| Web page | `MessageMediaWebPage` | Link preview with site, title and description |
| Dice | `MessageMediaDice` | Emoji and rolled value |
| Game | `MessageMediaGame` | Game card |
| Invoice | `MessageMediaInvoice` | Product/receipt card |
| Story | `MessageMediaStory` | Story card |
| Giveaway | `MessageMediaGiveaway*` | Giveaway card |
| Paid media | `MessageMediaPaidMedia` | Paid-media card |
| Checklist | `MessageMediaToDo` | Checklist card |
| Unsupported | `MessageMediaUnsupported` or future media | Explicit unsupported card, never a blank bubble |
| Service | `MessageService` actions | Centered service pill, localized for common actions |

Forwarded headers, captions (`message.message` alongside media), reply quotes,
and sent/read ticks sit inside the same bubble.

## Chat-specific presentation

- **Private chats:** neither side shows an avatar or sender name. Only the
  header avatar identifies the peer.
- **Groups and channels:** every message shows its sender avatar. The avatar is
  fetched from Telegram lazily (visible rows only), with initials as the fallback
  while loading or when the peer has no photo. Repeated messages in a group keep
  the same avatar and align under the first bubble.
- The chat header is a floating surface; clicking the avatar/title opens the
  chat-info dialog (type, username, member count, last message).
- The conversation list is a set of floating rows with real peer photos; there
  is no divider between the list and the chat surface.

## Known boundaries

- Media playback: video/video-note are playable via the cached loopback player;
  photo/video/sticker/GIF thumbnails are shown inline, and voice/audio/file items
  remain metadata cards. There is no upload flow yet.
- Paid media, story bodies, giveaway details and live-location updates are
  represented but not expanded into their dedicated viewers.
- Rich text entities (bold, links, code, custom emoji) are currently shown as
  their underlying text. Reactions, edits and album grouping are not rendered.
- A history call returns the latest 50 messages. The user can load earlier pages
  from the top of the timeline (`GetOlderMessages` with `OffsetID`); the UI keeps
  the previous first message anchored while prepending the older page.
- Videos are cached under `data/media/` and served to the WebView through a
  random loopback-only HTTP token with Range support. The video dialog shows a
  preparation spinner while the first download runs.

## Research references

- Telegram Bot API message/media field list: <https://core.telegram.org/bots/api#message>
- Pyrogram media type enumeration (covers stickers, animations, voice notes,
  web pages, dice, stories, giveaways, invoices and paid media):
  <https://github.com/TelegramPlayGround/PyroTGFork/blob/144e433abb4b99646c9eed805f33224d87b4997e/pyrogram/enums/message_media_type.py>
- Telegram Web K message rendering architecture:
  <https://deepwiki.com/morethanwords/tweb/2-core-messaging-system>
