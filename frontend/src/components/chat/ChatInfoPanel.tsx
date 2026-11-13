import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type {
  Chat,
  ChatInfo,
  ChatMember,
  ChatMembersPage,
  DownloadTask,
  Message,
  SharedMediaPage,
  SharedMediaSection,
} from "../../types";
import { Avatar, Button, Icon, IconButton, Spinner } from "../../ui";
import { chatColor, chatInitials } from "../../data/telegram";
import { ChatAvatar } from "./ChatAvatar";
import {
  AudioList,
  FileList,
  InfoEmpty,
  LinkList,
  MediaGrid,
} from "./ChatInfoSections";

interface ChatInfoPanelProps {
  chat: Chat;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onLoadChatInfo: (
    chatID: string,
    kind: Chat["kind"],
  ) => Promise<ChatInfo | null>;
  onLoadMembersPage: (
    chatID: string,
    offset: number,
  ) => Promise<ChatMembersPage>;
  onLoadSharedMedia: (
    chatID: string,
    section: SharedMediaSection,
    beforeID: number,
  ) => Promise<SharedMediaPage>;
  onOpenPhoto?: (message: Message) => void;
  onPlayVideo?: (message: Message) => void;
  downloads: DownloadTask[];
  onDownloadInline: (ids: number[]) => void;
  onOpenDownloaded: (task: DownloadTask) => void;
  onPauseDownload: (task: DownloadTask) => void;
  onResumeDownload: (task: DownloadTask) => void;
  onForwardMessage?: (message: Message) => void;
  onDeleteMessage?: (message: Message) => void;
  onForwardMessages?: (messages: Message[]) => void;
  onDeleteMessages?: (messages: Message[]) => void;
  onJumpToMessage?: (messageID: number) => void;
  liveVersion?: number;
  onToast: (message: string) => void;
}

type InfoTab = "members" | SharedMediaSection;

/** Telegram Web's Media tab can list photos and videos together or alone. */
type MediaFilter = "all" | "photos" | "videos";

interface SectionState {
  items: Message[];
  loading: boolean;
  loaded: boolean;
  failed: boolean;
  hasMore: boolean;
  nextBefore: number;
}

interface MembersState {
  items: ChatMember[];
  loading: boolean;
  loaded: boolean;
  failed: boolean;
  hasMore: boolean;
  nextOffset: number;
  total: number;
}

const SECTION_ORDER: SharedMediaSection[] = [
  "media",
  "files",
  "links",
  "music",
  "voice",
  "gifs",
];

const SECTION_LABELS: Record<SharedMediaSection, string> = {
  media: "rightPanel.media",
  photos: "rightPanel.photos",
  videos: "rightPanel.videos",
  files: "rightPanel.files",
  links: "rightPanel.links",
  music: "rightPanel.music",
  voice: "rightPanel.voice",
  gifs: "rightPanel.gifs",
};

const SECTION_EMPTY: Record<SharedMediaSection, string> = {
  media: "rightPanel.mediaEmpty",
  photos: "rightPanel.mediaEmpty",
  videos: "rightPanel.mediaEmpty",
  files: "rightPanel.filesEmpty",
  links: "rightPanel.linksEmpty",
  music: "rightPanel.musicEmpty",
  voice: "rightPanel.voiceEmpty",
  gifs: "rightPanel.gifsEmpty",
};

/** The concrete server filter behind the Media tab for the current selection. */
function mediaSectionKey(filter: MediaFilter): SharedMediaSection {
  return filter === "all" ? "media" : filter;
}

/** Distance from the bottom that starts the next page, like Telegram Web's 300px. */
const LOAD_MORE_THRESHOLD = 280;

function createSections(): Record<SharedMediaSection, SectionState> {
  return {
    media: emptySection(),
    photos: emptySection(),
    videos: emptySection(),
    files: emptySection(),
    links: emptySection(),
    music: emptySection(),
    voice: emptySection(),
    gifs: emptySection(),
  };
}

function emptySection(): SectionState {
  return {
    items: [],
    loading: false,
    loaded: false,
    failed: false,
    hasMore: false,
    nextBefore: 0,
  };
}

function createMembers(): MembersState {
  return {
    items: [],
    loading: false,
    loaded: false,
    failed: false,
    hasMore: false,
    nextOffset: 0,
    total: 0,
  };
}

