import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { AnimationItem } from "lottie-web";
import { KIcon } from "./KIcon";
import { KScrollArea } from "./KScrollArea";
import { KSearchField } from "./KSearchField";
import { KSuperTabHeader } from "./KSuperTab";
import { chatAbbreviation, PEER_COLOR_NAMES } from "./model";
import { useRipple } from "./useRipple";
// These page styles are self-imported here (the pattern ChatComposer and the
// other component-local stylesheets use): styles/k/k.css imports this file on
// the branch that mounts the flow, and the dev preview routes mount the
// component directly, so both see the rules.
import "../../styles/k/newchat.css";

/** A user row returned by the add-members search (`kernel.ContactDTO`). */
export interface KNewChatMember {
  id: number;
  name: string;
  username?: string;
  avatarUrl?: string;
  colorIndex?: number;
}

export interface KNewChatFlowProps {
  /** Which creation flow the tab hosts: a broadcast channel or a basic group. */
  kind: "channel" | "group";
  /** Close the whole flow (the parent animates the tab away). */
  onBack: () => void;
  /** A channel/group was created; `chatId` is the parent's opaque chat id. */
  onCreated: (chatId: string) => void;
  onCreateChannel: (title: string, about: string) => Promise<string>;
  onCreateGroup: (title: string, memberIDs: number[]) => Promise<string>;
  onSearchUsers: (query: string) => Promise<KNewChatMember[]>;
  /** Localized failure / not-yet-available hints. */
  onToast: (message: string) => void;
}

/** tweb's SelectorSearch debounce. */
const SEARCH_DEBOUNCE_MS = 250;
/** The duck placeholder asset (copied from tweb public/assets/tgs). */
const EMPTY_SEARCH_LOTTIE = "/assets/tgs/UtyanSearch.json";
/** Web K caps both the channel/group title and the channel description. */
const TITLE_MAX_LENGTH = 128;
const DESCRIPTION_MAX_LENGTH = 255;
/** tweb's InputField grows with its content up to about ten lines. */
const DESCRIPTION_MAX_HEIGHT = 200;

const PEER_COLOR_COUNT = PEER_COLOR_NAMES.length;

/**
 * The avatar gradient bucket of a search result: the server sends it already
 * (`abs(userID) % 7`), the numeric user id is the fallback.
 */
function memberColorName(member: KNewChatMember): string {
  const colorIndex =
    typeof member.colorIndex === "number" && Number.isFinite(member.colorIndex)
      ? member.colorIndex
      : Math.abs(Math.trunc(member.id));
  return PEER_COLOR_NAMES[Math.abs(colorIndex) % PEER_COLOR_COUNT];
}

/** A Web K peer avatar: the photo, or the letter on the peer-colour gradient. */
function MemberAvatar({
  member,
  size,
  className,
}: {
  member: KNewChatMember;
  size: number;
  className?: string;
}) {
  return (
    <div
      className={
        className
          ? `avatar avatar-like avatar-gradient ${className}`
          : "avatar avatar-like avatar-gradient"
      }
      data-color={memberColorName(member)}
      style={{ "--size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {member.avatarUrl ? (
        <img
          className="avatar-photo"
          src={member.avatarUrl}
          alt=""
          draggable={false}
          decoding="async"
        />
      ) : (
        chatAbbreviation(member.name).toUpperCase()
      )}
    </div>
  );
}

/**
 * The empty-search duck (`components/emptySearchPlaceholder` in tweb): a 156px
 * one-shot lottie above "No results / Try searching.". The whole block is
 * rendered even when the animation cannot be fetched, only the duck is skipped.
 */
function EmptySearchPlaceholder() {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let animation: AnimationItem | null = null;
    let revealTimer = 0;

    const reveal = () => {
      if (!cancelled) setDrawn(true);
    };

    const load = async () => {
      try {
        const response = await fetch(EMPTY_SEARCH_LOTTIE);
        if (!response.ok) {
          throw new Error(`lottie ${response.status}`);
        }
        const animationData: unknown = await response.json();
        const lottie = (await import("lottie-web")).default;
        if (cancelled) return;
        animation = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        // The lottie component fades in with its first painted frame; the
        // timeout is the safety net for an animation that never schedules one.
        animation.addEventListener("DOMLoaded", reveal);
        animation.addEventListener("enterFrame", reveal);
        revealTimer = window.setTimeout(reveal, 400);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      animation?.destroy();
      animation = null;
    };
  }, []);

  return (
    <div className="k-empty-search" role="status">
      {failed ? null : (
        <div
          ref={hostRef}
          className={
            drawn ? "k-empty-search-lottie is-drawn" : "k-empty-search-lottie"
          }
          aria-hidden="true"
        />
      )}
      <div className="k-empty-search-copy">
        <div className="k-empty-search-title">
          {t("kNewChat.noResultsTitle")}
        </div>
        <div className="k-empty-search-subtitle">
          {t("kNewChat.noResultsSubtitle")}
        </div>
      </div>
    </div>
  );
}

