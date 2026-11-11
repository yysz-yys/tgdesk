# Telegram Desktop frontend rebuild

Reference target: official portable Telegram Desktop 7.4.1 on Windows, captured at
the same 1107×725 CSS viewport as tgdesk. Text labels and control order were
cross-checked with Windows UI Automation, not guessed.

## Method

1. Capture the official screen and enumerate its accessible controls.
2. Rebuild it from small, named components (`tg-*` CSS namespace).
3. Build, capture tgdesk, compare spacing/typography/state, refine.
4. Commit each page-sized slice and push `main`.

## Atomic layer

| Layer | Components |
|---|---|
| Controls | `Button`, `IconButton`, `TextField`, `SelectField`, `Callout`, `Spinner` |
| Brand | `BrandMark` |
| Login | `LoginShell`, `LoginWelcomeStep`, `LoginQrStep`, `LoginPhoneStep`, `LoginCodeStep`, `LoginPasswordStep`, `LoginSuccessStep`, `LoginNetworkSettings` |
| Conversation | `ChatHeader`, `ChatComposer`, `SelectionBar`, `MessageList`, `MessageBubble` |

The old monolithic login markup and the custom download selection bottom bar
were removed from the active path.

## Login flow (implemented)

Official order replicated:

1. **Welcome** — “Telegram Desktop”, “Start Messaging”, language link.
2. **Scan From Mobile Telegram** — QR, three numbered steps, phone/passkey
   links, back, Settings.
3. **Phone number** — country code + number, Next.
4. **Code** — code from Telegram.
5. **Two-step verification** — password.
6. **Success** — handoff to the main window.

The QR screen keeps tgdesk's proxy panel behind the Settings control because
Telegram is often blocked on the target network.

## Conversation (implemented slice)

- Telegram-style header with avatar, title, member/online line, search, call,
  info, overflow menu.
- Message list retained with date pills, sender colors, media cards, tails,
  time/check marks, selection checkboxes.
- Real composer: attach, emoji, multiline input, Enter to send, voice placeholder.
- `SendMessage` kernel/API path is wired to MTProto; attachments, voice and calls
  remain placeholders.
- Download-all moved to the chat overflow menu; batch selection has its own bar.

## Official test-account pass (Telegram Desktop 7.4.1)

The supplied limited test tdata was copied to an isolated `-workdir` and used
only with the official portable client. The source folder stays private and is
ignored by git (`/tdataTest/`).

Observed on the signed-in but restricted account:

- Main window shows a **“your account is frozen”** warning above the chat list.
- No folder tab strip is shown when the account has no custom folders.
- Main menu: Set emoji status, My profile, New group, New channel, Contacts,
  Calls, Saved messages, Settings, Night mode, About.
- Chat header exposes search, chat menu and profile info.
- The settings surface was visible before dismissal: account row, My account,
  Notifications and sounds, Privacy and security, and the remaining settings
  sections.

The tgdesk menu now mirrors the official item order (with “coming soon”
placeholders where the kernel has no API), and the folder strip is hidden for
accounts without folders.

The settings surface was rebuilt as the official right-side sheet: account
header with avatar, phone and username, then the single settings list (My
account, Notifications, Privacy, Chat settings, Folders, Advanced, Speakers,
Battery, Language, Scale, Premium, Stars, Business, Gifts, FAQ, Shortcuts,
Features, Ask). Existing tgdesk controls open as subpages with a back button;
sections without kernel support open an explicit placeholder instead of fake
controls.

The My account subpage now follows the official profile layout: large avatar,
online line, Edit profile action, an account-information card with phone +
QR entry, username and bio, then the session/log-out row.

Privacy and security, Chat folders and Language are now real subpages too.
Privacy/security presents Security, Privacy and Data groups with clearly
labelled “coming soon” values where the kernel has no privacy API. Chat folders
explains that custom folders are stored by Telegram and the current kernel only
exposes the default list. Language reuses the local language preference and
applies it immediately.

Notifications and Chat settings are now real subpages:

- Notifications: download-finished notifications, an explicit note that message
  notifications require a background connection, and disabled “coming soon”
  rows for message notifications and sound.
- Chat settings: message text size slider, chat-background dot pattern, and a
  new real `enterToSend` preference. The composer consumes it; with the
  preference off, Enter inserts a newline and the send button remains.

The test tdata was also imported into an isolated tgdesk home. It authenticated
and displayed the account and six chats. Its server-side frozen state is not
exposed by `Self.Restricted` in this Kernel version, so the sidebar warning
renders only when that flag is present; the official banner remains unverified
for this account.

## Official geometry at 1107×725

The official portable client was resized until its client area was exactly
1107×725, then captured by rendering the physical 2214×1450 surface and scaling
it down. Measured values:

| Region | Official | tgdesk |
|---|---|---|
| Caption bar | 24 px | 24 px |
| Sidebar | 394 px | 394 px |
| Chat header | 56 px | 56 px |
| Chat row | 60 px | 60 px |
| Chat-list avatar | 48 px | 48 px |
| Right info panel | 290 px | 290 px |

Official colors sampled from that capture: caption `#242f3d`, sidebar
`#17212b`, chat background `#0e1621`, selected row `#2b5278`, right panel
`#232e3c`. Those are the values already used by the dark palette.

