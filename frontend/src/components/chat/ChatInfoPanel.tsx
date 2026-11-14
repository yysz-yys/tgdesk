import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import type {
  Chat,
  ChatGiftsPage,
  ChatInfo,
  ChatMember,
  ChatMembersPage,
  ChatProfile,
  ChatProfileType,
  DownloadTask,
  GiftInfo,
  Message,
  SavedChats,
  SharedMediaPage,
  SharedMediaSection,
} from "../../types";
import { Avatar, Button, Icon, IconButton, Spinner } from "../../ui";
import { chatColor, chatInitials, mapChat } from "../../data/telegram";
import type { KernelChat } from "../../data/telegram";
import { Service as AppService } from "../../../bindings/tgdesk/internal/app";
import type { ViewerSource } from "../media/types";
import { ChatAvatar } from "./ChatAvatar";
import { RichText } from "./MessageBubble";
import {
  AudioList,
  FileList,
  InfoEmpty,
  LinkList,
  MediaGrid,
} from "./ChatInfoSections";
import { GiftList } from "./info/GiftList";
import { SavedChatList } from "./info/SavedChatList";
import { PeerQrDialog, QrCodeIcon } from "./PeerQrDialog";

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
  onOpenPhoto?: (
    message: Message,
    source?: ViewerSource,
    mediaItems?: Message[],
  ) => void;
  onPlayVideo?: (
    message: Message,
    source?: ViewerSource,
    mediaItems?: Message[],
  ) => void;
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
  /**
   * Full peer profile loaded by ChatView. The panel only renders it, so a slow
   * profile request never blocks the shared-media tabs below.
   */
  profile?: ChatProfile | null;
  profileLoading?: boolean;
  profileFailed?: boolean;
  onRetryProfile?: () => void;
  onSearchInChat?: () => void;
  onArchiveChat?: () => void;
  /** Opens the bot's menu web app as a mini-app window. */
  onOpenBotWebView?: () => void;
  /**
   * Focuses the composer. Kept for the shell's wiring; Web K's profile tiles do
   * not carry a "Message" action for the chat that is already open, so the panel
   * itself no longer renders that tile.
   */
  onFocusComposer?: () => void;
  /**
   * Leaves the channel/group. The caller owns the confirmation dialog and the
   * backend call; the tile only exists when this prop is wired.
   */
  onLeaveChat?: () => void;
  /**
   * Opens the linked discussion group of a channel. The full `Chat` entity is
   * passed when the kernel resolved it (`profile.linkedChat`), which lets the
   * shell open discussions that are not part of the loaded dialog list.
   */
  onOpenDiscussion?: (chatID: string, chat?: Chat) => void;
  /** Routes a t.me link through the app's in-app navigator (Lead wires it). */
  onOpenLink?: (url: string) => void;
  /**
   * Loads the source chats of Saved Messages (Telegram Web K's "Chats" tab).
   * When omitted the panel asks `AppService.GetSavedChats` directly through the
   * typed binding cast below, so the tab also works before App.tsx wires it.
   */
  onLoadSavedChats?: () => Promise<SavedChats | null>;
  /** Opens one source chat of Saved Messages (Lead wires in-app navigation). */
  onOpenSavedChat?: (chatID: string) => void;
  /**
   * Loads one page of the profile's star gifts (user/channel Gifts tab).
   * When omitted the panel asks `AppService.GetChatGifts` through the cast.
   */
  onLoadChatGifts?: (offset?: string) => Promise<ChatGiftsPage | null>;
  /**
   * Network params (`proxyUrl` + `settings.ntp`) used by the AppService
   * fallbacks; the shell should pass the same pair it gives the composer.
   */
  network?: { proxy: string; ntp: string };
}

type InfoTab = "members" | "chats" | "gifts" | SharedMediaSection;

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

