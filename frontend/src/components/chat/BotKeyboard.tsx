import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Message, MessageButton } from "../../types";
import { openTelegramLink } from "../../lib/telegramLinks";
import "./bot-keyboard.css";

/**
 * Telegram Web K inline keyboard (reply markup) for bot messages.
 *
 * Rows come from the backend (`button.row`, 0-based) and are rendered as flex
 * rows of equal-width cells with a 2px hairline gap. Button `style` values
 * (`primary` | `danger` | `success`) tint the cell; everything else uses the
 * bubble surface tint. The old flat single-row list (and its "not supported"
 * toast for web apps) is replaced by per-kind behaviour:
 *
 * - `url`      → Browser.OpenURL (same path as text links)
 * - `copy`     → clipboard + toast
 * - `callback` → `onBotCallback` (Lead wires AppService.SendBotCallback)
 * - `webview` / `webview_simple` / unknown with url → `onBotWebView`
 *
 * The callback spinner lives here: while a press is in flight every cell of the
 * message is disabled and the pressed cell shows a spinner. The pending state is
 * cleared when the message/keyboard changes (a bot edit replaces the message
 * object), when a promise returned by the handler settles, or after a 10 s
 * safety timeout (Telegram's answer callback timeout is ~10 s).
 */

const CALLBACK_SAFETY_TIMEOUT_MS = 10_000;

type ButtonTone = "primary" | "danger" | "success";

interface KeyboardRow {
  key: string;
  buttons: MessageButton[];
}

interface PendingPress {
  messageId: number;
  key: string;
}

export interface BotKeyboardProps {
  message: Message;
  onBotCallback?: (message: Message, button: MessageButton) => void;
  onBotWebView?: (message: Message, button: MessageButton) => void;
  onToast: (message: string) => void;
  /**
   * True when the keyboard is the last element inside the bubble. The last row
   * then gets the bubble's outer bottom radii (Telegram Web K rounds the
   * keyboard into the bubble tail instead of keeping 6px cells).
   */
  lastElement?: boolean;
  /** Bottom-start radius of the bubble in px (data-last / grouping aware). */
  bottomStartRadius?: number;
  /** Bottom-end radius of the bubble in px (data-last / grouping aware). */
  bottomEndRadius?: number;
}

function buttonTone(button: MessageButton): ButtonTone | undefined {
  return button.style;
}

/**
 * Groups buttons into Telegram keyboard rows. Buttons without a row index
 * (cached/optimistic messages from before the DTO carried `row`) each get their
 * own full-width row, which keeps them usable instead of collapsing to a list.
 */
function buildRows(buttons: MessageButton[]): KeyboardRow[] {
  const rows = new Map<number, MessageButton[]>();
  buttons.forEach((button, index) => {
    const rowIndex =
      typeof button.row === "number" && Number.isFinite(button.row) && button.row >= 0
        ? Math.floor(button.row)
        : index;
    const existing = rows.get(rowIndex);
    if (existing) {
      existing.push(button);
    } else {
      rows.set(rowIndex, [button]);
    }
  });
  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([row, rowButtons]) => ({ key: `row-${row}`, buttons: rowButtons }));
}

/** Content signature: a bot edit replaces the message, which must clear pending. */
function keyboardSignature(buttons: MessageButton[]): string {
  return JSON.stringify(
    buttons.map((button) => [
      button.text,
      button.kind ?? "",
      button.url ?? "",
      button.data ?? "",
      button.row ?? null,
      button.style ?? "",
    ]),
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export function BotKeyboard({
  message,
  onBotCallback,
  onBotWebView,
  onToast,
  lastElement,
  bottomStartRadius = 15,
  bottomEndRadius = 15,
}: BotKeyboardProps) {
  const { t } = useTranslation();
  const buttons = useMemo(() => message.buttons ?? [], [message.buttons]);
  const rows = useMemo(() => buildRows(buttons), [buttons]);
  const signature = useMemo(() => keyboardSignature(buttons), [buttons]);
  const [pending, setPending] = useState<PendingPress | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const clearPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (mountedRef.current) {
      setPending(null);
    }
  }, []);

  // A bot edit replaces the message object: drop the spinner for the new keyboard.
  useEffect(() => {
    clearPending();
  }, [message.id, signature, clearPending]);

  const startPending = useCallback(
    (key: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      setPending({ messageId: message.id, key });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (mountedRef.current) {
          setPending(null);
        }
      }, CALLBACK_SAFETY_TIMEOUT_MS);
    },
    [message.id],
  );

  const trackResult = useCallback(
    (result: unknown) => {
      if (!isThenable(result)) {
        return;
      }
      void Promise.resolve(result).then(clearPending, clearPending);
    },
    [clearPending],
  );

  const copyButtonText = useCallback(
    (button: MessageButton) => {
      const value = button.data ?? button.text;
      void navigator.clipboard
        .writeText(value)
        .then(() => onToast(t("botButton.copied")))
        .catch(() => onToast(t("botButton.copyFailed")));
    },
    [onToast, t],
  );

  const runButton = useCallback(
    (button: MessageButton, key: string) => {
      const kind = button.kind;
      if (kind === "url") {
        if (button.url) {
          openTelegramLink(button.url);
        } else {
          onToast(t("chat.buttonUnavailable"));
        }
        return;
      }
      if (kind === "copy") {
        copyButtonText(button);
        return;
      }
      if (kind === "callback") {
        if (!onBotCallback) {
          onToast(t("botButton.unavailable"));
          return;
        }
        startPending(key);
        try {
          trackResult(onBotCallback(message, button));
        } catch {
          clearPending();
          onToast(t("botButton.callbackFailed"));
        }
        return;
      }
      // webview / webview_simple / anything unknown that carries a URL opens in
      // the mini-app wrapper; the Lead's handler decides full vs simple RPC.
      if (button.url) {
        if (!onBotWebView) {
          onToast(t("botButton.unavailable"));
          return;
        }
        try {
          const result = onBotWebView(message, button);
          if (isThenable(result)) {
            startPending(key);
            trackResult(result);
          }
        } catch {
          onToast(t("botButton.unavailable"));
        }
        return;
      }
      onToast(t("chat.buttonUnavailable"));
    },
    [clearPending, copyButtonText, onBotCallback, onBotWebView, onToast, startPending, t, trackResult],
  );

  if (rows.length === 0) {
    return null;
  }

  const style = {
    "--g-bot-keyboard-bottom-start": `${bottomStartRadius}px`,
    "--g-bot-keyboard-bottom-end": `${bottomEndRadius}px`,
  } as CSSProperties;

  const busy = pending !== null && pending.messageId === message.id;

  return (
    <div
      className="g-message-buttons g-bot-keyboard"
      data-last={lastElement || undefined}
      style={style}
    >
      {rows.map((row) => (
        <div className="g-message-buttons-row g-bot-keyboard-row" key={row.key}>
          {row.buttons.map((button, index) => {
            const key = `${row.key}-${index}`;
            const tone = buttonTone(button);
            const isPending = busy && pending?.key === key;
            return (
              <button
                type="button"
                key={key}
                className="g-message-button g-bot-keyboard-button"
                data-style={tone}
                data-first={index === 0 || undefined}
                data-last={index === row.buttons.length - 1 || undefined}
                data-pending={isPending || undefined}
                aria-busy={isPending || undefined}
                disabled={busy}
                title={button.text}
                onClick={() => runButton(button, key)}
              >
                {isPending ? (
                  <span
                    className="g-bot-button-spinner"
                    role="status"
                    aria-label={t("botButton.loading")}
                  />
                ) : null}
                <span className="g-bot-button-label">{button.text}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