/** One search result: avatar, name/@username and the selection check. */
function MemberRow({
  member,
  selected,
  onToggle,
}: {
  member: KNewChatMember;
  selected: boolean;
  onToggle: (member: KNewChatMember) => void;
}) {
  const ripple = useRipple<HTMLButtonElement>();

  return (
    <button
      ref={ripple.ref}
      type="button"
      className={
        selected
          ? "k-person-row k-newchat-person rp rp-overflow is-selected"
          : "k-person-row k-newchat-person rp rp-overflow"
      }
      aria-pressed={selected}
      onClick={() => onToggle(member)}
    >
      <MemberAvatar member={member} size={42} className="k-newchat-avatar" />
      <span className="k-person-row-texts">
        <span className="k-person-row-name">{member.name}</span>
        {member.username ? (
          <span className="k-person-row-status">@{member.username}</span>
        ) : null}
      </span>
      <span className="k-person-row-check" aria-hidden="true">
        <KIcon name="check" />
      </span>
    </button>
  );
}

/**
 * The Web K "New Channel" / "New Group" flows, ported from tweb's
 * `sidebarLeft/tabs/newChannel.tsx`, `newGroup.tsx` and `addMembers.tsx`:
 *
 * - `kind="channel"`: one page — avatar edit, channel name + description, the
 *   section caption under the card and the corner arrow (visible once the name
 *   is not blank).
 * - `kind="group"`: the group-name page, then the "Add Members" page pushed
 *   over it. Both pages are absolute layers inside the tab: the outgoing layer
 *   moves a quarter of the width towards the start and dims, the incoming one
 *   slides in from the full width (tweb TransitionSlider 'navigation').
 */