function mergeMedia(current: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) {
    return current;
  }
  const known = new Set(current.map((message) => message.id));
  const next = current.slice();
  for (const message of incoming) {
    if (!known.has(message.id)) {
      known.add(message.id);
      next.push(message);
    }
  }
  return next;
}

function mergeMembers(current: ChatMember[], incoming: ChatMember[]): ChatMember[] {
  if (incoming.length === 0) {
    return current;
  }
  const known = new Set(current.map((member) => member.id));
  const next = current.slice();
  for (const member of incoming) {
    if (!known.has(member.id)) {
      known.add(member.id);
      next.push(member);
    }
  }
  return next;
}

/** Right-hand chat info pane, built like Telegram Web's profile column. */
export function ChatInfoPanel({
  chat,
  onClose,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onLoadChatInfo,
  onLoadMembersPage,
  onLoadSharedMedia,
  onOpenPhoto,
  onPlayVideo,
  downloads,
  onDownloadInline,
  onOpenDownloaded,
  onPauseDownload,
  onResumeDownload,
  onForwardMessage,
  onDeleteMessage,
  onForwardMessages,
  onDeleteMessages,
  onJumpToMessage,
  liveVersion,
  onToast,
}: ChatInfoPanelProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoFailed, setInfoFailed] = useState(false);
  const [active, setActive] = useState<InfoTab | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [selection, setSelection] = useState<Map<number, Message>>(new Map());
  const [sections, setSections] =
    useState<Record<SharedMediaSection, SectionState>>(createSections);
  const [members, setMembers] = useState<MembersState>(createMembers);
  const [reloadKey, setReloadKey] = useState(0);

  const sectionsRef = useRef(sections);
  const membersRef = useRef(members);
  const activeRef = useRef<InfoTab | null>(active);
  const mediaFilterRef = useRef<MediaFilter>(mediaFilter);
  const sectionLoadingRef = useRef<Partial<Record<SharedMediaSection, boolean>>>({});
  const membersLoadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    mediaFilterRef.current = mediaFilter;
  }, [mediaFilter]);

  // The Media tab swaps between the combined photo+video filter and each half,
  // exactly like Telegram Web's tickable Photos/Videos menu.
  const activeSection = useMemo<SharedMediaSection | null>(() => {
    if (!active || active === "members") {
      return null;
    }
    if (active === "media") {
      return mediaSectionKey(mediaFilter);
    }
    return active;
  }, [active, mediaFilter]);

  const selectedIds = useMemo(() => new Set(selection.keys()), [selection]);

  /** Latest local download task keyed by the message it belongs to. */
  const downloadsByMessage = useMemo(() => {
    const map = new Map<number, DownloadTask>();
    for (const task of downloads) {
      if (task.chatId === chat.id && task.messageId > 0) {
        map.set(task.messageId, task);
      }
    }
    return map;
  }, [chat.id, downloads]);

  const downloadableSection =
    activeSection !== null && activeSection !== "links";

  useEffect(() => {
    setDownloadedOnly(false);
  }, [chat.id]);
  const toggleSelect = useCallback((message: Message) => {
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(message.id)) {
        next.delete(message.id);
      } else {
        next.set(message.id, message);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelection(new Map());
  }, []);

  // Switching tabs or filters starts a fresh selection, like the web client.
  useEffect(() => {
    setSelection(new Map());
  }, [active, mediaFilter, chat.id]);

  const handleType = t(
    chat.kind === "private"
      ? "rightPanel.privateChat"
      : chat.kind === "channel"
        ? "rightPanel.channel"
        : "rightPanel.group",
  );
  const counts = useMemo(() => {
    const map = new Map<SharedMediaSection, number>();
    for (const count of info?.counts ?? []) {
      map.set(count.section, count.count);
    }
    return map;
  }, [info]);
  const photosCount = counts.get("photos") ?? 0;
  const videosCount = counts.get("videos") ?? 0;
  // Telegram Web lists only the enabled, non-empty halves ("N photos, M
  // videos"), but never leaves the subtitle empty.
  const mediaSubtitle = useMemo(() => {
    const enabled: Array<"photos" | "videos"> =
      mediaFilter === "all" ? ["photos", "videos"] : [mediaFilter];
    const values = { photos: photosCount, videos: videosCount };
    const nonEmpty = enabled.filter((key) => values[key] > 0);
    const shown = nonEmpty.length > 0 ? nonEmpty : enabled.slice(0, 1);
    return shown
      .map((key) =>
        t(
          key === "photos"
            ? "rightPanel.photosCount"
            : "rightPanel.videosCount",
          { count: values[key] },
        ),
      )
      .join(", ");
  }, [mediaFilter, photosCount, t, videosCount]);
  const subtitle =
    active === "media" && mediaSubtitle
      ? mediaSubtitle
      : chat.kind === "private"
        ? chat.online
          ? t("chat.online")
          : t("chat.lastSeen")
        : (chat.members ?? handleType);

  // One counters request per chat decides which tabs exist; each tab then loads
  // its own pages on demand instead of filtering the messages already in view.
  const loadInfo = useCallback(
    async (initial: boolean) => {
      if (initial) {
        setInfoLoading(true);
        setInfoFailed(false);
      }
      try {
        const next = await onLoadChatInfo(chat.id, chat.kind);
        if (next) {
          setInfo(next);
        } else if (initial) {
          setInfoFailed(true);
        }
      } catch {
        if (initial) {
          setInfoFailed(true);
        }
      } finally {
        if (initial) {
          setInfoLoading(false);
        }
      }
    },
    [chat.id, chat.kind, onLoadChatInfo],
  );

  useEffect(() => {
    setInfo(null);
    setActive(null);
    setMediaFilter("all");
    setSections(createSections());
    setMembers(createMembers());
    setInfoFailed(false);
    void loadInfo(true);
  }, [loadInfo, reloadKey]);

  const tabs = useMemo(() => {
    const result: Array<{ id: InfoTab; label: string }> = [];
    if (infoLoading) {
      return result;
    }
    if (info?.canViewMembers || (infoFailed && chat.kind === "group")) {
      result.push({ id: "members", label: t("rightPanel.members") });
    }
    const counts = new Map(
      (info?.counts ?? []).map((count) => [count.section, count.count]),
    );
    for (const section of SECTION_ORDER) {
      if (info && info.countsKnown) {
        if ((counts.get(section) ?? 0) <= 0) {
          continue;
        }
      }
      result.push({ id: section, label: t(SECTION_LABELS[section]) });
    }
    return result;
  }, [chat.kind, info, infoFailed, infoLoading, t]);

  // Telegram Web opens the first visible tab: Members for groups, Media for
  // everybody else.
  useEffect(() => {
    if (tabs.length === 0) {
      setActive(null);
      return;
    }
    setActive((current) =>
      current && tabs.some((tab) => tab.id === current) ? current : tabs[0].id,
    );
  }, [tabs]);

  const loadSectionPage = useCallback(
    async (section: SharedMediaSection, mode: "first" | "more") => {
      if (sectionLoadingRef.current[section]) {
        return;
      }
      const state = sectionsRef.current[section];
      if (mode === "first" && state.loaded) {
        return;
      }
      if (mode === "more" && (!state.loaded || !state.hasMore)) {
        return;
      }
      sectionLoadingRef.current[section] = true;
      setSections((current) => ({
        ...current,
        [section]: { ...current[section], loading: true, failed: false },
      }));
      try {
        const page = await onLoadSharedMedia(
          chat.id,
          section,
          mode === "first" ? 0 : state.nextBefore,
        );
        setSections((current) => ({
          ...current,
          [section]: {
            items:
              mode === "first"
                ? page.items
                : mergeMedia(current[section].items, page.items),
            loading: false,
            loaded: true,
            failed: false,
            hasMore: page.hasMore,
            nextBefore: page.nextBeforeId,
          },
        }));
      } catch {
        setSections((current) => ({
          ...current,
          [section]: {
            ...current[section],
            loading: false,
            loaded: current[section].loaded,
            failed: true,
          },
        }));
      } finally {
        sectionLoadingRef.current[section] = false;
      }
    },
    [chat.id, onLoadSharedMedia],
  );

  const loadMembersPage = useCallback(
    async (mode: "first" | "more") => {
      if (membersLoadingRef.current) {
        return;
      }
      const state = membersRef.current;
      if (mode === "first" && state.loaded) {
        return;
      }
      if (mode === "more" && (!state.loaded || !state.hasMore)) {
        return;
      }
      membersLoadingRef.current = true;
      setMembers((current) => ({ ...current, loading: true, failed: false }));
      try {
        const page = await onLoadMembersPage(
          chat.id,
          mode === "first" ? 0 : state.nextOffset,
        );
        setMembers((current) => ({
          items:
            mode === "first"
              ? page.members
              : mergeMembers(current.items, page.members),
          loading: false,
          loaded: true,
          failed: false,
          hasMore: page.nextOffset > 0,
          nextOffset: page.nextOffset,
          total: page.total,
        }));
      } catch {
        setMembers((current) => ({
          ...current,
          loading: false,
          loaded: current.loaded,
          failed: true,
        }));
      } finally {
        membersLoadingRef.current = false;
      }
    },
    [chat.id, onLoadMembersPage],
  );

  // Live messages change the tab counters and the list under the open tab.
  // Merge the newest server page over the loaded one instead of resetting the
  // scroll, the way Telegram Web appends to an open shared-media list.
  const refreshLive = useCallback(async () => {
    void loadInfo(false);
    const current = activeRef.current;
    if (!current || current === "members") {
      return;
    }
    const section =
      current === "media" ? mediaSectionKey(mediaFilterRef.current) : current;
    if (!sectionsRef.current[section].loaded) {
      return;
    }
    try {
      const page = await onLoadSharedMedia(chat.id, section, 0);
      setSections((prev) => {
        const state = prev[section];
        const byID = new Map(
          state.items.map((message) => [message.id, message]),
        );
        for (const message of page.items) {
          byID.set(message.id, message);
        }
        const items = [...byID.values()].sort((left, right) => right.id - left.id);
        return {
          ...prev,
          [section]: {
            ...state,
            items,
            loaded: true,
            failed: false,
            nextBefore: state.nextBefore || page.nextBeforeId,
          },
        };
      });
    } catch {
      // A transient refresh failure leaves the already loaded page in place.
    }
  }, [chat.id, loadInfo, onLoadSharedMedia]);

  const liveVersionRef = useRef(liveVersion ?? 0);
  useEffect(() => {
    if (liveVersion === undefined || liveVersion === liveVersionRef.current) {
      return;
    }
    liveVersionRef.current = liveVersion;
    const timer = window.setTimeout(() => {
      void refreshLive();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [liveVersion, refreshLive]);

  // Load the selected tab lazily, exactly like the web profile column.
  useEffect(() => {
    if (!active) {
      return;
    }
    if (active === "members") {
      void loadMembersPage("first");
    } else if (activeSection) {
      void loadSectionPage(activeSection, "first");
    }
  }, [active, activeSection, loadMembersPage, loadSectionPage]);

  const loadMore = useCallback(() => {
    if (!active) {
      return;
    }
    if (active === "members") {
      void loadMembersPage("more");
    } else if (activeSection) {
      void loadSectionPage(activeSection, "more");
    }
  }, [active, activeSection, loadMembersPage, loadSectionPage]);

  const checkScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < LOAD_MORE_THRESHOLD) {
      loadMore();
    }
  }, [loadMore]);

  // A short first page does not scroll on its own; keep filling until the
  // section either fills the viewport or has no more pages (Telegram Web's
  // scrollable refiller).
  useEffect(() => {
    checkScroll();
  }, [checkScroll, members, sections]);

  const prefetch = (tab: InfoTab) => {
    if (tab === "members") {
      void loadMembersPage("first");
    } else if (tab === "media") {
      void loadSectionPage(mediaSectionKey(mediaFilter), "first");
    } else {
      void loadSectionPage(tab, "first");
    }
  };

  const changeMediaFilter = (which: "photos" | "videos", checked: boolean) => {
    // Mirrors tweb's checkbox group: at least one half always stays enabled;
    // unchecking the last one switches to the other kind.
    let photos = mediaFilter !== "videos";
    let videos = mediaFilter !== "photos";
    if (which === "photos") {
      photos = checked;
    } else {
      videos = checked;
    }
    if (!photos && !videos) {
      if (which === "photos") {
        videos = true;
      } else {
        photos = true;
      }
    }
    setMediaFilter(
      photos && videos ? "all" : photos ? "photos" : "videos",
    );
  };

  const renderMembers = () => {
    if (members.failed && members.items.length === 0) {
      return (
        <div className="f-info-status f-info-status-error">
          <p>{t("rightPanel.membersFailed")}</p>
          <Button variant="ghost" onClick={() => void loadMembersPage("first")}>
            {t("common.retry")}
          </Button>
        </div>
      );
    }
    if (members.items.length === 0) {
      return members.loading ? (
        <div className="f-info-status">
          <Spinner size={20} />
        </div>
      ) : (
        <InfoEmpty text={t("rightPanel.membersEmpty")} />
      );
    }
    return (
      <>
        <div className="f-info-members">
          {members.items.map((member) => (
            <div className="f-info-member" key={member.id}>
              <Avatar
                title={member.name}
                initials={chatInitials(member.name)}
                color={chatColor(member.id)}
                photo={member.avatarUrl}
                size={36}
              />
              <span className="f-info-member-copy">
                <b>{member.name}</b>
                <small>
                  {member.bot
                    ? t("rightPanel.bot")
                    : member.username
                      ? `@${member.username}`
                      : t("rightPanel.member")}
                </small>
              </span>
              {member.admin ? (
                <span className="f-info-role">{t("rightPanel.admin")}</span>
              ) : null}
            </div>
          ))}
        </div>
        {members.loading ? (
          <div className="f-info-status">
            <Spinner size={18} />
          </div>
        ) : null}
      </>
    );
  };

  const sectionActions = {
    onDownload: onDownloadInline,
    onDownloadInline,
    onOpenDownloaded,
    onPauseDownload,
    onResumeDownload,
    downloads: downloadsByMessage,
    onForward: onForwardMessage,
    onDelete: onDeleteMessage,
    onJumpToMessage,
    onToast,
    selectedIds,
    onToggleSelect: toggleSelect,
  };

  const renderSection = (section: SharedMediaSection) => {
    const state = sections[section];
    if (state.failed && state.items.length === 0) {
      return (
        <div className="f-info-status f-info-status-error">
          <p>{t("rightPanel.sectionFailed")}</p>
          <Button
            variant="ghost"
            onClick={() => void loadSectionPage(section, "first")}
          >
            {t("common.retry")}
          </Button>
        </div>
      );
    }
    if (state.items.length === 0) {
      return state.loading ? (
        <div className="f-info-status">
          <Spinner size={20} />
        </div>
      ) : (
        <InfoEmpty text={t(SECTION_EMPTY[section])} />
      );
    }
    const items =
      downloadedOnly && section !== "links"
        ? state.items.filter(
            (message) => downloadsByMessage.get(message.id)?.status === "done",
          )
        : state.items;
    if (downloadedOnly && section !== "links" && items.length === 0) {
      return state.loading ? (
        <div className="f-info-status">
          <Spinner size={18} />
        </div>
      ) : (
        <InfoEmpty text={t("rightPanel.downloadedFilterEmpty")} />
      );
    }

    let list;
    switch (section) {
      case "media":
      case "photos":
      case "videos":
        list = (
          <MediaGrid
            items={items}
            onOpenPhoto={onOpenPhoto}
            onPlayVideo={onPlayVideo}
            {...sectionActions}
          />
        );
        break;
      case "gifs":
        list = (
          <MediaGrid
            gifs
            items={items}
            onOpenPhoto={onOpenPhoto}
            onPlayVideo={onPlayVideo}
            {...sectionActions}
          />
        );
        break;
      case "files":
        list = <FileList items={items} {...sectionActions} />;
        break;
      case "links":
        list = <LinkList items={items} {...sectionActions} />;
        break;
      case "music":
        list = <AudioList items={items} {...sectionActions} />;
        break;
      case "voice":
        list = <AudioList voice items={items} {...sectionActions} />;
        break;
      default:
        list = null;
    }

    return (
      <>
        {list}
        {state.loading ? (
          <div className="f-info-status">
            <Spinner size={18} />
          </div>
        ) : null}
      </>
    );
  };

  const renderBody = () => {
    if (!active) {
      return (
        <InfoEmpty text={t("rightPanel.sharedMediaEmpty")} />
      );
    }
    return active === "members"
      ? renderMembers()
      : renderSection(activeSection ?? "media");
  };

  return (
    <aside className="f-info-panel" aria-label={t("rightPanel.chatInfo")}>
      <header className="f-info-head">
        <IconButton
          label={t("rightPanel.close")}
          icon="close"
          size="1"
          iconSize={17}
          onClick={onClose}
        />
        <span className="f-info-title">{t("rightPanel.chatInfo")}</span>
        {active === "media" ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <IconButton
                label={t("rightPanel.mediaFilter")}
                icon="more_vert"
                size="1"
                iconSize={17}
                tooltip={false}
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="f-menu-content"
            >
              <DropdownMenu.CheckboxItem
                className="f-menu-row"
                checked={mediaFilter !== "videos"}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  changeMediaFilter("photos", Boolean(checked))
                }
              >
                {t("rightPanel.photos")}
              </DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                className="f-menu-row"
                checked={mediaFilter !== "photos"}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  changeMediaFilter("videos", Boolean(checked))
                }
              >
                {t("rightPanel.videos")}
              </DropdownMenu.CheckboxItem>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        ) : null}
        {downloadableSection ? (
          <IconButton
            label={t("rightPanel.downloadedFilter")}
            icon="check_circle"
            size="1"
            iconSize={17}
            className={downloadedOnly ? "f-info-filter-on" : undefined}
            onClick={() => setDownloadedOnly((current) => !current)}
          />
        ) : null}
      </header>

      <div
        className="f-info-scroll"
        ref={scrollRef}
        onScroll={checkScroll}
      >
        <div className="f-info-hero">
          <ChatAvatar chat={chat} size={84} />
          <h2>
            {chat.title}
            {chat.verified ? (
              <Icon
                name="verified"
                size={15}
                className="f-info-verified"
                label={t("chat.verified")}
              />
            ) : null}
          </h2>
          <p className={chat.online ? "f-info-sub f-info-online" : "f-info-sub"}>
            {chat.online ? <span className="f-online-dot" /> : null}
            {subtitle}
          </p>
        </div>

        <div className="f-info-actions">
          <button
            type="button"
            className="f-info-action"
            onClick={() => onToggleMute(chat.id)}
          >
            <Icon name={chat.muted ? "notifications" : "notifications_off"} size={19} />
            <span>{chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}</span>
          </button>
          <button
            type="button"
            className="f-info-action"
            onClick={() => onTogglePin(chat.id)}
          >
            <Icon name="push_pin" size={19} />
            <span>{chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}</span>
          </button>
          <button
            type="button"
            className="f-info-action"
            disabled={!chat.unread}
            onClick={() => onMarkRead(chat.id)}
          >
            <Icon name="mark_email_read" size={19} />
            <span>{t("chatMenu.markRead")}</span>
          </button>
        </div>

        {tabs.length > 0 ? (
          <div className="f-info-tabs-sticky">
            <div className="f-info-tabs" role="tablist">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  role="tab"
                  aria-selected={active === tab.id}
                  data-active={active === tab.id || undefined}
                  className="f-info-tab"
                  onClick={() => setActive(tab.id)}
                  onMouseEnter={() => prefetch(tab.id)}
                  onFocus={() => prefetch(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {infoLoading ? (
          <div className="f-info-status">
            <Spinner size={20} />
          </div>
        ) : infoFailed && tabs.length === 0 ? (
          <div className="f-info-status f-info-status-error">
            <p>{t("rightPanel.infoFailed")}</p>
            <Button variant="ghost" onClick={() => setReloadKey((key) => key + 1)}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <div className="f-info-tab-body" role="tabpanel">
            {renderBody()}
          </div>
        )}
      </div>

      {selection.size > 0 ? (
        <div className="f-info-selection-bar">
          <span className="f-info-selection-count">
            {t("rightPanel.selectedCount", { count: selection.size })}
          </span>
          <IconButton
            label={t("chat.forward")}
            icon="forward"
            size="1"
            iconSize={17}
            onClick={() =>
              onForwardMessages?.(Array.from(selection.values()))
            }
          />
          <IconButton
            label={t("common.download")}
            icon="download"
            size="1"
            iconSize={17}
            onClick={() => onDownloadInline(Array.from(selection.keys()))}
          />
          <IconButton
            label={t("chat.delete")}
            icon="delete"
            size="1"
            iconSize={17}
            onClick={() => onDeleteMessages?.(Array.from(selection.values()))}
          />
          <IconButton
            label={t("rightPanel.clearSelection")}
            icon="close"
            size="1"
            iconSize={17}
            onClick={clearSelection}
          />
        </div>
      ) : null}
    </aside>
  );
}
