import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat, ChatFolder } from "../../types";
import { chatMatchesFolder } from "../../data/folders";
import { KAppMenu, type KAppMenuMoreAction } from "./KAppMenu";
import { KArchiveMenu } from "./KArchiveMenu";
import { KNewMenu } from "./KNewMenu";
import { KAvatar } from "./KAvatar";
import { KChatRow } from "./KChatRow";
import { KFolderTabs, type KFolderTab } from "./KFolderTabs";
import { KIcon } from "./KIcon";
import { KScrollArea } from "./KScrollArea";
import { KSearchField } from "./KSearchField";
import { KSuperTabHost, type KSuperTabEntry } from "./KSuperTab";
import {
  archivePreview,
  archivedUnread,
  folderUnread,
  formatBadgeCount,
  totalUnread,
} from "./model";
import { useRipple } from "./useRipple";

interface KChatListProps {
  activeView: "chats" | "downloads";
  chats: Chat[];
  folders: ChatFolder[];
  selectedChatId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDownloadAll: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
  onToast: (message: string) => void;
  onChats: () => void;
  onDownloads: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onProfile?: () => void;
  onNewMessage?: () => void;
  /** Opens the Web K new-channel page in a sidebar super tab. */
  onNewChannel?: () => void;
  /** Opens the Web K new-group page in a sidebar super tab. */
  onNewGroup?: () => void;
  /** The super-tab stack rendered over the chat list (settings, new chat). */
  superTabStack: KSuperTabEntry[];
  /** tweb main-menu state: the night-mode toggle and the animation level. */
  nightMode: boolean;
  onToggleNightMode: () => void;
  animationLevel: number;
  onCycleAnimations: () => void;
  onMoreAction: (action: KAppMenuMoreAction) => void;
  /** Web K peer-colour gradient behind the account avatar in the main menu. */
  accountAvatarBackground?: string;
  activeDownloads: number;
  accountName: string;
  accountInitials?: string;
  accountColor?: string;
  accountPhoto?: string;
  accountUsername?: string;
  accountPhone?: string;
  loading?: boolean;
  failed?: boolean;
}

/**
 * The Web K left column: header (burger + search), the folder chip strip, the
 * chat list (archive row included) and the new-message corner button.
 */
