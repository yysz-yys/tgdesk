# Assets

## Current screenshots

- `ui-login-current.png` — F welcome/QR screen (synthetic data).
- `ui-login-phone.png` — phone step with the country picker.
- `ui-chat-home.png`, `ui-chat-home-light.png` — F shell, dark/light, synthetic conversations.
- `ui-downloads.png` — downloads occupying only the right chat pane.
- `ui-chat-info.png` — right-side chat info pane (synthetic conversation).
- `ui-app-menu.png` — shared app dropdown menu.
- `ui-settings-streaming.png` — F settings dialog.
- `ui-archive.png`, `ui-archive-menu.png` — archived-chats view and its dropdown.

These use synthetic conversations only: no real account data, phone number or live
QR token. Private verification screenshots stay in the gitignored `temp/`
directory.

## Brand source

- `brand/source.png` — original 4096×4096 logo source.
- `brand/logo-1024.png` — 1024px flattened app icon (white/transparent
  background, same artwork as `build/appicon.png`).

Generated favicon/PWA sizes live in `frontend/public/`; platform build icons live
in `build/`.

## Screenshot rules

- Never add screenshots of real logged-in chats, profiles, phone numbers, QR
  tokens or settings account headers.
- Keep private verification screenshots in the gitignored `temp/` directory or
  outside the repository.
- Prefer JPEG/optimized PNG for new documentation screenshots.
