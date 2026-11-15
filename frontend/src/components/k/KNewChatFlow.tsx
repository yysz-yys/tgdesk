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
import { formatUserStatus } from "../../data/telegram";
import { useRipple } from "./useRipple";
// These page styles are self-imported here (the pattern ChatComposer and the
// other component-local stylesheets use): styles/k/k.css imports this file on
// the branch that mounts the flow, and the dev preview routes mount the
// component directly, so both see the rules.
import "../../styles/k/newchat.css";

/** A user row returned by the add-members search (`kernel.ContactDTO`). */
export interface KNewChatMember {
  id: number;
  /** Opaque user peer id; only used by the pickers' status line. */
  peerId?: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  colorIndex?: number;
  online?: boolean;
  lastSeen?: number;
  status?: string;
}

export interface KNewChatFlowProps {
  /** Which creation flow the tab hosts: a broadcast channel or a basic group. */
  kind: "channel" | "group";
  /** Close the whole flow (the parent animates the tab away). */
  onBack: () => void;
  /**
   * A channel/group was created; `chatId` is the parent's opaque chat id and
   * `photoBase64` is the JPEG data URL picked on the page (the parent uploads it
   * with SetChatPhoto after the chat exists, exactly like Web K does).
   */
  onCreated: (chatId: string, photoBase64?: string) => void;
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
/** tweb crops avatar uploads to a square and caps the result at 800×800. */
const AVATAR_MAX_SIZE = 800;
const AVATAR_JPEG_QUALITY = 0.9;

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

/**
 * A Web K peer avatar: the photo, or the letter on the peer-colour gradient,
 * plus the online dot the contact list shows for online users. Shared with the
 * New Private Chat page so both lists paint the same row.
 */
export function ContactAvatar({
  member,
  size,
  className,
  online,
}: {
  member: KNewChatMember;
  size: number;
  className?: string;
  online?: boolean;
}) {
  return (
    <div
      className={[
        "avatar avatar-like avatar-gradient",
        online ? "is-online" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
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

/** One search result: a leading square checkbox, the avatar and the name. */
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
      <span className="k-newchat-check" aria-hidden="true">
        <KIcon name="check" />
      </span>
      <ContactAvatar member={member} size={42} className="k-newchat-avatar" />
      <span className="k-person-row-texts">
        <span className="k-person-row-name">{member.name}</span>
        {member.username ? (
          <span className="k-person-row-status">@{member.username}</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Decodes a picked image file into an `<img>`; rejects for a file the WebView
 * cannot decode (the picker accepts `image/*`, which includes formats such as
 * HEIC that the canvas cannot read).
 */
function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    image.src = url;
  });
}

/**
 * Centre-crops the decoded image to a square and resizes it to at most 800×800,
 * encoded as a JPEG — the result Web K hands to AvatarEdit's canvas and later
 * uploads (`finalRender/createFinalResult.ts: AVATAR_PHOTO_MAX = 800`).
 */
function cropAvatarDataUrl(image: HTMLImageElement): string {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) {
    throw new Error("empty image");
  }
  const size = Math.min(sourceSize, AVATAR_MAX_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas unavailable");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    Math.floor((image.naturalWidth - sourceSize) / 2),
    Math.floor((image.naturalHeight - sourceSize) / 2),
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
}

/**
 * The 120px avatar-edit circle (`AvatarEdit` in tweb): a camera glyph over the
 * peer-colour gradient until a photo is picked, the cropped square afterwards
 * with the same glyph as a hover affordance. The hidden file input opens on
 * click and is reset so picking the same file twice still fires.
 */
function AvatarEdit({
  photo,
  busy,
  disabled,
  hint,
  onPick,
}: {
  photo: string | null;
  busy: boolean;
  disabled: boolean;
  hint: string;
  onPick: (file: File) => void;
}) {
  const ripple = useRipple<HTMLButtonElement>(busy || disabled);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="k-avatar-edit-host">
      <button
        ref={ripple.ref}
        type="button"
        className={[
          "k-avatar-edit",
          "rp",
          photo ? "is-with-photo" : "",
          busy ? "is-loading" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={hint}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {photo ? (
          <img
            className="k-avatar-edit-photo"
            src={photo}
            alt=""
            draggable={false}
          />
        ) : null}
        <KIcon name="cameraadd" className="k-avatar-edit-icon" />
        {busy ? (
          <span className="k-avatar-edit-spinner" aria-hidden="true" />
        ) : null}
      </button>
      <input
        ref={inputRef}
        className="k-avatar-edit-input"
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so selecting the same file again re-fires `change`.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

/**
 * The title Web K prefills on the New Group page when the field is empty: with
 * 2–4 selected invitees it joins the first two names with " & " and the rest
 * with ", " (`newGroup.tsx:247-257`); outside that range it leaves the field
 * empty.
 */
function suggestedGroupTitle(members: KNewChatMember[]): string {
  if (members.length < 2 || members.length > 4) return "";
  const names = members
    .map((member) => member.name.trim())
    .filter((name) => name.length > 0);
  if (names.length < 2) return "";
  return [`${names[0]} & ${names[1]}`, ...names.slice(2)].join(", ");
}

/**
 * The Web K "New Channel" / "New Group" flows, ported from tweb's
 * `sidebarLeft/tabs/newChannel.tsx`, `newGroup.tsx`, `addMembers.tsx`,
 * `createNewGroupTab.ts` and `appSelectPeers.tsx`:
 *
 * - `kind="channel"`: one page — avatar edit, channel name + description, the
 *   section caption under the card and the corner arrow (visible once the name
 *   is not blank).
 * - `kind="group"`: the official order is Add Members **first** (image 4) and
 *   the New Group name/photo page second (image 5). The Add Members page's
 *   corner arrow is always visible (`skippable`), selected members become chips
 *   inside the search row, and the name page lists them under a Members section
 *   while its arrow only appears once the name is non-empty.
 * - Both flows grow the corner `+` FAB into the arrow, and the avatar circle
 *   opens the image picker; the picked file is centre-cropped to a ≤800×800
 *   JPEG and uploaded by the parent after the chat exists (Web K's two-step,
 *   because channels.createChannel/messages.createChat take no photo).
 *
 * The two pages are absolute layers inside the tab: the outgoing layer moves a
 * quarter of the width towards the start and dims, the incoming one slides in
 * from the full width (tweb TransitionSlider 'navigation').
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
  const { t, i18n } = useTranslation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Add Members first for groups; the channel flow only has its form page.
  const [step, setStep] = useState<"members" | "form">(() =>
    kind === "group" ? "members" : "form",
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<KNewChatMember[]>([]);
  const [selected, setSelected] = useState<Map<number, KNewChatMember>>(
    () => new Map(),
  );
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const searchRequestRef = useRef(0);
  const searchUsersRef = useRef(onSearchUsers);

  // The parent usually passes an inline callback; keep the debounce effect from
  // restarting just because that callback's identity changed.
  useEffect(() => {
    searchUsersRef.current = onSearchUsers;
  }, [onSearchUsers]);

  const formNextRipple = useRipple<HTMLButtonElement>();
  const membersNextRipple = useRipple<HTMLButtonElement>();

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !creating;
  const selectedMembers = Array.from(selected.values());
  const membersPage = kind === "group" && step === "members";
  const formActive = kind === "channel" || step === "form";
  const titlePlaceholder =
    kind === "channel"
      ? t("kNewChat.channelName")
      : t("kNewChat.groupName");
  const nameAriaLabel = titlePlaceholder;

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

  // The search of the Add Members page: debounced, with out-of-order responses
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

  // tweb's Add Members page does not focus its search field (the contacts tab
  // does; this page is a plain AppSelectPeers), so the field keeps its resting
  // surface fill — that is exactly the state of reference image 4.

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

  const pickPhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const image = await decodeImageFile(file);
      setPhoto(cropAvatarDataUrl(image));
    } catch {
      onToast(t("kNewChat.photoFailed"));
    } finally {
      setPhotoBusy(false);
    }
  };

  /** Add Members' corner arrow: always available (tweb's `skippable`). */
  const openGroupForm = () => {
    if (creating) return;
    if (!title.trim()) {
      const suggestion = suggestedGroupTitle(selectedMembers);
      if (suggestion) setTitle(suggestion);
    }
    setStep("form");
  };

  const backToMembers = () => setStep("members");

  const createChannel = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const chatId = await onCreateChannel(trimmedTitle, description.trim());
      onCreated(chatId, photo ?? undefined);
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
      onCreated(chatId, photo ?? undefined);
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
      void createGroup();
    }
  };

  const memberStatusText = (member: KNewChatMember): string | undefined => {
    const presence = formatUserStatus(
      member.online,
      member.status,
      member.lastSeen,
      t,
      i18n.language,
    );
    if (presence) return presence;
    return member.username ? `@${member.username}` : undefined;
  };

  return (
    <div className="k-page k-newchat-flow">
      <div className="k-newchat-pages">
        {/* ---------- the channel/group name+photo form ---------- */}
        <div
          className={
            formActive
              ? "k-newchat-layer k-newchat-form is-active"
              : "k-newchat-layer k-newchat-form"
          }
          aria-hidden={formActive ? undefined : true}
          inert={formActive ? undefined : true}
        >
          <KSuperTabHeader
            title={
              kind === "channel"
                ? t("kNewChat.newChannel")
                : t("kNewChat.newGroup")
            }
            onBack={kind === "group" ? backToMembers : onBack}
            backLabel={t("kNewChat.back")}
          />
          <div className="k-super-tab-content">
            <KScrollArea className="k-newchat-scroll">
              <div className="k-section-container k-newchat-section-container">
                <div className="k-section k-newchat-card">
                  <AvatarEdit
                    photo={photo}
                    busy={photoBusy}
                    disabled={creating}
                    hint={t("kNewChat.avatarHint")}
                    onPick={(file) => void pickPhoto(file)}
                  />
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
              {kind === "group" && selectedMembers.length > 0 ? (
                <div className="k-section-container">
                  <div className="k-section k-newchat-members-card">
                    <div className="k-section-name k-newchat-members-name">
                      {t("kNewChat.membersCount", {
                        count: selectedMembers.length,
                      })}
                    </div>
                    {selectedMembers.map((member) => {
                      const status = memberStatusText(member);
                      return (
                        <div
                          key={member.id}
                          className="k-person-row k-newchat-member-cell"
                        >
                          <ContactAvatar
                            member={member}
                            size={42}
                            className="k-newchat-avatar"
                          />
                          <span className="k-person-row-texts">
                            <span className="k-person-row-name">
                              {member.name}
                            </span>
                            {status ? (
                              <span className="k-person-row-status">
                                {status}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
                void createGroup();
              }
            }}
          >
            <KIcon name="arrow_next" className="k-newchat-next-icon" />
          </button>
        </div>

        {/* ---------- the Add Members page (groups only, page 1) ---------- */}
        {kind === "group" ? (
          <div
            className={
              membersPage
                ? "k-newchat-layer k-newchat-members is-open"
                : "k-newchat-layer k-newchat-members"
            }
            aria-hidden={membersPage ? undefined : true}
            inert={membersPage ? undefined : true}
          >
            <KSuperTabHeader
              title={t("kNewChat.addMembers")}
              onBack={onBack}
              backLabel={t("kNewChat.back")}
            />
            {/* tweb's `.selector-search`: a wrapping flex row holding the
             * selected `.selector-user` chips and the InputSearch pill. A chip
             * is clicked to remove the member (SelectorSearch's onChipClick),
             * which the hover's danger tint signals. */}
            <div className="k-newchat-search">
              {selectedMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="k-newchat-chip"
                  aria-pressed={true}
                  onClick={() => toggleMember(member)}
                >
                  <ContactAvatar
                    member={member}
                    size={30}
                    className="k-newchat-chip-avatar"
                  />
                  <span className="k-newchat-chip-name">{member.name}</span>
                </button>
              ))}
              <KSearchField
                value={query}
                onChange={setQuery}
                placeholder={t("kNewChat.searchPeople")}
              />
            </div>
            <div className="k-super-tab-content">
              <KScrollArea className="k-newchat-scroll">
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
              onClick={openGroupForm}
            >
              <KIcon name="arrow_next" className="k-newchat-next-icon" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