export function KChatList({
  activeView,
  chats,
  folders,
  selectedChatId,
  query,
  onQueryChange,
  onSelectChat,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onMarkAllRead,
  onDownloadAll,
  onToggleArchive,
  onToast,
  onChats,
  onDownloads,
  onSettings,
  onLogout,
  onProfile,
  onNewMessage,
  onNewChannel,
  onNewGroup,
  superTabStack,
  nightMode,
  onToggleNightMode,
  animationLevel,
  onCycleAnimations,
  onMoreAction,
  accountAvatarBackground,
  activeDownloads,
  accountName,
  accountInitials,
  accountColor,
  accountPhoto,
  accountUsername,
  accountPhone,
  loading,
  failed,
}: KChatListProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveRowVisible, setArchiveRowVisible] = useState(() => {
    try {
      return localStorage.getItem("tgdesk.k.showArchiveInChatList") !== "0";
    } catch {
      return true;
    }
  });
  const burgerRipple = useRipple<HTMLButtonElement>();
  const sliderRef = useRef<HTMLDivElement>(null);
  const mainTabRef = useRef<HTMLDivElement>(null);
  const archiveTabRef = useRef<HTMLDivElement>(null);
  const archiveOpenRef = useRef(false);

  const toggleArchiveRow = () => {
    setArchiveRowVisible((current) => {
      const next = !current;
      try {
        localStorage.setItem(
          "tgdesk.k.showArchiveInChatList",
          next ? "1" : "0",
        );
      } catch {
        // Quota/privacy-mode failures only cost the next launch's default.
      }
      return next;
    });
  };

  // The sidebar is a slider: the archived-chats screen is a second tab that
  // slides over the chat list, exactly like tweb's SliderSuperTab +
  // TransitionSlider('navigation', 250ms): the leaving screen moves 25% towards
  // the start and dims to 80%, the entering one comes in from the full width.
  useLayoutEffect(() => {
    const mainEl = mainTabRef.current;
    if (!mainEl) return;
    mainEl.classList.add("active");
  }, []);

  useLayoutEffect(() => {
    const container = sliderRef.current;
    const mainEl = mainTabRef.current;
    const archiveEl = archiveTabRef.current;
    if (!container || !mainEl || !archiveEl) return;
    const wasOpen = archiveOpenRef.current;
    if (wasOpen === archiveOpen) return;
    archiveOpenRef.current = archiveOpen;

    const forward = archiveOpen;
    const fromEl = forward ? mainEl : archiveEl;
    const toEl = forward ? archiveEl : mainEl;
    const width = fromEl.getBoundingClientRect().width;

    container.classList.add("animating");
    container.classList.toggle("backwards", !forward);
    fromEl.classList.remove("to");
    fromEl.classList.add("from");

    const elements = forward ? [fromEl, toEl] : [toEl, fromEl];
    elements[0].style.filter = "brightness(80%)";
    elements[0].style.transform = `translate3d(${-width * 0.25}px, 0, 0)`;
    elements[1].style.transform = `translate3d(${width}px, 0, 0)`;

    toEl.classList.add("active");
    void container.offsetWidth; // reflow
    toEl.style.transform = "";
    toEl.style.filter = "";

    let finished = false;
    let timer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      fromEl.removeEventListener("transitionend", onEnd);
      fromEl.classList.remove("active", "from");
      fromEl.style.transform = "";
      fromEl.style.filter = "";
      container.classList.remove("animating", "backwards");
      toEl.classList.remove("to");
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === fromEl && event.propertyName === "transform") {
        finish();
      }
    };
    fromEl.addEventListener("transitionend", onEnd);
    timer = window.setTimeout(finish, 420);
    return finish;
  }, [archiveOpen]);

  useEffect(() => {
    if (!archiveOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An open menu takes the first Escape (it closes itself); only the next
      // one leaves the archived-chats tab.
      if (document.querySelector('[role="menu"][data-state="open"]')) return;
      setArchiveOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [archiveOpen]);

  useEffect(() => {
    if (folders.length === 0 && filter !== "all") {
      setFilter("all");
    }
  }, [folders.length, filter]);

  const normalChats = useMemo(() => chats.filter((chat) => !chat.archived), [chats]);
  const archivedChats = useMemo(() => chats.filter((chat) => chat.archived), [chats]);

  const selectedFolder =
    filter.startsWith("folder:")
      ? folders.find((folder) => `folder:${folder.id}` === filter)
      : undefined;

  const folderChats = useMemo(() => {
    if (!selectedFolder) return normalChats;
    // Telegram folders include archived chats unless the folder turns that off
    // (dialogFilter.exclude_archived); the rule lives in chatMatchesFolder.
    return chats.filter((chat) => chatMatchesFolder(selectedFolder, chat));
  }, [chats, normalChats, selectedFolder]);

  const needle = query.trim().toLowerCase();
  const visibleChats = useMemo(() => {
    // Web K's sidebar search looks across every chat, not just the chosen
    // folder, so typing in the field must escape the folder filter.
    if (!needle) return folderChats;
    return normalChats.filter((chat) =>
      [chat.title, chat.preview, chat.username ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [folderChats, needle, normalChats]);

  const tabs: KFolderTab[] = useMemo(() => {
    const all = totalUnread(normalChats);
    return [
      {
        id: "all",
        label: t("sidebar.all"),
        unread: all.count,
        muted: all.muted,
      },
      ...folders.map((folder) => {
        // Chips count the folder's unread chats, archived ones included when the
        // folder does not exclude them (tweb stores/folders.ts + dialogs.ts).
        const unread = folderUnread(folder, chats);
        return {
          id: `folder:${folder.id}`,
          label: `${folder.emoticon ? `${folder.emoticon} ` : ""}${folder.title}`,
          unread: unread.count,
          muted: unread.muted,
        };
      }),
    ];
  }, [folders, chats, normalChats, t]);

  // The folder strip is part of the shell — the "All" chip is always there in
  // the reference, even before (or without) a folder list, so a failed folder
  // fetch can never leave the list without its chips.
  const showTabs = !needle;
  const overlayHeight = showTabs ? 64 : 0;
  const showArchiveRow =
    !needle && filter === "all" && archivedChats.length > 0 && archiveRowVisible;
  const archiveUnreadCount = archivedUnread(archivedChats);
  const archivePreviewItems = useMemo(
    () => archivePreview(archivedChats),
    [archivedChats],
  );

  const emptyText = failed
    ? t("chat.loadChatsFailed")
    : needle
      ? t("sidebar.noMatches", { query })
      : selectedFolder
        ? t("sidebar.emptyFolder")
        : t("chat.noChats");

  const listRows = showArchiveRow ? (
    <>
      <ArchiveRow
        title={t("sidebar.archiveTitle")}
        preview={archivePreviewItems}
        unread={archiveUnreadCount}
        onClick={() => setArchiveOpen(true)}
      />
      {visibleChats.map((chat) => (
        <KChatRow
          key={chat.id}
          chat={chat}
          active={activeView === "chats" && chat.id === selectedChatId}
          onSelect={onSelectChat}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onMarkRead={onMarkRead}
          onDownloadAll={onDownloadAll}
          onToggleArchive={onToggleArchive}
          onToast={onToast}
        />
      ))}
    </>
  ) : (
    visibleChats.map((chat) => (
      <KChatRow
        key={chat.id}
        chat={chat}
        active={activeView === "chats" && chat.id === selectedChatId}
        onSelect={onSelectChat}
        onTogglePin={onTogglePin}
        onToggleMute={onToggleMute}
        onMarkRead={onMarkRead}
        onDownloadAll={onDownloadAll}
        onToggleArchive={onToggleArchive}
        onToast={onToast}
      />
    ))
  );

  return (
    <div
      id="column-left"
      className="tabs-tab chatlist-container sidebar sidebar-left main-column sidebar-left-common active"
      role="navigation"
      aria-label={t("sidebar.chats")}
    >
      <div
        ref={sliderRef}
        className="sidebar-slider tabs-container"
        data-animation="navigation"
      >
        <div ref={mainTabRef} className="tabs-tab sidebar-slider-item item-main">
          <div className="sidebar-header main-search-sidebar-header can-have-forum">
            <KAppMenu
              accountName={accountName}
              accountInitials={accountInitials}
              accountPhoto={accountPhoto}
              accountAvatarBackground={accountAvatarBackground}
              archivedCount={archivedUnread(archivedChats)}
              nightMode={nightMode}
              onToggleNightMode={onToggleNightMode}
              animationLevel={animationLevel}
              onCycleAnimations={onCycleAnimations}
              onArchive={() => setArchiveOpen(true)}
              onSaved={() => {
                const saved = chats.find((chat) => chat.saved);
                if (saved) onSelectChat(saved.id);
              }}
              onDownloads={onDownloads}
              onSettings={onSettings}
              onMoreAction={onMoreAction}
              onToast={onToast}
              trigger={
                <button
                  ref={burgerRipple.ref}
                  type="button"
                  className="sidebar-header__btn-container left-sidebar-burger"
                  aria-label={t("common.mainNavigation")}
                >
                  <span className="animated-menu-icon" aria-hidden="true" />
                </button>
              }
            />
            <KSearchField
              value={query}
              onChange={onQueryChange}
              placeholder={t("sidebar.searchPlaceholder")}
            />
          </div>

          <div className="sidebar-content transition zoom-fade can-have-forum">
            <div className="transition-item active" id="chatlist-container">
              <div
                className="tabs-container"
                id="folders-container"
                style={
                  {
                    "--chatlist-overlay-height": `${overlayHeight}px`,
                  } as React.CSSProperties
                }
              >
                {showTabs ? (
                  <KFolderTabs
                    tabs={tabs}
                    active={filter}
                    onChange={(id) => {
                      onChats();
                      setFilter(id);
                    }}
                  />
                ) : null}
                <KScrollArea className="chatlist-scroll">
                  {loading && visibleChats.length === 0 ? (
                    <ul className="chatlist" aria-busy="true">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <li
                          className="row row-with-padding row-big chatlist-chat chatlist-chat-bigger"
                          key={index}
                          aria-hidden="true"
                        >
                          <div className="row-row row-title-row">
                            <div className="row-title">
                              <span
                                className="k-skeleton-line"
                                style={{ width: `${40 + ((index * 13) % 30)}%` }}
                              />
                            </div>
                          </div>
                          <div className="row-row row-subtitle-row">
                            <div className="row-subtitle">
                              <span
                                className="k-skeleton-line"
                                style={{ width: `${65 + ((index * 7) % 25)}%` }}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : listRows && visibleChats.length > 0 ? (
                    <ul className="chatlist" aria-label={t("sidebar.chats")}>
                      {listRows}
                    </ul>
                  ) : showArchiveRow ? (
                    <ul className="chatlist" aria-label={t("sidebar.chats")}>
                      {listRows}
                    </ul>
                  ) : (
                    <div className="k-chatlist-empty">{emptyText}</div>
                  )}
                </KScrollArea>
              </div>
            </div>
          </div>

          <KNewMenu
            onCreate={(kind) => {
              if (kind === "channel") {
                onNewChannel?.();
                return;
              }
              if (kind === "group") {
                onNewGroup?.();
                return;
              }
              onChats();
              onToast(t("kMenu.comingSoon"));
            }}
          />
        </div>

        {/* The archived-chats screen: a SliderSuperTab of its own (tweb
            archivedTab.tsx) — own header with the back button, title and the
            three-dot menu, then the archived dialog list. */}
        <div
          ref={archiveTabRef}
          className="tabs-tab sidebar-slider-item item-secondary"
          id="chats-archived-container"
          aria-hidden={!archiveOpen}
        >
          <div className="sidebar-header can-have-forum">
            <button
              type="button"
              className="btn-icon sidebar-close-button"
              aria-label={t("sidebar.backToChats")}
              onClick={() => setArchiveOpen(false)}
            >
              <KIcon name="left" className="button-icon" />
            </button>
            <div className="sidebar-header__title">
              {t("sidebar.archiveTitle")}
            </div>
            <KArchiveMenu
              archiveRowVisible={archiveRowVisible}
              onMarkAllRead={onMarkAllRead}
              onToggleArchiveRow={toggleArchiveRow}
            />
          </div>
          <div className="sidebar-content can-have-forum">
            <div className="transition-item active" id="chats-archived-list">
              <KScrollArea className="chatlist-scroll" style={{ paddingTop: 0 }}>
                <ul className="chatlist" aria-label={t("sidebar.archiveTitle")}>
                  {archivedChats.map((chat) => (
                    <KChatRow
                      key={chat.id}
                      chat={chat}
                      active={activeView === "chats" && chat.id === selectedChatId}
                      onSelect={(id) => {
                        // Selecting a chat leaves the tab, as in webk.
                        setArchiveOpen(false);
                        onSelectChat(id);
                      }}
                      onTogglePin={onTogglePin}
                      onToggleMute={onToggleMute}
                      onMarkRead={onMarkRead}
                      onDownloadAll={onDownloadAll}
                      onToggleArchive={onToggleArchive}
                      onToast={onToast}
                    />
                  ))}
                </ul>
              </KScrollArea>
            </div>
          </div>
        </div>

        {/* Super tabs (Settings, new channel/group) stack over the chat list
            with tweb's navigation slide. */}
        <KSuperTabHost stack={superTabStack} />
      </div>
    </div>
  );
}

function ArchiveRow({
  title,
  preview,
  unread,
  onClick,
}: {
  title: string;
  preview: ReturnType<typeof archivePreview>;
  unread: number;
  onClick: () => void;
}) {
  const ripple = useRipple<HTMLAnchorElement>();
  return (
    <a
      ref={ripple.ref}
      className="row no-wrap row-with-padding row-clickable hover-effect row-big chatlist-chat chatlist-chat-bigger archive-dialog"
      href="#archive"
      role="link"
      draggable={false}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      <div className="row-row row-title-row">
        <span className="archive-title">{title}</span>
      </div>
      <div className="row-row row-subtitle-row">
        <div className="archive-subtitle">
          {preview.map((item, index) => (
            <span key={`${item.title}-${index}`}>
              {index > 0 ? ", " : ""}
              <span
                className={item.unread ? "peer-title unread-peer-title" : "peer-title"}
              >
                {item.title}
              </span>
            </span>
          ))}
        </div>
        {unread > 0 ? (
          <span className="badge badge-22 badge-gray archive-unread-badge">
            {formatBadgeCount(unread)}
          </span>
        ) : null}
      </div>
      <KAvatar kind="archive" />
    </a>
  );
}
