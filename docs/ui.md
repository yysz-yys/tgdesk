# UI and design

tgdesk deliberately uses two visual languages:

- **Login:** Google Material 3, light surface, Roboto.
- **Chat shell:** Telegram Desktop-like dark palette, compact 24px caption bar.

The split keeps the branded entry point distinct while the working surface stays
familiar to Telegram users.

## 1. Login (Material 3)

![Login](assets/ui-login-current.png)

![Phone login](assets/ui-login-phone.png)

### Layout

- Two columns on desktop: a 45% brand panel (max 580px) and a centred 400px card.
- Brand panel: soft blue/green tonal gradient, 80px white logo tile, product
  claim, three tonal feature rows, small footer.
- Card: white `#ffffff`, 28px radius, Material elevation shadow, 28–32px padding.
- Below 860px the brand panel is hidden; a compact logo header appears above the
  card.
- The caption bar switches to `#f8fafd` while the login page is mounted.

### Material 3 tokens

| Role | Value |
|---|---|
| primary | `#0b57d0` |
| on-primary | `#ffffff` |
| primary-container | `#d3e3fd` |
| surface | `#ffffff` |
| surface-container | `#f0f4f9` |
| surface-container-high | `#e9eef6` |
| on-surface | `#1f1f1f` |
| on-surface-variant | `#444746` |
| outline | `#747775` |
| outline-variant | `#c4c7c5` |
| error-container | `#f9dedc` |
| success | `#146c2e` |

- Primary actions: filled, 48px height, fully rounded (pill).
- Inputs: 56px filled field, 8px radius, 2px inset primary focus ring.
- Secondary actions: text buttons in primary blue.
- Callouts: Material error/info containers.
- Motion: short background/border transitions; no decorative animation.

### Typography

- `Roboto` (bundled variable WOFF2 in `frontend/public/fonts`), weights 400/500.
- CJK falls back to `Noto Sans SC` / `Microsoft YaHei UI`.
- Card headings 24–29px / 500, body 13.5px, labels 11px, eyebrow 10px uppercase.

### Login flow and components

`LoginShell` owns the page; `LoginScreen` owns the state machine:

```text
welcome → qr ─┬→ success
              └→ phone → code → password? → success
```

| Step | Component | Notes |
|---|---|---|
| Welcome | `LoginWelcomeStep` | Start (QR) or phone; language toggle |
| QR | `LoginQrStep` | `qrcode.react`, expiry countdown, manual refresh, proxy settings |
| Phone | `LoginPhoneStep` | `CountryPicker` + national number; format `+886 905462282` |
| Code | `LoginCodeStep` | Delivery hint, expected length, auto-submit, resend countdown, retry |
| 2FA | `LoginPasswordStep` | Cloud-password hint, flood-wait aware |
| Success | `LoginSuccessStep` | Shows the generated `tdata` path, then opens the app |

- `CountryPicker`: searchable list of 224 entries, pinned common countries,
  localized names via `Intl.DisplayNames`, default `CN` / `+86`.
- QR expiry: backend emits `qrExpiresIn`; the token rotates automatically.
- Code events carry `codeType`, `codeLength`, `codeTimeout`, `resent`; the UI
  auto-submits at the expected length and clears the field after an invalid code.
- Errors are rendered from machine codes (`PHONE_CODE_INVALID`,
  `FLOOD_WAIT`, `SEND_CODE_UNAVAILABLE`, `PASSWORD_HASH_INVALID`, …), not raw
  RPC strings.
- Proxy settings are embedded in QR and phone steps; the password stays in
  memory only.

## 2. Chat shell

- Reference client size: 1107×725 CSS px (Windows 100–200% DPI).
- 24px frameless caption bar, 46px window buttons, drag region via Wails.
- Sidebar: 394px; 320px at ≤980px; hidden at ≤720px.
- Chat header ~56px, chat rows 60px, 48px avatars, 12px bubble radius.
- Dark palette: sidebar `#17212b`, chat `#0e1621`, incoming `#182533`,
  outgoing `#2b5278`, accent `#64b5ef`; light tokens also exist in `app.css`.
- Message surface: grouped bubbles, date pills, tails, sent/read checks, file/
  video/photo cards, polls, locations, contacts, service messages.
- Sidebar: search, download shortcut row, chat rows with pin/mute/unread,
  account footer, settings and logout.
- Downloads: Active/Completed/Failed tabs, progress, speed/ETA, pause/resume/
  cancel/open-folder.
- Settings sheet: language, send-on-Enter, download folder/threads/template,
  proxy, NTP. It is intentionally smaller than Telegram Desktop's settings.

## 3. Component map

- `components/auth` — login steps, `CountryPicker`, `BrandMark`,
  `LoginLoading`, `LoginNetworkSettings`.
- `components/chat` — header, search, message list/bubble, media thumb,
  location preview, composer, channel bar, selection bar.
- `components/layout` — caption bar, sidebar.
- `components/downloads` — download view and task row.
- `components/settings` — sheet, panel styles and form controls
  (`settings-panel.css`, `settings-controls.css`).
- `components/ui` — `Button`, `TextField`, `SelectField`, `Callout`, `Menu`,
  `ContextMenu`, `Tooltip`, `Avatar`, `Spinner`, `IconButton`.

## 4. Accessibility and responsive rules

- Buttons have labels; decorative art is `aria-hidden`.
- Country picker uses `aria-haspopup`/`aria-expanded`/`role="option"`, closes on
  Escape and outside click, and focuses the search field on open.
- Login card is keyboard-first; Enter submits; code input uses
  `autoComplete="one-time-code"`.
- `@media (max-width: 860px)` hides the brand panel; `(max-width: 480px)`
  switches the card to a borderless layout.
- `(max-height: 660px)` compresses the brand panel for short windows.

## 5. Screenshots and brand assets

- `docs/assets/ui-login-current.png` — current welcome.
- `docs/assets/ui-login-phone.png` — phone step.
- `docs/assets/brand/source.png` — original logo source.
- `docs/assets/brand/logo-1024.png` — 1024px app icon.

Do not add screenshots of logged-in chats, account headers, QR tokens or phone
numbers. Keep private verification images under `temp/` (gitignored).
