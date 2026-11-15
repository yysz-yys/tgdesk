import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import {
  typingDescription,
  useChatTyping,
  type TypingDescription,
} from "../../lib/typingStore";
import { TypingDots } from "../chat/TypingDots";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Icon,
} from "../../ui";
import { KAvatar } from "./KAvatar";
import { KIcon, KVerifiedIcon } from "./KIcon";
import { formatBadgeCount } from "./model";
import { useRipple } from "./useRipple";

/** tweb `STATUS_CROSSFADE_DURATION` (`helpers/dom/crossfadeContent.ts:21`). */
const STATUS_CROSSFADE_DURATION = 120;

/**
 * Keeps the typing line mounted for the 120 ms it fades out, so the row can
 * crossfade back to the last message (`setDialogTyping`/`setDialogSubtitle` in
 * tweb `autonomousDialogList/base.ts` + `dialogElement.ts`). The appear side
 * runs in a layout effect so the indicator is in the DOM before the browser
 * paints the state change, exactly like tweb writing the new span synchronously.
 */
function useTypingPresence(visible: boolean): {
  mounted: boolean;
  leaving: boolean;
} {
  const [state, setState] = useState({ mounted: visible, leaving: false });
  const previous = useRef(visible);
  useLayoutEffect(() => {
    if (previous.current === visible) {
      return;
    }
    previous.current = visible;
    if (visible) {
      setState({ mounted: true, leaving: false });
      return;
    }
    setState({ mounted: true, leaving: true });
    const timer = window.setTimeout(
      () => setState({ mounted: false, leaving: false }),
      STATUS_CROSSFADE_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [visible]);
  return state;
}

interface KChatRowProps {
  chat: Chat;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDownloadAll: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
  onToast: (message: string) => void;
}

/**
 * One Web K conversation row: a 72px link with the title/status line, the
 * subtitle line and the absolutely-positioned 54px avatar (see tweb's
 * DialogElement + Row in dialogElement.ts / rowTsx.tsx).
 */
export function KChatRow({
  chat,
  active,
  onSelect,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onDownloadAll,
  onToggleArchive,
  onToast,
}: KChatRowProps) {
  const { t } = useTranslation();
  const ripple = useRipple<HTMLAnchorElement>();

  // Web K typing line (tweb `getPeerTyping` + `_chatlist.scss`): while at least
  // one user of this chat is typing it takes the last-message preview's place,
  // dots + localized wording ("Alice is typing", "2 others are typing", ...).
  // Bots and Saved Messages never type (`typingDescription` returns null).
  const typingEntries = useChatTyping(chat.id);
  const typing = typingDescription(
    typingEntries,
    chat.kind,
    Boolean(chat.bot || chat.saved),
  );
  const typingPresence = useTypingPresence(typing !== null);
  // The description that fades out during the 120 ms crossfade back.
  const lastTyping = useRef<TypingDescription | null>(null);
  if (typing) {
    lastTyping.current = typing;
  }
  const shownTyping = typing ?? lastTyping.current;
  const typingLabel = shownTyping
    ? shownTyping.options
      ? t(shownTyping.key, shownTyping.options)
      : t(shownTyping.key)
    : "";

  const checks = !chat.saved && chat.lastOut
    ? chat.lastChecks === "read"
      ? ("checks" as const)
      : ("check" as const)
    : null;
  // Web K prefixes a group's preview with its author ("Name: message", "You:
  // message" for your own); private chats and broadcast channels have none.
  const senderPrefix =
    chat.kind === "group"
      ? chat.lastOut
        ? `${t("chat.you")}: `
        : chat.lastSender
          ? `${chat.lastSender}: `
          : undefined
      : undefined;

  const copyLink = async () => {
    const link = chat.username
      ? `https://t.me/${chat.username.replace(/^@/, "")}`
      : `tg://openmessage?chat_id=${chat.id}`;
    try {
      await navigator.clipboard.writeText(link);
      onToast(t("chatMenu.copied"));
    } catch {
      onToast(link);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <a
          ref={ripple.ref}
          className={[
            "row no-wrap row-with-padding row-clickable hover-effect row-big chatlist-chat chatlist-chat-bigger",
            active ? "active" : "",
            chat.pinned ? "is-pinned" : "",
            chat.muted ? "is-muted" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          href={`#${chat.id}`}
          data-peer-id={chat.id}
          role="link"
          draggable={false}
          aria-current={active ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onSelect(chat.id);
          }}
        >
          <div className="row-row row-title-row dialog-title">
            <div className="row-title no-wrap user-title" dir="auto">
              <span
                className={
                  chat.verified ? "peer-title with-icons" : "peer-title"
                }
                dir="auto"
              >
                <span className="peer-title-inner">{chat.title}</span>
                {chat.verified ? <KVerifiedIcon /> : null}
              </span>
              {chat.muted ? (
                <KIcon name="nosound_filled" className="dialog-muted-icon" />
              ) : null}
            </div>
            <div className="row-title-right row-title-right-secondary dialog-title-details">
              {chat.pinned ? (
                <span className="dialog-time-pill">
                  <KIcon
                    name="pin_status_filled"
                    className="dialog-time-pill-pin"
                  />
                  <span className="message-time">{chat.time}</span>
                </span>
              ) : (
                <>
                  {checks ? (
                    <span className="message-status sending-status">
                      <KIcon name={checks} />
                    </span>
                  ) : null}
                  <span className="message-time">{chat.time}</span>
                </>
              )}
            </div>
          </div>
          <div className="row-row row-subtitle-row dialog-subtitle">
            <div
              className={
                typing
                  ? "row-subtitle no-wrap dialog-subtitle-parts user-typing"
                  : "row-subtitle no-wrap dialog-subtitle-parts"
              }
              dir="auto"
            >
              {senderPrefix ? (
                <span className="dialog-subtitle-span" dir="auto">
                  {senderPrefix}
                </span>
              ) : null}
              <span
                className="dialog-subtitle-span dialog-subtitle-span-last"
                dir="auto"
              >
                {chat.preview}
              </span>
              {typingPresence.mounted && shownTyping ? (
                <span
                  className={
                    typingPresence.leaving
                      ? "k-chatlist-typing is-leaving"
                      : "k-chatlist-typing"
                  }
                >
                  <span
                    className="online peer-typing-container"
                    aria-label={typingLabel}
                  >
                    <TypingDots />
                    <span className="peer-typing-description" aria-hidden="true">
                      {typingLabel}
                    </span>
                  </span>
                </span>
              ) : null}
            </div>
            {/* tweb keeps the unread badge on the selected row too; the active
                row paints it white (_chatlist.scss:439-444). */}
            {chat.unread ? (
              <div className="dialog-subtitle-badge badge badge-22 dialog-subtitle-badge-unread unread">
                {formatBadgeCount(chat.unread)}
              </div>
            ) : null}
          </div>
          <KAvatar chat={chat} />
        </a>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          icon={<Icon name="keep" size={16} />}
          onSelect={() => onTogglePin(chat.id)}
        >
          {chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="notifications_off" size={16} />}
          onSelect={() => onToggleMute(chat.id)}
        >
          {chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="done_all" size={16} />}
          onSelect={() => onMarkRead(chat.id)}
        >
          {t("chatMenu.markRead")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Icon name="archive" size={16} />}
          onSelect={() => onToggleArchive(chat)}
        >
          {chat.archived ? t("chatMenu.unarchive") : t("chatMenu.archive")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Icon name="download" size={16} />}
          onSelect={() => onDownloadAll(chat)}
        >
          {t("chatMenu.downloadAll")}
        </ContextMenuItem>
        <ContextMenuItem icon={<Icon name="link" size={16} />} onSelect={copyLink}>
          {t("chatMenu.copyLink")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
