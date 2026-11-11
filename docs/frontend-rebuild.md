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

## Next page-sized slices

1. Sidebar: Telegram folder tabs, search row, compose button, chat row metrics,
   account footer; compare against official at 1107×725.
2. Chat pane: pixel metrics for header (56 px), bubbles, date pills and composer;
   verify against reference screenshots.
3. Right panel: profile, actions, shared media, members.
4. Settings: align dialogs, tabs and rows with Telegram Desktop.
5. Remove remaining legacy `login-settings.css` login rules after the new login
   is pixel-stable.
