import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Message, MessageMedia } from "../../types";
import { Button, Dialog, Icon } from "../../ui";
import { useChromeAnimationLevel } from "./useAnimationLevel";
import "./pinned-k.css";

/**
 * Pinned-message plate payload (Web K `topbar.pinnedMessage.pinnedMessages`):
 * the pin the plate shows, the total pinned count for the "#N" counter and the
 * dashed multiple-pin border, the newest pinned id (hidden-bar persistence) and
 * whether the current account may pin/unpin.
 */
export interface PinnedMessageInfo {
  message: Message;
  /** Total number of pinned messages; 1 when unknown. */
  count?: number;
  /** Newest pinned message id (the message id when unknown). */
  maxId?: number;
  /** Whether the current account may pin/unpin in this chat. */
  canPin?: boolean;
  /** Position of the displayed pin from the newest one (0 = newest). */
  pinnedIndex?: number;
}

interface PinnedMessageBarProps {
  /** Multi-pin payload; preferred over the legacy flat props below. */
  info?: PinnedMessageInfo;
  /** Legacy single-message payload (kept so older call sites compile). */
  message?: Message;
  /** Legacy author label; Web K shows no sender prefix in this plate. */
  sender?: string;
  count?: number;
  maxId?: number;
  canPin?: boolean;
  pinnedIndex?: number;
  /** Enables the per-chat "hidden until a newer pin" localStorage memory. */
  chatId?: string;
  onJump: () => void;
  /** Unpins the displayed message (messages.updatePinnedMessage unpin:true). */
  onUnpinMessage?: (messageID: number) => void | Promise<void>;
  /** Hides the bar until a newer message is pinned (tweb `peer_pinned_hidden`). */
  onHidePinned?: () => void;
  /** Legacy: unpin every pinned message (old ChatView wiring). */
  onUnpin?: () => void | Promise<void>;
  /** Legacy: hide the bar through the parent's local state. */
  onDismiss?: () => void;
  /** Opens the pinned-messages list (P2 page; item is disabled without it). */
  onOpenPinnedList?: () => void;
}

/** localStorage map: chatId -> newest pinned id when the user hid the bar. */
const HIDDEN_STORAGE_KEY = "tgdesk.pinnedBarHidden";

function readHiddenMax(chatId: string): number {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw) as Record<string, number>;
    return Number(parsed[chatId]) || 0;
  } catch {
    return 0;
  }
}

function writeHiddenMax(chatId: string, maxId: number): void {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    parsed[chatId] = maxId;
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // A storage failure only loses the hidden memory; never the chat.
  }
}

