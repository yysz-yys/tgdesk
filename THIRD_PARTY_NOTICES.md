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
| Material Web (`@material/web`) | Apache-2.0 | <https://github.com/material-components/material-web> |
| Wails JS runtime | MIT | <https://github.com/wailsapp/wails> |
| clsx | MIT | <https://github.com/lukeed/clsx> |
| qrcode.react | ISC | <https://github.com/zpao/qrcode.react> |
| Vite, TypeScript and build tooling | MIT / Apache-2.0 | see package manifests |

## Fonts

| Font | License | Bundled license |
|---|---|---|
| Roboto | Apache-2.0 | [`frontend/public/fonts/LICENSE.txt`](frontend/public/fonts/LICENSE.txt) |
| Material Symbols Rounded | SIL Open Font License 1.1 | [`frontend/public/fonts/MATERIAL_SYMBOLS_LICENSE.txt`](frontend/public/fonts/MATERIAL_SYMBOLS_LICENSE.txt) |

The Roboto and Material Symbols files are shipped inside `frontend/public/fonts`
and are included in the production bundle. They are not fetched from a CDN.

## Brand and documentation

The tgdesk name and logo identify this project. The Telegram name and logo are
trademarks of Telegram Messenger LLP; they are used only to describe protocol
compatibility. Screenshots under `docs/assets/` must not contain private account
data, chats, QR tokens or phone numbers.