export function KNewChatFlow({
  kind,
  onBack,
  onCreated,
  onCreateChannel,
  onCreateGroup,
  onSearchUsers,
  onToast,
}: KNewChatFlowProps): JSX.Element {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [membersPage, setMembersPage] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<KNewChatMember[]>([]);
  const [selected, setSelected] = useState<Map<number, KNewChatMember>>(
    () => new Map(),
  );
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const searchUsersRef = useRef(onSearchUsers);

  // The parent usually passes an inline callback; keep the debounce effect from
  // restarting just because that callback's identity changed.
  useEffect(() => {
    searchUsersRef.current = onSearchUsers;
  }, [onSearchUsers]);

  const avatarRipple = useRipple<HTMLButtonElement>();
  const formNextRipple = useRipple<HTMLButtonElement>();
  const membersNextRipple = useRipple<HTMLButtonElement>();

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !creating;
  const selectedMembers = Array.from(selected.values());
  const titlePlaceholder =
    kind === "channel"
      ? t("kNewChat.channelName")
      : t("kNewChat.groupName");

  // The description field grows with its text like tweb's `withLinebreaks`
  // InputField, staying at the 48px single-line height while it is empty.
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(
      element.scrollHeight,
      DESCRIPTION_MAX_HEIGHT,
    )}px`;
  }, [description]);

  // The search of the add-members page: debounced, with out-of-order responses
  // dropped (the request counter is bumped by every new query and unmount).
  useEffect(() => {
    if (!membersPage) return;

    const requestId = ++searchRequestRef.current;
    const needle = query.trim();
    if (!needle) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchUsersRef.current(needle).then(
        (members) => {
          if (requestId !== searchRequestRef.current) return;
          const unique = new Map<number, KNewChatMember>();
          for (const member of members) unique.set(member.id, member);
          setSuggestions(Array.from(unique.values()));
          setSearching(false);
        },
        () => {
          if (requestId !== searchRequestRef.current) return;
          setSuggestions([]);
          setSearching(false);
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      searchRequestRef.current += 1;
    };
  }, [query, membersPage]);

  // tweb's add-members search field is focused as soon as the page is shown.
  useEffect(() => {
    if (!membersPage) return;
    const timer = window.setTimeout(() => {
      searchFieldRef.current?.querySelector("input")?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [membersPage]);

  const toggleMember = (member: KNewChatMember) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(member.id)) {
        next.delete(member.id);
      } else {
        next.set(member.id, member);
      }
      return next;
    });
  };

  const openMembers = () => {
    if (!trimmedTitle) return;
    setMembersPage(true);
  };

  const createChannel = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const chatId = await onCreateChannel(trimmedTitle, description.trim());
      onCreated(chatId);
    } catch {
      onToast(t("kNewChat.createFailed"));
      setCreating(false);
    }
  };

  const createGroup = async () => {
    if (creating || !trimmedTitle) return;
    setCreating(true);
    try {
      const chatId = await onCreateGroup(
        trimmedTitle,
        selectedMembers.map((member) => member.id),
      );
      onCreated(chatId);
    } catch {
      onToast(t("kNewChat.createFailed"));
      setCreating(false);
    }
  };

  const onTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!canSubmit) return;
    if (kind === "channel") {
      void createChannel();
    } else {
      openMembers();
    }
  };

  const nameAriaLabel = titlePlaceholder;

  return (
    <div className="k-page k-newchat-flow">
      <div className="k-newchat-pages">
        {/* ---------- the channel/group form ---------- */}
        <div
          className={
            membersPage
              ? "k-newchat-layer k-newchat-form is-covered"
              : "k-newchat-layer k-newchat-form is-active"
          }
          aria-hidden={membersPage || undefined}
          inert={membersPage || undefined}
        >
          <KSuperTabHeader
            title={
              kind === "channel"
                ? t("kNewChat.newChannel")
                : t("kNewChat.newGroup")
            }
            onBack={onBack}
            backLabel={t("kNewChat.back")}
          />
          <div className="k-super-tab-content">
            <KScrollArea className="k-newchat-scroll">
              <div className="k-section-container k-newchat-section-container">
                <div className="k-section k-newchat-card">
                  <button
                    ref={avatarRipple.ref}
                    type="button"
                    className="k-avatar-edit rp"
                    aria-label={t("kNewChat.avatarHint")}
                    onClick={() => onToast(t("kNewChat.avatarSoon"))}
                  >
                    <KIcon name="cameraadd" className="k-avatar-edit-icon" />
                  </button>
                  <div className="k-input-wrapper">
                    <div className="k-input-field">
                      <input
                        className="k-input-field-input"
                        type="text"
                        value={title}
                        maxLength={TITLE_MAX_LENGTH}
                        placeholder={titlePlaceholder}
                        aria-label={nameAriaLabel}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={onTitleKeyDown}
                      />
                    </div>
                    {kind === "channel" ? (
                      <div className="k-input-field">
                        <textarea
                          ref={descriptionRef}
                          className="k-input-field-input k-newchat-description"
                          value={description}
                          maxLength={DESCRIPTION_MAX_LENGTH}
                          placeholder={t("kNewChat.descriptionOptional")}
                          aria-label={t("kNewChat.descriptionOptional")}
                          rows={1}
                          spellCheck={false}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                {kind === "channel" ? (
                  <div className="k-section-caption k-newchat-channel-hint">
                    {t("kNewChat.channelDescriptionHint")}
                  </div>
                ) : null}
              </div>
            </KScrollArea>
          </div>
          <button
            ref={formNextRipple.ref}
            type="button"
            className={
              trimmedTitle
                ? "btn-corner btn-circle k-newchat-next is-visible"
                : "btn-corner btn-circle k-newchat-next"
            }
            aria-label={t("kNewChat.next")}
            disabled={!canSubmit}
            onClick={() => {
              if (kind === "channel") {
                void createChannel();
              } else {
                openMembers();
              }
            }}
          >
            <KIcon name="arrow_next" className="k-newchat-next-icon" />
          </button>
        </div>

        {/* ---------- the add-members page (groups only) ---------- */}
        {kind === "group" ? (
          <div
            className={
              membersPage
                ? "k-newchat-layer k-newchat-members is-open"
                : "k-newchat-layer k-newchat-members"
            }
            aria-hidden={!membersPage || undefined}
            inert={!membersPage || undefined}
          >
            <KSuperTabHeader
              title={t("kNewChat.addMembers")}
              onBack={() => setMembersPage(false)}
              backLabel={t("kNewChat.back")}
            />
            <div ref={searchFieldRef} className="k-newchat-search">
              <KSearchField
                value={query}
                onChange={setQuery}
                placeholder={t("kNewChat.searchPeople")}
              />
            </div>
            <div className="k-super-tab-content">
              <KScrollArea className="k-newchat-scroll">
                {selectedMembers.length > 0 ? (
                  <div className="k-section-container">
                    <div className="k-section k-newchat-selected">
                      <div className="k-newchat-selected-head">
                        <span className="k-newchat-selected-title">
                          {t("kNewChat.members")}
                        </span>
                        <span className="k-newchat-selected-count">
                          {t("kNewChat.membersSelected", {
                            count: selectedMembers.length,
                          })}
                        </span>
                      </div>
                      <div className="k-newchat-chips">
                        {selectedMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className="k-newchat-chip"
                            aria-pressed={true}
                            onClick={() => toggleMember(member)}
                          >
                            <MemberAvatar
                              member={member}
                              size={24}
                              className="k-newchat-chip-avatar"
                            />
                            <span className="k-newchat-chip-name">
                              {member.name}
                            </span>
                            <KIcon
                              name="close"
                              className="k-newchat-chip-close"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="k-section-container">
                  {searching ? (
                    <div className="k-newchat-loading" role="status">
                      <span className="k-newchat-spinner" aria-hidden="true" />
                      <span>{t("kNewChat.loading")}</span>
                    </div>
                  ) : suggestions.length > 0 ? (
                    <div className="k-section k-newchat-results">
                      {suggestions.map((member) => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          selected={selected.has(member.id)}
                          onToggle={toggleMember}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="k-newchat-empty-search">
                      <EmptySearchPlaceholder />
                    </div>
                  )}
                </div>
              </KScrollArea>
            </div>
            <button
              ref={membersNextRipple.ref}
              type="button"
              className="btn-corner btn-circle k-newchat-next is-visible"
              aria-label={t("kNewChat.next")}
              disabled={creating}
              onClick={() => void createGroup()}
            >
              <KIcon name="arrow_next" className="k-newchat-next-icon" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