function clearHiddenMax(chatId: string): void {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Record<string, number>;
    delete parsed[chatId];
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

/** Web K caps the preview text at 100 characters and keeps it on one line. */
const PREVIEW_MAX_CHARS = 100;

function truncatePreview(text: string): string {
  const singleLine = text.replace(/\s*\n+\s*/g, " ").trim();
  const chars = Array.from(singleLine);
  return chars.length > PREVIEW_MAX_CHARS
    ? `${chars.slice(0, PREVIEW_MAX_CHARS).join("")}…`
    : singleLine;
}

type PinnedPreview = { text: string; media?: MessageMedia };

/**
 * The plate's rich preview, ported from tweb `wrapReplyDivAndCaption` +
 * `messageForReply.ts:109-267,387-397`: a media label ("Album", "Photo",
 * "Voice message", ...) then ", " then the 100-character text. Stickers clear
 * the text and show their emoji instead.
 */
function buildPreview(message: Message, t: TFunction): PinnedPreview {
  const media = message.media;
  const parts: string[] = [];
  let text = message.text ?? "";
  let showMedia = false;

  if (message.groupedId) {
    parts.push(t("chat.attachAlbum"));
    showMedia = true;
  } else if (media) {
    switch (media.kind) {
      case "photo":
        parts.push(t("chat.attachPhoto"));
        showMedia = true;
        break;
      case "video":
        parts.push(t("chat.attachVideo"));
        showMedia = true;
        break;
      case "voice":
        parts.push(t("chat.attachAudio"));
        break;
      case "sticker": {
        const emoji = media.emoji?.trim();
        parts.push(t("chat.attachSticker"));
        if (emoji) {
          parts.unshift(emoji);
        }
        text = "";
        showMedia = true;
        break;
      }
      case "animation":
        parts.push(t("chat.attachGif"));
        showMedia = true;
        break;
      case "video_note":
        parts.push(t("chat.attachVideo"));
        break;
      case "audio": {
        const names = [media.title, media.performer].filter(Boolean) as string[];
        parts.push(names.length ? names.join(" - ") : media.name);
        break;
      }
      case "file":
        parts.push(media.name || t("chat.pinnedFallback"));
        break;
      case "webpage":
        parts.push(media.title || media.siteName || text);
        text = "";
        break;
      default:
        parts.push(media.name || text);
        text = "";
        break;
    }
  } else if (message.service) {
    parts.push(message.service);
  }

  const preview = text ? truncatePreview(text) : "";
  const composed = [...parts, preview].filter(Boolean).join(", ");
  return {
    text: composed || t("chat.pinnedFallback"),
    media: showMedia && media && hasThumb(media) ? media : undefined,
  };
}

function hasThumb(media: MessageMedia): boolean {
  return Boolean(media.thumbUrl || media.photoUrl || media.placeholderUrl);
}

function thumbUrl(media: MessageMedia): string {
  return media.thumbUrl || media.placeholderUrl || media.photoUrl || "";
}

/** tweb `pinnedMessageBorder.ts` geometry (3 px wide, 2 px gaps). */
const BORDER_ONE = 40;
const BORDER_GAP = 2;

function borderBarHeight(count: number): number {
  if (count <= 1) return BORDER_ONE;
  if (count === 2) return 19;
  if (count === 3) return 12;
  return 10;
}

function borderTrackHeight(count: number, barHeight: number): number {
  return count <= 3 ? BORDER_ONE : barHeight * count + BORDER_GAP * (count - 1);
}

function borderMarkY(index: number, count: number, barHeight: number): number {
  if (count === 2) return index === 0 ? 0 : barHeight + BORDER_GAP;
  if (count === 3) {
    if (index === 0) return 0;
    if (index === 1) return barHeight + BORDER_GAP;
    return barHeight * 2 + BORDER_GAP * 2 + 1;
  }
  return (barHeight + BORDER_GAP) * index;
}

function borderTrackY(index: number, count: number, barHeight: number, trackHeight: number): number {
  if (count <= 3) return 0;
  if (index <= 1) return 0;
  if (index >= count - 2) return trackHeight - BORDER_ONE;
  return (index - 2) * barHeight + index * BORDER_GAP;
}

/** The 3 px primary border: solid for one pin, dashed track + mark for many. */
function PinnedBorder({ count, index }: { count: number; index: number }) {
  const clipId = `pinned-clip-${useId().replace(/[:]/g, "")}`;
  if (count <= 1) {
    return (
      <div className="pinned-message-border">
        <div className="pinned-message-border-wrapper-1" />
      </div>
    );
  }

  const barHeight = borderBarHeight(count);
  const trackHeight = borderTrackHeight(count, barHeight);
  const markY = borderMarkY(index, count, barHeight);
  const trackY = borderTrackY(index, count, barHeight, trackHeight);
  const radius = 1.5;
  const rect = (x: number, y: number, width: number, height: number) =>
    `M${x},${y + radius}a${radius},${radius},0,0,1,${width},0v${height - 2 * radius}a${radius},${radius},0,0,1,${-width},0Z`;
  const path = Array.from({ length: count }, (_, i) =>
    rect(0, (barHeight + BORDER_GAP) * i - trackY, 3, barHeight),
  ).join("");

  const maskTop = count > 4 && index >= count - 2;
  const maskBottom = count > 4 && index <= 1;
  const maskBoth = count > 4 && !maskTop && !maskBottom;

  return (
    <div
      className={[
        "pinned-message-border",
        maskTop || maskBottom || maskBoth ? "pinned-message-border-mask" : "",
        maskTop || maskBoth ? "mask-top" : "",
        maskBottom || maskBoth ? "mask-bottom" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <svg width={0} height={0} aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>
      </svg>
      <div
        className="pinned-message-border-wrapper"
        style={{ clipPath: `url(#${clipId})`, height: `${trackHeight}px` }}
      >
        <div
          className="pinned-message-border-mark"
          style={{ height: `${barHeight}px`, transform: `translateY(${markY}px)` }}
        />
      </div>
    </div>
  );
}

/**
 * Telegram Web K pinned-message plate (`components/chat/pinnedMessage.tsx`,
 * `_chatPinned.scss`). It floats in the 696 lane 8 px under the topbar inside
 * the `.k-topbar-plates` stack: a 48 px plate, a 44 px body with an 8 % accent
 * hover tint, a primary 3 px pin border, the accent "Pinned Message" title with
 * an optional "#N" counter, a one-line rich preview with a 40×40 media thumb,
 * a 40×40 pin menu and the single 40×40 X.
 */
export function PinnedMessageBar({
  info,
  message: legacyMessage,
  sender: _sender,
  count: legacyCount,
  maxId: legacyMaxId,
  canPin: legacyCanPin,
  pinnedIndex: legacyIndex,
  chatId,
  onJump,
  onUnpinMessage,
  onHidePinned,
  onUnpin,
  onDismiss,
  onOpenPinnedList,
}: PinnedMessageBarProps) {
  const { t } = useTranslation();
  const message = info?.message ?? legacyMessage;
  const count = Math.max(1, info?.count ?? legacyCount ?? 1);
  const maxId = info?.maxId ?? legacyMaxId ?? message?.id ?? 0;
  const canPin = info?.canPin ?? legacyCanPin ?? true;
  const pinnedIndex = Math.max(0, info?.pinnedIndex ?? legacyIndex ?? 0);
  const [hiddenMax, setHiddenMax] = useState(0);
  const [confirm, setConfirm] = useState<null | "unpin" | "hide">(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const animationLevel = useChromeAnimationLevel();

  // Hidden-until-a-newer-pin memory, per chat (tweb stores
  // `appState.hiddenPinnedMessages[key] = maxId`). Without a chatId the parent
  // keeps owning visibility through onDismiss, exactly like before.
  useEffect(() => {
    setHiddenMax(chatId ? readHiddenMax(chatId) : 0);
  }, [chatId]);

  useEffect(() => {
    if (!chatId || hiddenMax <= 0 || maxId <= 0) {
      return;
    }
    // A pin newer than the hidden one clears the memory and reveals the bar.
    if (maxId > hiddenMax) {
      clearHiddenMax(chatId);
      setHiddenMax(0);
    }
  }, [chatId, hiddenMax, maxId]);

  // Reserve the plate's floating height for the chat content
  // (tweb `topbar.setFloating` writes `--pinned-floating-height`; the bubbles
  // scroller reads it for its top padding). 48 plate + 8 gap.
  const hidden = Boolean(chatId) && hiddenMax > 0 && maxId > 0 && hiddenMax >= maxId;
  useEffect(() => {
    const pane = rootRef.current?.closest<HTMLElement>(".g-chat-pane");
    if (!pane) {
      return;
    }
    if (hidden) {
      pane.style.removeProperty("--pinned-floating-height");
      return;
    }
    pane.style.setProperty("--pinned-floating-height", "56px");
    return () => {
      pane.style.removeProperty("--pinned-floating-height");
    };
  }, [hidden]);

  const preview = useMemo(
    () => (message ? buildPreview(message, t) : { text: "" }),
    [message, t],
  );
  // Row roll on a pin switch (tweb AnimatedSuperRow, --pm-transition .2s); no
  // open animation: the plate's first paint is plain.
  const previousId = useRef<number | null>(null);
  const switched = previousId.current !== null && message?.id !== previousId.current;
  useEffect(() => {
    previousId.current = message?.id ?? null;
  }, [message?.id]);

  if (!message || hidden) {
    return null;
  }

  const media = preview.media;
  const isMedia = Boolean(media);
  const showCounter = count > 1 && pinnedIndex > 0;
  const counterValue = count - pinnedIndex;

  const closeDialog = () => setConfirm(null);

  const confirmUnpin = () => {
    setConfirm(null);
    if (onUnpinMessage) {
      void Promise.resolve(onUnpinMessage(message.id)).catch(() => undefined);
      return;
    }
    if (onUnpin) {
      void Promise.resolve(onUnpin()).catch(() => undefined);
    }
  };

  const confirmHide = () => {
    setConfirm(null);
    if (chatId && maxId > 0) {
      writeHiddenMax(chatId, maxId);
      setHiddenMax(maxId);
    }
    if (onHidePinned) {
      onHidePinned();
    } else {
      onDismiss?.();
    }
  };

  const requestClose = () => setConfirm(canPin ? "unpin" : "hide");

  const bodyClass = [
    "pinned-container-wrapper",
    "pinned-message-wrapper",
    "hover-primary-effect",
  ].join(" ");

  return (
    <>
      <div className="k-topbar-plates" ref={rootRef}>
        <div
          className={[
            "pinned-container",
            "pinned-message",
            count > 1 ? "is-many" : "",
            isMedia ? "is-media" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <button
                type="button"
                className="btn-icon pinned-message-menu"
                aria-label={t("chat.pinnedMessages")}
                title={t("chat.pinnedMessages")}
              >
                <Icon name="keep" size={24} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" sideOffset={6} className="f-menu-content">
              <DropdownMenu.Item
                className="f-menu-row"
                disabled={!onOpenPinnedList}
                onSelect={() => onOpenPinnedList?.()}
              >
                <Icon name="keep" size={16} />
                <span>{t("chat.pinnedMessages")}</span>
                {count > 1 ? (
                  <span className="k-pinned-menu-count">{count}</span>
                ) : null}
              </DropdownMenu.Item>
              {canPin ? (
                <DropdownMenu.Item
                  className="f-menu-row"
                  onSelect={() => setConfirm("unpin")}
                >
                  <Icon name="keep_off" size={16} />
                  <span>{t("chat.unpinMessage")}</span>
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className="f-menu-row"
                  onSelect={() => setConfirm("hide")}
                >
                  <Icon name="visibility_off" size={16} />
                  <span>{t("chat.hidePinned")}</span>
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Root>

          <div
            className={bodyClass}
            role="button"
            tabIndex={0}
            aria-label={`${t("chat.pinnedMessage")}: ${preview.text}`}
            onClick={onJump}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onJump();
              }
            }}
          >
            <PinnedBorder count={count} index={pinnedIndex} />
            <div className="pinned-container-content pinned-message-content">
              {media ? (
                <div className="pinned-message-media-container">
                  <img
                    className="pinned-message-media"
                    src={thumbUrl(media)}
                    alt=""
                    draggable={false}
                  />
                </div>
              ) : null}
              <div
                className={`pinned-container-title pinned-message-title${
                  switched && animationLevel > 0 ? " is-rolling" : ""
                }`}
              >
                <span className="pinned-message-title-text">{t("chat.pinnedMessage")}</span>
                {showCounter ? (
                  <span className="animated-counter">{counterValue}</span>
                ) : null}
              </div>
              <div
                className={`pinned-container-subtitle pinned-message-subtitle${
                  switched && animationLevel > 0 ? " is-rolling" : ""
                }`}
              >
                <div className="pinned-message-subtitle-row">{preview.text}</div>
              </div>
            </div>
          </div>

          <div className="pinned-message-action">
            <button
              type="button"
              className="btn-icon pinned-message-unpin"
              aria-label={canPin ? t("chat.unpinMessage") : t("chat.hidePinned")}
              title={canPin ? t("chat.unpinMessage") : t("chat.hidePinned")}
              onClick={(event) => {
                event.stopPropagation();
                requestClose();
              }}
            >
              <Icon name="close" size={24} />
            </button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirm === "unpin"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title={t("chat.unpinTitle")}
        description={t("chat.unpinText")}
        closeLabel={t("common.cancel")}
        width="380px"
      >
        <div className="f-dialog-actions">
          <Button variant="ghost" onClick={closeDialog}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={confirmUnpin}>
            {t("chat.unpinMessage")}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === "hide"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title={t("chat.hidePinned")}
        description={t("chat.hidePinnedDescription")}
        closeLabel={t("common.cancel")}
        width="380px"
      >
        <div className="f-dialog-actions">
          <Button variant="ghost" onClick={closeDialog}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirmHide}>{t("chat.hidePinnedAction")}</Button>
        </div>
      </Dialog>
    </>
  );
}