The chat header no longer shows an avatar. It now matches the official
search / info-panel / overflow layout, with the call button only for private
chats. Channels get the official bottom “disable notifications” bar instead of
a message composer, and the channel info panel exposes Mute / Gift / Leave.

## Official login geometry

Captured the clean official welcome and QR screens at the same 1107×725 client
size (physical 2× render, downscaled):

- Frozen caption bar: 24 px.
- Welcome illustration: 226 px tall.
- Welcome title: y = 342; button 300×34.
- QR: 188×188 at y = 162.
- QR title: y = 377/378.
- QR steps: 26 px line-height starting around y = 421.
- Phone/passkey links around y = 540.
- Top-right text actions: `UPDATE` and `SETTINGS`.
- QR screen has no chat wallpaper/plane/aurora background.

The rebuilt login now uses a 226 px illustrated hero, the same title and QR
coordinates, a 188 px QR, numbered `1.` steps instead of circular badges,
plain `UPDATE`/`SETTINGS` actions, and a plain `#17212b` QR background.

## Chat surface pass

- Sidebar is 420px at the target viewport; chat header is 56px; composer measures
  59px with the current padding.
- The Telegram info panel is a real third column at desktop widths and only
  becomes an overlay below 980px.
- Message photos no longer draw a fabricated mountain illustration. The kernel
  exposes media metadata but not thumbnails, so the bubble shows an explicit
  photo placeholder with the file name; the info panel shows real media entries
  from the loaded messages.
- Loading/failed message states and the jump-to-latest control remain intact.
- Chat search is now a real atomic bar under the chat header. It filters the
  loaded messages by sender, text and media name, reports the result count and
  shows an explicit empty state. The kernel has no server-side search endpoint;
  the UI labels this as search over loaded messages.

## Real media thumbnails

`GetMessageThumb` now resolves a single message, selects the Telegram thumbnail
size for a photo or the document thumbnail, downloads only that small file,
caches it under `<root>/data/thumbs`, and returns a base64 JPEG to the webview.

The UI loads thumbnails lazily with an IntersectionObserver, caches data URLs in
memory per chat/message, and swaps the placeholder for the real image when it
arrives. Both message bubbles and the right-panel media grid use the same
component. Full media downloads remain in the existing byte-resume download
pipeline.

Verified against a live photo message: the `img` arrived at 800×334 natural
size and the cached thumbnail was 76 KB. No thumbnail or tdata file is tracked
by git.

## Forward and video metadata

`MessageDTO` now carries the forward header (sender name / original date) and
`MessageMediaDTO` carries raw bytes, MIME, duration, width and height. The chat
renders Telegram-style video cards with a play badge and duration, and forwarded
messages get an accent “Forwarded from …” line. File rows include duration and
dimensions when Telegram supplies them.

Verified in the live chat: two video cards rendered, with duration metadata
(`0:02`) and file sizes. Forward headers are rendered when the loaded messages
contain them.

## Message grouping

Consecutive messages from the same sender on the same day now hide repeated
sender labels and only the last bubble in the run draws the Telegram tail.
Verified on 50 loaded messages: 50 bubbles, only 37 sender labels and 13
non-tail bubbles.

## Special message media and wallpaper

Polls, locations and contacts now have dedicated models in `MessageMediaDTO`
(options, latitude/longitude, phone/contact name) and dedicated chat cards:
poll question + options, location coordinates, contact name and phone.

The chat background keeps the local dot-pattern preference but now adds a
low-contrast blue radial lighting layer, avoiding the previous flat dot grid.
Verified against the live chat: three poll cards rendered in a channel.

## Poll results

Polls now carry vote counts, chosen flags, total voters and closed state. The
chat renders per-option percentage bars, a chosen marker and a
votes/final-results footer. Verified live: three polls, eight options and eight
bars, with footers such as `81 votes · Final results`.

## Location and contact actions

Location cards now draw a lightweight map-like road surface with a centered pin;
clicking opens the coordinates in OpenStreetMap through the Wails browser
opener. Contact cards copy the phone number to the clipboard and report success
through the existing toast.

## Service messages

`MessageService` entries are now mapped into the message timeline instead of
being dropped: joins, invite-link joins, leaves, title changes, pins, channel
creation and TTL changes render as centered Telegram-style service pills with a
small timestamp. Verified live: one join service message was rendered.

## Chat background presets

Chat settings now exposes a real local background choice: Telegram glow,
plain dark, or deep blue. The selected preset is stored with the other local
settings and applied through `data-wallpaper`; the dot-pattern switch composes
with each preset. Verified live: selecting `blue` set the dataset and produced
the radial/linear background stack.

## Custom background image

Chat settings can now load a local image (up to 3 MB) as the chat background.
The image is stored as a data URL in the existing portable settings and applied
through `--tg-wallpaper-image` with a dark readability overlay. A Remove action
clears the image and falls back to the Telegram glow preset.

Verified live: a data-URL image set `data-wallpaper="custom"`, populated the CSS
variable, and produced the layered background stack.

## Next page-sized slices

1. Sidebar: Telegram folder tabs, search row, compose button, chat row metrics,
   account footer; compare against official at 1107×725.
2. Chat pane: pixel metrics for header (56 px), bubbles, date pills and composer;
   verify against reference screenshots.
3. Right panel: profile, actions, shared media, members.
4. Settings: align dialogs, tabs and rows with Telegram Desktop.
5. Remove remaining legacy `login-settings.css` login rules after the new login
   is pixel-stable.
