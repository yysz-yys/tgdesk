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

The Inter Latin subset is shipped inside `frontend/public/fonts` and is included
in the production bundle. CJK text falls back to the Windows UI font. The font is
not fetched from a CDN.

## Protocol implementation

The video streaming implementation is original tgdesk Go/TypeScript code built
on the gotd/td and tdl dependencies listed above. It calls the public Telegram
MTProto methods (`upload.getFile`, `messages.getHistory`,
`messages.getDialogFilters`, `messages.getDialogs`,
`folders.editPeerFolders`). No source code from Telegram Web/tweb, Telegram
Desktop, or the official mobile clients is copied into this repository. Public
protocol/method descriptions and architecture notes are used only as references.

## Brand and documentation

The tgdesk name and logo identify this project. The Telegram name and logo are
trademarks of Telegram Messenger LLP; they are used only to describe protocol
compatibility. Screenshots under `docs/assets/` must not contain private account
data, chats, QR tokens or phone numbers.
