import { useMemo } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { formatUserStatus } from "../../data/telegram";
import { Icon } from "../../ui";
import { useChatTyping, typingDescription } from "../../lib/typingStore";
import { ChatAvatar } from "./ChatAvatar";
import { TypingIndicator } from "./TypingDots";
import "./topbar-k.css";

interface ChatHeaderProps {
  chat: Chat;
  infoOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResultCount: number;
  /** Saved Messages total (Telegram Web shows "N messages" as its subtitle). */
  savedMessagesCount?: number;
  /**
   * Members of a group/channel that are online right now (`channelFull`/
   * `chatFull.online_count`). Web K appends ", N online" to the subscriber line;
   * the current ChatDTO/profile does not expose it yet, so it is optional.
   */
  onlineCount?: number;
  onSearchQueryChange: (value: string) => void;
  onCloseSearch: () => void;
  onSearch: () => void;
  onDownloadAll: () => void;
  onInfo: () => void;
  onTogglePin?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onArchive?: (chat: Chat) => void;
}

/** Web K groups thousands with a no-break space (`numberThousandSplitter.ts`). */
function groupThousands(value: number): string {
  const digits = String(Math.max(0, Math.floor(value)));
  const parts = digits.split("");
  for (let index = parts.length - 3; index > 0; index -= 3) {
    parts.splice(index, 0, "\u00a0");
  }
  return parts.join("");
}

/**
 * Web K topbar (`components/chat/topbar.ts:128-304`, `_chatTopbar.scss`): a
 * 48 px floating surface plate in the 696 lane, radius 24, the same shadow as
 * the pinned stack. Avatar 40, title 16/24 medium + verified badge, subtitle
 * 14/20 secondary — accent while the peer is online or typing (the typing dots
 * come from the shared `typingStore` + `TypingDots`). Search and more are
 * 40×40 buttons with 24 px glyphs, 4 px apart. In search mode the avatar stays
 * and a 40 px / radius 21 input overlays the plate from 58 px in.
 */