/** Paged state of the Gifts tab (payments.getSavedStarGifts). */
interface GiftsState {
  items: GiftInfo[];
  loading: boolean;
  loaded: boolean;
  failed: boolean;
  hasMore: boolean;
  nextOffset: string;
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

function createGifts(): GiftsState {
  return {
    items: [],
    loading: false,
    loaded: false,
    failed: false,
    hasMore: false,
    nextOffset: "",
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

/** Appends one Gifts page, skipping ids that were already rendered. */
function mergeGifts(current: GiftInfo[], incoming: GiftInfo[]): GiftInfo[] {
  if (incoming.length === 0) {
    return current;
  }
  const key = (gift: GiftInfo) =>
    `${gift.id}|${gift.date ?? 0}|${gift.title}|${gift.count ?? 0}`;
  const known = new Set(current.map(key));
  const next = current.slice();
  for (const gift of incoming) {
    const id = key(gift);
    if (!known.has(id)) {
      known.add(id);
      next.push(gift);
    }
  }
  return next;
}

/* --------------------------------------------------------------------------
 * Telegram-style "personal info" details: bio card, username / link / phone
 * rows, member counters and the bot extras. Values come from the optional
 * ChatProfile that ChatView fetches; the block is skipped without it.
 */

const PROFILE_TITLE_KEYS: Record<ChatProfileType, string> = {
  user: "profile.userInfo",
  bot: "profile.botInfo",
  group: "profile.groupInfo",
  channel: "profile.channelInfo",
  saved: "profile.savedMessages",
};

/* --------------------------------------------------------------------------
 * Round-3 kernel calls (Saved Messages source chats, profile gifts). The Wails
 * bindings are regenerated by the Lead, so the generated service is cast to a
 * minimal local shape. If the shell passes a loader prop the cast is not used.
 */

/** Minimal DTO shape of `kernel.GetSavedChats` before the bindings regenerate. */
interface SavedChatsDTO {
  chats?: KernelChat[] | null;
  count?: number;
}

/** Minimal shape of `kernel.StarGiftDTO`; `GiftInfo` mirrors it. */
interface GiftInfoDTO {
  id?: string;
  title?: string;
  from?: string;
  date?: number;
  stars?: number;
  count?: number;
  thumbUrl?: string;
  unique?: boolean;
  soldOut?: boolean;
}

/** Minimal DTO shape of `kernel.GetChatGifts` before the bindings regenerate. */
interface ChatGiftsDTO {
  gifts?: GiftInfoDTO[] | null;
  nextOffset?: string;
  total?: number;
}

interface ChatInfoServiceExtras {
  GetSavedChats?: (
    proxy: string,
    ntp: string,
  ) => Promise<SavedChatsDTO | null>;
  GetChatGifts?: (
    chatID: string,
    offset: string,
    limit: number,
    proxy: string,
    ntp: string,
  ) => Promise<ChatGiftsDTO | null>;
}

const infoService = AppService as unknown as ChatInfoServiceExtras;

/** Page size of the profile Gifts tab (Web K loads small pages too). */
const GIFTS_PAGE_SIZE = 40;

/** Normalises the star-gift DTO into the panel's `GiftInfo` rows. */
function mapGiftInfo(gift: GiftInfoDTO): GiftInfo | null {
  if (!gift || (!gift.title && !gift.thumbUrl)) {
    return null;
  }
  return {
    id: gift.id ?? "",
    title: gift.title ?? "",
    from: gift.from || undefined,
    date: gift.date || undefined,
    stars: gift.stars || undefined,
    count: gift.count || undefined,
    thumbUrl: gift.thumbUrl || undefined,
    unique: Boolean(gift.unique),
    soldOut: Boolean(gift.soldOut),
  };
}

/** Adds the scheme Wails' Browser.OpenURL expects to bare t.me links. */
function normalizeProfileUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/u, "")}`;
}

/** `t.me/name` display form of a public username. */
function telegramDisplayLink(username: string): string {
  const name = username
    .trim()
    .replace(/^@/u, "")
    .replace(/^https?:\/\/t\.me\//iu, "");
  return `t.me/${name}`;
}

/** `t.me/+hash` display form of an invite link (scheme stripped). */
function inviteDisplayLink(link: string): string {
  return normalizeProfileUrl(link).replace(/^https?:\/\//iu, "");
}

/** Short hostname used as the subtitle of external link rows. */
function profileHost(value: string): string {
  try {
    return new URL(normalizeProfileUrl(value)).hostname.replace(/^www\./iu, "");
  } catch {
    return inviteDisplayLink(value);
  }
}

interface ProfileRowProps {
  icon: string;
  value: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  right?: ReactNode;
}

/**
 * Telegram Web K's value + small muted subtitle row. The clickable area and the
 * trailing action (the QR button) are siblings: nesting a button inside the row
 * button would be invalid markup and one click would fire both handlers.
 */
function ProfileRow({ icon, value, label, onClick, right }: ProfileRowProps) {
  const content = (
    <>
      <span className="f-info-prow-ico" aria-hidden>
        <Icon name={icon} size={17} />
      </span>
      <span className="f-info-prow-copy">
        <span className="f-info-prow-value">{value}</span>
        <small className="f-info-prow-label">{label}</small>
      </span>
    </>
  );
  return (
    <div className="f-info-prow" data-clickable={onClick ? "" : undefined}>
      {onClick ? (
        <button type="button" className="f-info-prow-main" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="f-info-prow-main">{content}</div>
      )}
      {right ? <span className="f-info-prow-right">{right}</span> : null}
    </div>
  );
}

/**
 * Bio row with rich text (URL auto-linking). Web K's chat description is never
 * clamped; user/bot bios keep the desktop-style four-line clamp with an
 * expand/collapse control when the text actually overflows.
 */
function ProfileBio({
  text,
  chatId,
  label,
  clamp = true,
}: {
  text: string;
  chatId: string;
  label: string;
  clamp?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // A different peer always starts collapsed.
  useEffect(() => {
    setExpanded(false);
    setOverflowing(false);
  }, [chatId, text]);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element || !clamp || expanded) {
      return;
    }
    const measure = () =>
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [chatId, clamp, expanded, text]);

  return (
    <div className="f-info-prow f-info-bio">
      <span className="f-info-prow-ico" aria-hidden>
        <Icon name="info" size={17} />
      </span>
      <div className="f-info-prow-copy">
        <div
          ref={bodyRef}
          className="f-info-bio-body"
          data-clamped={clamp && !expanded ? "" : undefined}
          data-expanded={expanded || undefined}
        >
          <RichText text={text} />
        </div>
        {clamp && (overflowing || expanded) ? (
          <button
            type="button"
            className="f-info-bio-toggle"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? t("profile.showLess") : t("profile.showMore")}
          </button>
        ) : null}
        <small className="f-info-prow-label">{label}</small>
      </div>
    </div>
  );
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
  profile = null,
  profileLoading = false,
  profileFailed = false,
  onRetryProfile,
  onSearchInChat,
  onArchiveChat,
  onOpenBotWebView,
  onLeaveChat,
  onOpenDiscussion,
  onOpenLink,
  onLoadSavedChats,
  onOpenSavedChat,
  onLoadChatGifts,
  network,
}: ChatInfoPanelProps) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoFailed, setInfoFailed] = useState(false);
  const [active, setActive] = useState<InfoTab | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [selection, setSelection] = useState<Map<number, Message>>(new Map());
  const [qrUsername, setQrUsername] = useState<string | null>(null);
  const [sections, setSections] =
    useState<Record<SharedMediaSection, SectionState>>(createSections);
  const [members, setMembers] = useState<MembersState>(createMembers);
  const [savedChats, setSavedChats] = useState<SavedChats | null>(null);
  const [savedChatsFailed, setSavedChatsFailed] = useState(false);
  const [gifts, setGifts] = useState<GiftsState>(createGifts);
  const [reloadKey, setReloadKey] = useState(0);

  const sectionsRef = useRef(sections);
  const membersRef = useRef(members);
  const activeRef = useRef<InfoTab | null>(active);
  const mediaFilterRef = useRef<MediaFilter>(mediaFilter);
  const sectionLoadingRef = useRef<Partial<Record<SharedMediaSection, boolean>>>({});
  const membersLoadingRef = useRef(false);
  const savedChatsRef = useRef<SavedChats | null>(null);
  const savedChatsLoadingRef = useRef(false);
  const giftsRef = useRef(gifts);
  const giftsLoadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Latest loader props / network params for the async callbacks; kept in a ref
  // so inline arrow props from the shell never restart the loading effects.
  const loadersRef = useRef({
    onLoadSavedChats,
    onLoadChatGifts,
    network,
    language: i18n.language,
    t,
  });
  useEffect(() => {
    loadersRef.current = {
      onLoadSavedChats,
      onLoadChatGifts,
      network,
      language: i18n.language,
      t,
    };
  });

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    savedChatsRef.current = savedChats;
  }, [savedChats]);

  useEffect(() => {
    giftsRef.current = gifts;
  }, [gifts]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    mediaFilterRef.current = mediaFilter;
  }, [mediaFilter]);

  // The Media tab swaps between the combined photo+video filter and each half,
  // exactly like Telegram Web's tickable Photos/Videos menu.
  const activeSection = useMemo<SharedMediaSection | null>(() => {
    if (!active || active === "members" || active === "chats" || active === "gifts") {
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

  // The profile decides "user" vs "bot" vs "saved"; the dialog kind is only a
  // fallback while the full peer request is still in flight.
  const peerType = useMemo<ChatProfileType>(() => {
    if (profile?.type) {
      return profile.type;
    }
    if (chat.saved) {
      return "saved";
    }
    if (chat.bot) {
      return "bot";
    }
    return chat.kind === "private" ? "user" : chat.kind;
  }, [chat.bot, chat.kind, chat.saved, profile]);
  /** Saved Messages has no profile block in Web K: tabs only. */
  const isSaved = peerType === "saved";
  /** Broadcast channels and supergroups share the same info card/link row. */
  const isChatPeer = peerType === "group" || peerType === "channel";
  /**
   * Saved Messages gets its title from the chat itself (the shell localises the
   * self-chat title); normal peers keep the Web K "X info" pane title. The
   * localised "我的收藏" must come from `chat.title`, never a second label here.
   */
  const panelTitle = isSaved
    ? chat.title || t("profile.savedMessages")
    : t(PROFILE_TITLE_KEYS[peerType]);
  const countFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const memberCount = profile?.members ?? chat.memberCount ?? 0;
  /** Saved Messages 2.0 "N chats" line under the pane title. */
  const savedChatsSubtitle = useMemo(() => {
    if (!isSaved || !savedChats) {
      return "";
    }
    const count = savedChats.count || savedChats.chats.length;
    return t("rightPanel.savedChatsCount", {
      count,
      value: countFormatter.format(count),
    });
  }, [countFormatter, isSaved, savedChats, t]);
  /** Gifts tab is a Web K channel/user tab; groups, bots and Saved never get it. */
  const showGiftsTab =
    !isSaved &&
    (peerType === "user" || peerType === "channel") &&
    (profile?.giftsCount ?? 0) > 0;

  // Web K's link row carries only the main username; the others live in the
  // "also @x, @y" subtitle. The kernel sends every active username (main first)
  // and the preferred one separately, so normalise both into one ordered list.
  const usernames = useMemo(() => {
    const clean = (value: string | undefined) =>
      (value ?? "")
        .trim()
        .replace(/^@+/u, "")
        .replace(/^https?:\/\/t\.me\//iu, "");
    const list: string[] = [];
    const push = (value: string | undefined) => {
      const name = clean(value);
      if (name && !list.includes(name)) {
        list.push(name);
      }
    };
    for (const item of profile?.usernames ?? []) {
      push(item);
    }
    const preferred = clean(profile?.username);
    push(preferred);
    if (preferred && list.length > 1 && list[0] !== preferred) {
      list.splice(list.indexOf(preferred), 1);
      list.unshift(preferred);
    }
    return list;
  }, [profile?.username, profile?.usernames]);

  const usernamesAlso = useMemo(() => {
    if (usernames.length <= 1) {
      return "";
    }
    const separator = t("profile.usernameSeparator");
    return t("profile.usernameAlso", {
      usernames: usernames
        .slice(1)
        .map((name) => `@${name}`)
        .join(separator),
    });
  }, [t, usernames]);

  const copyProfileValue = useCallback(
    async (value: string, toastKey: string) => {
      try {
        await navigator.clipboard.writeText(value);
        onToast(t(toastKey));
      } catch {
        onToast(t("profile.copyFailed"));
      }
    },
    [onToast, t],
  );

  // t.me links go through the shell's in-app router when it is wired, else the
  // system browser — same fallback Telegram Web uses for non-resolvable links.
  const openProfileLink = useCallback(
    (url: string) => {
      if (onOpenLink) {
        onOpenLink(url);
        return;
      }
      void Browser.OpenURL(url);
    },
    [onOpenLink],
  );

  const qrButton = (username: string) => (
    <button
      type="button"
      className="f-info-qr"
      aria-label={t("profile.qrCode")}
      title={t("profile.qrCode")}
      onClick={() => setQrUsername(username)}
    >
      <QrCodeIcon size={17} />
    </button>
  );

  // Telegram Web K's profile tiles, in its order and capped at four with the
  // More menu as the last slot: Call (users), Mute, Discussion, Leave, More.
  // The "Message"/"Open" tile is hidden for the chat that is already open
  // (Web K checks peerId !== the open chat), and this column always belongs to
  // the open chat, so it never renders here.
  const actionTiles = useMemo(() => {
    const tiles: Array<{
      id: string;
      icon: string;
      label: string;
      onClick: () => void;
    }> = [];
    if (isSaved) {
      return tiles;
    }
    if (peerType === "user") {
      tiles.push({
        id: "call",
        icon: "call",
        label: t("profile.call"),
        onClick: () => onToast(t("profile.callsNotAvailable")),
      });
    }
    tiles.push({
      id: "mute",
      icon: chat.muted ? "notifications_off" : "notifications",
      label: chat.muted ? t("profile.unmute") : t("profile.mute"),
      onClick: () => onToggleMute(chat.id),
    });
    // Web K resolves the Discussion tile from `channelFull.linked_chat_id`; the
    // shell opens `linkedChat` directly when the group is not in the dialog list.
    const linkedChat = profile?.linkedChat;
    const linkedChatId = profile?.linkedChatId ?? linkedChat?.id;
    if (linkedChatId && onOpenDiscussion) {
      tiles.push({
        id: "discussion",
        icon: "forum",
        label: t("profile.discussion"),
        onClick: () => onOpenDiscussion(linkedChatId, linkedChat),
      });
    }
    if (isChatPeer && onLeaveChat) {
      tiles.push({
        id: "leave",
        icon: "logout",
        label: t("profile.leave"),
        onClick: onLeaveChat,
      });
    }
    return tiles;
  }, [
    chat.id,
    chat.muted,
    isChatPeer,
    isSaved,
    onLeaveChat,
    onOpenDiscussion,
    onToggleMute,
    onToast,
    peerType,
    profile?.linkedChat,
    profile?.linkedChatId,
    t,
  ]);

  // The hero subtitle is always peer-based (Telegram never swaps it for media
  // counters); the Media tab keeps its own Photos/Videos filter menu.
  const subtitle = useMemo(() => {
    switch (peerType) {
      case "saved":
        return t("profile.savedHint");
      case "bot":
        return profile?.username
          ? `@${profile.username}`
          : t("profile.botStatus");
      case "group":
      case "channel": {
        if (memberCount > 0) {
          return t(
            peerType === "channel"
              ? "profile.subscribersCount"
              : "profile.membersCount",
            { count: memberCount, value: countFormatter.format(memberCount) },
          );
        }
        return (
          chat.members ??
          t(peerType === "channel" ? "rightPanel.channel" : "rightPanel.group")
        );
      }
      default:
        return chat.online ? t("chat.online") : t("chat.lastSeen");
    }
  }, [
    chat.members,
    chat.online,
    countFormatter,
    memberCount,
    peerType,
    profile?.username,
    t,
  ]);

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
    setSavedChats(null);
    setSavedChatsFailed(false);
    setGifts(createGifts());
    setInfoFailed(false);
    // The refs are read by the async loaders; clear them synchronously so a
    // chat switch cannot keep the previous peer's loaded chats/gifts.
    savedChatsRef.current = null;
    giftsRef.current = createGifts();
    void loadInfo(true);
  }, [loadInfo, reloadKey]);

  // Telegram Web K's Saved "Chats" tab lists the source chats of the saved
  // messages. The figure also feeds the "N chats" subtitle in the pane header,
  // so it loads eagerly for the Saved peer instead of on the first tab click.
  const loadSavedChats = useCallback(async () => {
    if (savedChatsLoadingRef.current || savedChatsRef.current) {
      return;
    }
    savedChatsLoadingRef.current = true;
    setSavedChatsFailed(false);
    try {
      const {
        onLoadSavedChats: loader,
        network: net,
        language,
        t: translate,
      } = loadersRef.current;
      let next: SavedChats | null = null;
      if (loader) {
        next = await loader();
      } else if (infoService.GetSavedChats) {
        const dto = await infoService.GetSavedChats(
          net?.proxy ?? "",
          net?.ntp ?? "",
        );
        if (dto) {
          const chats = (dto.chats ?? []).map((item) =>
            mapChat(item, language, translate),
          );
          next = { chats, count: dto.count ?? chats.length };
        }
      }
      if (next) {
        setSavedChats(next);
      } else {
        setSavedChatsFailed(true);
      }
    } catch {
      setSavedChatsFailed(true);
    } finally {
      savedChatsLoadingRef.current = false;
    }
  }, []);

  // The first visible Chats tab for Saved; also the Retry target.
  useEffect(() => {
    if (!isSaved) {
      return;
    }
    void loadSavedChats();
  }, [chat.id, isSaved, loadSavedChats, reloadKey]);

  // Profile Gifts tab: payments.getSavedStarGifts pages, loaded lazily on the
  // first activation and appended when the list is scrolled to the end.
  const loadGiftsPage = useCallback(
    async (mode: "first" | "more") => {
      if (giftsLoadingRef.current) {
        return;
      }
      const state = giftsRef.current;
      if (mode === "first" && state.loaded) {
        return;
      }
      if (mode === "more" && (!state.loaded || !state.hasMore)) {
        return;
      }
      giftsLoadingRef.current = true;
      setGifts((current) => ({ ...current, loading: true, failed: false }));
      try {
        const { onLoadChatGifts: loader, network: net } = loadersRef.current;
        let page: ChatGiftsPage | null = null;
        if (loader) {
          page = await loader(mode === "first" ? undefined : state.nextOffset);
        } else if (infoService.GetChatGifts) {
          const dto = await infoService.GetChatGifts(
            chat.id,
            mode === "first" ? "" : state.nextOffset,
            GIFTS_PAGE_SIZE,
            net?.proxy ?? "",
            net?.ntp ?? "",
          );
          if (dto) {
            const items = (dto.gifts ?? [])
              .map(mapGiftInfo)
              .filter((gift): gift is GiftInfo => gift !== null);
            page = {
              gifts: items,
              nextOffset: dto.nextOffset || undefined,
              total: dto.total ?? 0,
            };
          }
        }
        if (!page) {
          setGifts((current) => ({
            ...current,
            loading: false,
            loaded: current.loaded,
            failed: true,
          }));
          return;
        }
        const items = page.gifts ?? [];
        setGifts((current) => ({
          items: mode === "first" ? items : mergeGifts(current.items, items),
          loading: false,
          loaded: true,
          failed: false,
          hasMore: Boolean(page.nextOffset),
          nextOffset: page.nextOffset ?? "",
          total: page.total ?? 0,
        }));
      } catch {
        setGifts((current) => ({
          ...current,
          loading: false,
          loaded: current.loaded,
          failed: true,
        }));
      } finally {
        giftsLoadingRef.current = false;
      }
    },
    [chat.id],
  );

  const tabs = useMemo(() => {
    const result: Array<{ id: InfoTab; label: string }> = [];
    // Saved Messages 2.0 opens on its source-chat "Chats" list, which stays
    // visible even while the shared-media counter request is still running.
    if (isSaved) {
      // Reuses the existing "Chats" nav string (Web K's SavedDialogs tab label).
      result.push({ id: "chats", label: t("sidebar.chats") });
    }
    if (infoLoading) {
      return result;
    }
    // Web K never shows a Members tab for a broadcast channel; groups keep it.
    if (
      peerType === "group" &&
      (info?.canViewMembers || (infoFailed && chat.kind === "group"))
    ) {
      result.push({ id: "members", label: t("rightPanel.members") });
    }
    // Gifts sits before the shared-media tabs, exactly like Web K.
    if (showGiftsTab) {
      result.push({ id: "gifts", label: t("rightPanel.gifts") });
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
  }, [
    chat.kind,
    info,
    infoFailed,
    infoLoading,
    isSaved,
    peerType,
    showGiftsTab,
    t,
  ]);

  // Telegram Web opens the peer's main tab, not literally the first tab: the
  // Members list for groups, Media for everybody else. Saved Messages opens its
  // Chats list, the way Web A's ProfileState.SavedDialogs does.
  useEffect(() => {
    if (tabs.length === 0) {
      setActive(null);
      return;
    }
    setActive((current) => {
      if (current && tabs.some((tab) => tab.id === current)) {
        return current;
      }
      const preferred = isSaved
        ? ["chats", "media", "files", "links", "music", "voice", "gifs"]
        : ["members", "media", "files", "links", "music", "voice", "gifs"];
      for (const id of preferred) {
        if (tabs.some((tab) => tab.id === id)) {
          return id as InfoTab;
        }
      }
      return tabs[0].id;
    });
  }, [isSaved, tabs]);

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
    if (
      !current ||
      current === "members" ||
      current === "chats" ||
      current === "gifts"
    ) {
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
    } else if (active === "chats") {
      void loadSavedChats();
    } else if (active === "gifts") {
      void loadGiftsPage("first");
    } else if (activeSection) {
      void loadSectionPage(activeSection, "first");
    }
  }, [
    active,
    activeSection,
    loadGiftsPage,
    loadMembersPage,
    loadSavedChats,
    loadSectionPage,
  ]);

  const loadMore = useCallback(() => {
    if (!active) {
      return;
    }
    if (active === "members") {
      void loadMembersPage("more");
    } else if (active === "gifts") {
      void loadGiftsPage("more");
    } else if (activeSection) {
      void loadSectionPage(activeSection, "more");
    }
  }, [active, activeSection, loadGiftsPage, loadMembersPage, loadSectionPage]);

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
  }, [checkScroll, gifts, members, sections]);

  const prefetch = (tab: InfoTab) => {
    if (tab === "members") {
      void loadMembersPage("first");
    } else if (tab === "chats") {
      void loadSavedChats();
    } else if (tab === "gifts") {
      void loadGiftsPage("first");
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

  // Saved Messages 2.0 "Chats" tab. Web K lists the source chats of the saved
  // messages with a click that reopens that conversation.
  const renderSavedChats = () => {
    if (savedChatsFailed && !savedChats) {
      return (
        <div className="f-info-status f-info-status-error">
          <p>{t("rightPanel.chatsFailed")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              savedChatsRef.current = null;
              void loadSavedChats();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      );
    }
    if (!savedChats) {
      return (
        <div className="f-info-status">
          <Spinner size={20} />
        </div>
      );
    }
    if (savedChats.chats.length === 0) {
      return <InfoEmpty text={t("rightPanel.chatsEmpty")} />;
    }
    return (
      <SavedChatList
        chats={savedChats.chats}
        unavailable={!onOpenSavedChat}
        onOpenChat={(chat) => {
          if (onOpenSavedChat) {
            onOpenSavedChat(chat.id);
          } else {
            onToast(t("rightPanel.savedChatUnavailable"));
          }
        }}
      />
    );
  };

  // Profile Gifts tab: grid of the star gifts saved on this user/channel.
  const renderGifts = () => {
    if (gifts.failed && gifts.items.length === 0) {
      return (
        <div className="f-info-status f-info-status-error">
          <p>{t("rightPanel.giftsFailed")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              giftsRef.current = createGifts();
              setGifts(createGifts());
              void loadGiftsPage("first");
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      );
    }
    if (gifts.items.length === 0) {
      return gifts.loading ? (
        <div className="f-info-status">
          <Spinner size={20} />
        </div>
      ) : (
        <InfoEmpty text={t("rightPanel.giftsEmpty")} />
      );
    }
    return (
      <>
        <GiftList gifts={gifts.items} />
        {gifts.loading ? (
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
            onOpenPhoto={(message, source) =>
              onOpenPhoto?.(message, source, items)
            }
            onPlayVideo={(message, source) =>
              onPlayVideo?.(message, source, items)
            }
            {...sectionActions}
          />
        );
        break;
      case "gifs":
        list = (
          <MediaGrid
            gifs
            items={items}
            onOpenPhoto={(message, source) =>
              onOpenPhoto?.(message, source, items)
            }
            onPlayVideo={(message, source) =>
              onPlayVideo?.(message, source, items)
            }
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

  // Telegram's "personal info" card. Web K's channel/group card holds only the
  // bio and one link row (public username → t.me/<name> with the QR button, else
  // the exported invite link); users get phone + username rows with the same QR
  // button, bots keep their menu/commands/privacy rows. Web K's Saved Messages
  // column has no profile block at all, so the card (and its loading/error state)
  // disappears for it.
  const renderProfileCard = () => {
    if (isSaved) {
      return null;
    }
    if (!profile) {
      if (profileLoading) {
        return (
          <div className="f-info-profile f-info-profile-state">
            <Spinner size={16} />
            <span>{t("profile.loading")}</span>
          </div>
        );
      }
      if (profileFailed) {
        return (
          <div className="f-info-profile f-info-profile-state f-info-profile-error">
            <span>{t("profile.loadFailed")}</span>
            {onRetryProfile ? (
              <Button variant="ghost" onClick={onRetryProfile}>
                {t("common.retry")}
              </Button>
            ) : null}
          </div>
        );
      }
      return null;
    }

    const rows: ReactNode[] = [];
    const about = profile.about?.trim();
    if (about) {
      const bioLabel =
        peerType === "bot"
          ? t("profile.botAbout")
          : isChatPeer
            ? t("profile.info")
            : t("profile.bio");
      rows.push(
        <ProfileBio
          key="bio"
          text={about}
          chatId={chat.id}
          label={bioLabel}
          clamp={!isChatPeer}
        />,
      );
    }

    const primary = usernames[0];
    if (isChatPeer) {
      // Exactly one link row, like Web K's channel profile. There is no separate
      // @username row and no subscriber/member count row: the count lives in the
      // hero subtitle, the extra usernames in the row subtitle.
      const invite = profile.inviteLink?.trim();
      if (primary) {
        const publicLink = `https://t.me/${primary}`;
        rows.push(
          <ProfileRow
            key="link"
            icon="link"
            value={telegramDisplayLink(primary)}
            label={usernamesAlso || t("profile.link")}
            onClick={() =>
              void copyProfileValue(publicLink, "profile.linkCopied")
            }
            right={qrButton(primary)}
          />,
        );
      } else if (invite) {
        // Invite-only peers get the t.me/+hash row; Web K shows no QR for it.
        rows.push(
          <ProfileRow
            key="invite"
            icon="link"
            value={inviteDisplayLink(invite)}
            label={t("profile.link")}
            onClick={() => void copyProfileValue(invite, "profile.inviteCopied")}
            right={
              <IconButton
                label={t("profile.openLink")}
                icon="open_in_new"
                size="1"
                iconSize={15}
                onClick={() => openProfileLink(normalizeProfileUrl(invite))}
              />
            }
          />,
        );
      }
    } else {
      if (profile.phone) {
        rows.push(
          <ProfileRow
            key="phone"
            icon="call"
            value={profile.phone}
            label={t("profile.phone")}
            onClick={() =>
              void copyProfileValue(profile.phone ?? "", "profile.phoneCopied")
            }
          />,
        );
      }
      if (primary) {
        rows.push(
          <ProfileRow
            key="username"
            icon="at"
            value={`@${primary}`}
            label={usernamesAlso || t("profile.username")}
            onClick={() =>
              void copyProfileValue(`@${primary}`, "profile.usernameCopied")
            }
            right={qrButton(primary)}
          />,
        );
      }
    }

    if (peerType === "bot") {
      const menuButton = profile.botMenuButton;
      if (menuButton?.type === "webapp" && onOpenBotWebView) {
        rows.push(
          <ProfileRow
            key="bot-app"
            icon="open_in_new"
            value={menuButton.text || t("profile.openBotApp")}
            label={t("profile.botMenu")}
            onClick={onOpenBotWebView}
          />,
        );
      }
      const commands = profile.botCommands ?? [];
      if (commands.length > 0) {
        rows.push(
          <div className="f-info-prow f-info-commands" key="commands">
            <div className="f-info-commands-head">
              <span className="f-info-prow-ico" aria-hidden>
                <Icon name="bot" size={17} />
              </span>
              <span className="f-info-prow-copy">
                <span className="f-info-prow-value">
                  {t("profile.botCommands")}
                </span>
                <small className="f-info-prow-label">
                  {t("profile.botCommandsCount", { count: commands.length })}
                </small>
              </span>
            </div>
            <div className="f-info-command-list">
              {commands.map((command) => (
                <button
                  type="button"
                  key={command.command}
                  className="f-info-command"
                  title={`/${command.command}`}
                  onClick={() =>
                    void copyProfileValue(
                      `/${command.command}`,
                      "profile.commandCopied",
                    )
                  }
                >
                  <b>/{command.command}</b>
                  {command.description ? (
                    <small>{command.description}</small>
                  ) : null}
                </button>
              ))}
            </div>
          </div>,
        );
      }
      if (profile.botPrivacyUrl) {
        const privacyUrl = normalizeProfileUrl(profile.botPrivacyUrl);
        rows.push(
          <ProfileRow
            key="bot-privacy"
            icon="shield"
            value={t("profile.botPrivacy")}
            label={profileHost(privacyUrl)}
            onClick={() => void Browser.OpenURL(privacyUrl)}
          />,
        );
      }
    }

    if (rows.length === 0) {
      return null;
    }
    return <div className="f-info-profile">{rows}</div>;
  };

  const renderBody = () => {
    if (!active) {
      return (
        <InfoEmpty text={t("rightPanel.sharedMediaEmpty")} />
      );
    }
    if (active === "members") {
      return renderMembers();
    }
    if (active === "chats") {
      return renderSavedChats();
    }
    if (active === "gifts") {
      return renderGifts();
    }
    return renderSection(activeSection ?? "media");
  };

  return (
    <aside
      className="f-info-panel"
      data-saved={isSaved ? "" : undefined}
      aria-label={t("rightPanel.chatInfo")}
    >
      <header className="f-info-head">
        <IconButton
          label={t("rightPanel.close")}
          icon="close"
          size="1"
          iconSize={17}
          onClick={onClose}
        />
        <span className="f-info-head-copy">
          <span className="f-info-title">{panelTitle}</span>
          {/* Saved Messages has no hero block, so the "N chats" line lives in
              the pane header like Web K's shared-media subtitle. */}
          {savedChatsSubtitle ? (
            <small className="f-info-head-sub">{savedChatsSubtitle}</small>
          ) : null}
        </span>
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
        {isSaved ? null : (
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
        )}

        {isSaved ? null : (
          <div className="f-info-actions">
          {actionTiles.map((tile) => (
            <button
              type="button"
              key={tile.id}
              className="f-info-action"
              onClick={tile.onClick}
            >
              <Icon name={tile.icon} size={24} />
              <span>{tile.label}</span>
            </button>
          ))}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <button
                type="button"
                className="f-info-action"
                aria-label={t("profile.more")}
              >
                <Icon name="more_horiz" size={24} />
                <span>{t("profile.more")}</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="f-menu-content"
            >
              <DropdownMenu.Item
                className="f-menu-row"
                onSelect={() => onTogglePin(chat.id)}
              >
                <Icon name="push_pin" size={16} />
                {chat.pinned
                  ? t("chatMenu.unpin")
                  : t("chatMenu.pin")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="f-menu-row"
                disabled={!chat.unread}
                onSelect={() => onMarkRead(chat.id)}
              >
                <Icon name="mark_email_read" size={16} />
                {t("chatMenu.markRead")}
              </DropdownMenu.Item>
              {onArchiveChat ? (
                <DropdownMenu.Item
                  className="f-menu-row"
                  onSelect={() => onArchiveChat()}
                >
                  <Icon
                    name={chat.archived ? "unarchive" : "archive"}
                    size={16}
                  />
                  {chat.archived
                    ? t("chatMenu.unarchive")
                    : t("chatMenu.archive")}
                </DropdownMenu.Item>
              ) : null}
              {onSearchInChat ? (
                <>
                  <DropdownMenu.Separator className="f-menu-separator" />
                  <DropdownMenu.Item
                    className="f-menu-row"
                    onSelect={() => onSearchInChat()}
                  >
                    <Icon name="search" size={16} />
                    {t("chat.searchInChat")}
                  </DropdownMenu.Item>
                </>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
        )}

        {renderProfileCard()}

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

        {infoLoading && !isSaved ? (
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
      {qrUsername ? (
        <PeerQrDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setQrUsername(null);
            }
          }}
          username={qrUsername}
          onToast={onToast}
          onOpenLink={onOpenLink}
        />
      ) : null}
    </aside>
  );
}
