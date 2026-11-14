# Third-party notices

tgdesk itself is licensed under the **GNU Affero General Public License v3.0
only** (`AGPL-3.0-only`); see [LICENSE](LICENSE). The project is not affiliated
with Telegram or with the maintainers of tdl.

The distributed application and its source tree include the following
third-party components. The list is informative; the upstream license text in
each package/module remains authoritative.

## Application and library code

| Component | License | Upstream |
|---|---|---|
| tdl / tdl core | AGPL-3.0 | <https://github.com/iyear/tdl> |
| gotd/td and gotd helpers | MIT | <https://github.com/gotd/td> |
| Wails v3 | MIT | <https://github.com/wailsapp/wails> |
| React, React DOM | MIT | <https://react.dev/> |
| i18next, react-i18next | MIT | <https://www.i18next.com/> |
| Radix UI primitives | MIT | <https://www.radix-ui.com/> |
| Radix Themes | MIT | <https://www.radix-ui.com/themes> |
| Lucide icons | ISC | <https://lucide.dev/> |
| Wails JS runtime | MIT | <https://github.com/wailsapp/wails> |
| clsx | MIT | <https://github.com/lukeed/clsx> |
| qrcode.react | ISC | <https://github.com/zpao/qrcode.react> |
| lottie-web | MIT | <https://github.com/airbnb/lottie-web> |
| Vite, TypeScript and build tooling | MIT / Apache-2.0 | see package manifests |

## Fonts

| Font | License | Bundled license |
|---|---|---|
| Inter | SIL Open Font License 1.1 | [`frontend/public/fonts/Inter-OFL.txt`](frontend/public/fonts/Inter-OFL.txt) |
| Roboto (Web K UI font, 400/500/600 Latin subsets) | Apache-2.0 | [`frontend/public/assets/fonts/Roboto-LICENSE.txt`](frontend/public/assets/fonts/Roboto-LICENSE.txt) |
| tgico (Telegram Web K icon font) | GPL-3.0 (tweb asset) | [`THIRD_PARTY_LICENSES/tweb-GPL-3.0.txt`](THIRD_PARTY_LICENSES/tweb-GPL-3.0.txt) |

The Inter Latin subset is shipped inside `frontend/public/fonts` and is included
in the production bundle. The Web K screens use the Roboto subsets and the tgico
icon font from `frontend/public/assets/fonts`. CJK text falls back to the Windows
UI font. No font is fetched from a CDN.

## Telegram Web K UI port

The signed-in main screen reproduces Telegram Web K's markup, CSS, icon font,
wallpaper pattern and press/animation behaviour from the open-source
**tweb** client (GPL-3.0-only; AGPL-3.0 is compatible with GPLv3, so the port is
distributed here under this project's AGPL-3.0-only licence):

| Component | License | Upstream |
|---|---|---|
| Ported CSS/markup/algorithms (`frontend/src/components/k`, `frontend/src/styles/k`, `docs/design-k.md`) — chat list, sidebar, folder chips, empty column, wallpaper renderer, ripple | GPL-3.0-only (tweb), distributed here under AGPL-3.0-only | <https://github.com/morethanwords/tweb> |
| `frontend/public/assets/img/pattern.svg` — the default doodle wallpaper pattern | GPL-3.0 (tweb asset) | <https://github.com/morethanwords/tweb> |
| `frontend/public/assets/fonts/tgico.{ttf,woff}` — Telegram Web K icon font | GPL-3.0 (tweb asset) | <https://github.com/morethanwords/tweb> |
| `frontend/public/assets/tgs/UtyanSearch.json` — the "No results" duck Lottie used by the Add Members search | GPL-3.0 (tweb asset) | <https://github.com/morethanwords/tweb> |

The complete GPLv3 text of tweb is bundled as
[`THIRD_PARTY_LICENSES/tweb-GPL-3.0.txt`](THIRD_PARTY_LICENSES/tweb-GPL-3.0.txt).
tweb is used as a reference checkout only (`temp/tweb`, gitignored); it is not
needed to build, and no tweb code runs in the application.

## Emoji data and images

The emoji picker mirrors Telegram Web K (web.telegram.org): its catalogue order,
skin-tone templates and rendered Apple emoji images come from the Web K client,
while the Unicode data underneath is regenerated from permissive sources. The
generated files in `frontend/src/data/emoji*.ts` are checked in; no network
access is needed to build or run the app.

| Component | License | Upstream |
|---|---|---|
| Telegram Web K (`src/config/emoji.ts` `EmojiVersions`, `src/config/emojiSkinTone.ts`) — emoji tile order and skin-tone templates | GPL-3.0-only; used as reference data only (see note) | <https://github.com/morethanwords/tweb> |
| iamcal/emoji-data (`emoji_pretty.json`) — fully-qualified Unicode strings and English names | MIT (© 2013 Cal Henderson) | <https://github.com/iamcal/emoji-data> |
| Unicode CLDR annotations / annotationsDerived — `en`, `zh`, `ja` search keywords | Unicode License V3 | <https://github.com/unicode-org/cldr-json> |
| Apple emoji artwork (`frontend/public/emoji`, 3,787 PNGs) — via iamcal/emoji-data's Apple image set, as shipped by Telegram Web K | See note below | <https://github.com/iamcal/emoji-data> |

Notes:

- **Telegram Web K data.** The catalogue order in `frontend/src/data/emoji.ts`
  is derived from Web K's `EmojiVersions` map (category digit + sort position)
  and its skin-tone templates from `emojiSkinTone.ts`; both files are part of
  tweb, which is GPL-3.0-only. Emoji codepoint sequences and their standard
  ordering are Unicode data, and tweb's licence is compatible with this
  project's AGPL-3.0-only licence, but tweb is attributed here for
  transparency. No tweb source code (CSS, components) is copied into tgdesk.
- **Apple emoji images.** The PNGs under `frontend/public/emoji` are the 64 px
  Apple emoji images distributed with iamcal/emoji-data (the
  `emoji-datasource-apple` set); Telegram Web K ships the same files under
  `public/assets/img/emoji`. The artwork is Apple Inc.'s; iamcal's README notes
  that the Apple images are **not licensed for commercial usage**, and the
  images are bundled here only to match Telegram Web K's visual appearance. If
  a distribution cannot carry them, replace the files with Noto (Apache-2.0) or
  Twemoji (CC-BY 4.0) images using the same `<unified>.png` naming — the picker
  falls back to the platform glyph when an image is missing.
- **Unicode data.** Emoji characters, codepoint sequences and CLDR annotations
  are Unicode standard data; the names and keywords are licensed by the sources
  above, and the catalogue/keyword files are regenerated deterministically by
  `temp/emoji-r3/build-emoji-data.mjs` (dev-only script, `temp/` is
  gitignored).


## Protocol implementation

The video streaming implementation is original tgdesk Go/TypeScript code built
on the gotd/td and tdl dependencies listed above. It calls the public Telegram
MTProto methods (`upload.getFile`, `messages.getHistory`,
`messages.getDialogFilters`, `messages.getDialogs`,
`folders.editPeerFolders`). The protocol side contains no source code from
Telegram Web/tweb, Telegram Desktop, or the official mobile clients; public
protocol/method descriptions and architecture notes are used only as references.
(The Web K *UI* port is attributed separately above.)

## Brand and documentation

The tgdesk name and logo identify this project. The Telegram name and logo are
trademarks of Telegram Messenger LLP; they are used only to describe protocol
compatibility. Screenshots under `docs/assets/` must not contain private account
data, chats, QR tokens or phone numbers.