export function ChatHeader({
  chat,
  infoOpen,
  searchOpen,
  searchQuery,
  searchResultCount,
  savedMessagesCount,
  onlineCount,
  onSearchQueryChange,
  onCloseSearch,
  onSearch,
  onDownloadAll,
  onInfo,
  onTogglePin,
  onMarkRead,
  onArchive,
}: ChatHeaderProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const typing = useChatTyping(chat.id);
  const typingInfo = typingDescription(typing, chat.kind, chat.bot);
  const typingActive = typingInfo !== null;

  const savedCountLabel =
    chat.saved && savedMessagesCount
      ? t("chat.messageCount", { formatted: groupThousands(savedMessagesCount) })
      : undefined;

  const { statusText, accent } = useMemo((): {
    statusText?: string;
    accent: boolean;
  } => {
    if (chat.kind === "private") {
      if (chat.saved) {
        return { statusText: savedCountLabel ?? t("chat.savedHint"), accent: false };
      }
      if (chat.bot) {
        return {
          statusText: chat.username ? `@${chat.username}` : t("rightPanel.bot"),
          accent: false,
        };
      }
      const presence = formatUserStatus(
        chat.online,
        chat.status,
        chat.lastSeen,
        t,
        language,
      );
      const online = Boolean(chat.online) || chat.status === "online";
      return { statusText: presence ?? t("chat.lastSeen"), accent: online };
    }

    // Groups and channels: "N subscribers"/"N members" plus ", M online" when
    // the server reports online members (Web K `getChatMembersString.ts`).
    const count = chat.memberCount ?? 0;
    let text: string;
    if (count > 0) {
      text = t(chat.kind === "channel" ? "chat.subscribers" : "chat.members", {
        count,
        formatted: groupThousands(count),
      });
    } else {
      text = chat.members ?? t(chat.kind === "channel" ? "chat.channel" : "chat.group");
    }
    if (onlineCount && onlineCount > 1) {
      text += `, ${t("chat.onlineCount", { count: groupThousands(onlineCount) })}`;
    }
    return { statusText: text, accent: false };
  }, [chat, language, onlineCount, savedCountLabel, t]);

  // Web K crossfades the status line over 120 ms when it changes
  // (`crossfadeContent.ts:21`); a keyed span restarts the CSS fade.
  const statusKey = typingActive ? "typing" : (statusText ?? "");

  return (
    <header className="f-chat-header k-topbar" data-searching={searchOpen || undefined}>
      <button
        type="button"
        className="f-peer k-topbar-peer"
        data-active={infoOpen || undefined}
        onClick={onInfo}
        aria-expanded={infoOpen}
        aria-label={`${chat.title}: ${t("rightPanel.chatInfo")}`}
      >
        <ChatAvatar chat={chat} size={40} />
        <span className="f-peer-copy k-topbar-peer-copy">
          <span className="f-peer-name k-topbar-title">
            <span className="f-peer-title-text">{chat.title}</span>
            {chat.verified ? (
              <Icon
                name="verified"
                size={16}
                className="f-peer-verified"
                label={t("chat.verified")}
              />
            ) : null}
          </span>
          <span
            className={
              accent || typingActive
                ? "k-topbar-status k-topbar-status-online"
                : "k-topbar-status"
            }
          >
            <span key={statusKey} className="k-topbar-status-inner">
              {typingActive ? (
                <TypingIndicator chatId={chat.id} kind={chat.kind} isBot={chat.bot} />
              ) : (
                statusText
              )}
            </span>
          </span>
        </span>
      </button>

      <div className="f-chat-actions k-topbar-utils">
        <button
          type="button"
          className="btn-icon k-topbar-action"
          aria-label={t("chat.searchInChat")}
          title={t("chat.searchInChat")}
          onClick={onSearch}
        >
          <Icon name="search" size={24} />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button
              type="button"
              className="btn-icon k-topbar-action"
              aria-label={t("chat.chatMenu")}
              title={t("chat.chatMenu")}
            >
              <Icon name="more_vert" size={24} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} className="f-menu-content">
            {onTogglePin ? (
              <DropdownMenu.Item className="f-menu-row" onSelect={() => onTogglePin(chat.id)}>
                <Icon name="keep" size={16} />
                <span>{chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}</span>
              </DropdownMenu.Item>
            ) : null}
            {onMarkRead ? (
              <DropdownMenu.Item
                className="f-menu-row"
                disabled={!chat.unread}
                onSelect={() => onMarkRead(chat.id)}
              >
                <Icon name="done_all" size={16} />
                <span>{t("chatMenu.markRead")}</span>
              </DropdownMenu.Item>
            ) : null}
            {onArchive ? (
              <DropdownMenu.Item className="f-menu-row" onSelect={() => onArchive(chat)}>
                <Icon name={chat.archived ? "unarchive" : "archive"} size={16} />
                <span>{chat.archived ? t("chatMenu.unarchive") : t("chatMenu.archive")}</span>
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Separator className="f-menu-separator" />
            <DropdownMenu.Item className="f-menu-row" onSelect={onDownloadAll}>
              <Icon name="download" size={16} />
              <span>{t("chat.downloadAll")}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {searchOpen ? (
        <div className="k-topbar-search">
          <div className="k-topbar-search-plate">
            <button
              type="button"
              className="btn-icon k-topbar-search-back"
              aria-label={t("chat.searchClose")}
              title={t("chat.searchClose")}
              onClick={onCloseSearch}
            >
              <Icon name="arrow_back" size={24} />
            </button>
            <input
              className="k-topbar-search-input"
              autoFocus
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={t("chat.searchLoadedPlaceholder")}
              aria-label={t("chat.searchLoadedPlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCloseSearch();
                }
              }}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                className="btn-icon k-topbar-search-clear"
                aria-label={t("common.clear")}
                title={t("common.clear")}
                onClick={() => onSearchQueryChange("")}
              >
                <Icon name="close" size={24} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Web K in-chat search footer (`topbarSearch.tsx:258-299`): a 48 px surface
 * bar with the result counter, the composer hidden while it is up (tweb
 * `.chat-search-footer + .chat-input { display: none }`). The Lead mounts it in
 * `ChatView` above the composer while `searchOpen` (see report).
 */
export function ChatSearchFooter({
  resultCount,
  className,
}: {
  resultCount: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`k-chat-search-footer${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      <span className="k-chat-search-footer-count">
        {t("chat.searchResultCount", { count: resultCount })}
      </span>
    </div>
  );
}
