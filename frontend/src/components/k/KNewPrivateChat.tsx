import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { KIcon } from "./KIcon";
import { KScrollArea } from "./KScrollArea";
import { KSearchField } from "./KSearchField";
import { formatUserStatus } from "../../data/telegram";
import { ContactAvatar, type KNewChatMember } from "./KNewChatFlow";
import { useRipple } from "./useRipple";
// The page shares the new-chat atoms (rows, avatars, corner button); its own
// rules live in the same stylesheet so a preview route that mounts only this
// component still gets them.
import "../../styles/k/newchat.css";

/** One contact row of the New Private Chat page (`kernel.ContactDTO`). */
export type KNewPrivateContact = KNewChatMember;

export interface KNewPrivateChatProps {
  /** Close the page (the parent animates the super tab away). */
  onBack: () => void;
  /** Open the private chat with this opaque user peer id (`user:<id>:<hash>`). */
  onSelectContact: (peerId: string) => void;
  /** Load the account's saved contacts, unfiltered and unsorted. */
  onLoadContacts: () => Promise<KNewPrivateContact[]>;
  /** Corner `+` — the create-contact popup is not part of tgdesk yet. */
  onAddContact?: () => void;
  /** Localized failure hints. */
  onToast?: (message: string) => void;
}

/** tweb's `appSettings.contactsSortMode`: by last seen, then by name. */
type ContactSortMode = "online" | "name";

/** tweb's `appSettings.contactsSortMode` default is "online" (by last seen). */
const DEFAULT_SORT_MODE: ContactSortMode = "online";
const SORT_STORAGE_KEY = "tgdesk.k.contactsSortMode";

function readSortMode(): ContactSortMode {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === "name"
      ? "name"
      : DEFAULT_SORT_MODE;
  } catch {
    return DEFAULT_SORT_MODE;
  }
}

/** Web K sorts names the way the OS collator does (case/diacritics-insensitive). */
const nameCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

/**
 * Web K's `sortContacts` for the two modes the contacts tab offers: "name" is
 * an A–Z collation, "online" puts online users first, then the most recently
 * seen (the presence buckets with no exact timestamp follow), with the name as
 * the tie-breaker so the order is stable.
 */
function compareContacts(
  a: KNewPrivateContact,
  b: KNewPrivateContact,
  mode: ContactSortMode,
): number {
  if (mode === "online") {
    const aOnline = a.online ? 1 : 0;
    const bOnline = b.online ? 1 : 0;
    if (aOnline !== bOnline) return bOnline - aOnline;
    const aSeen = a.lastSeen ?? 0;
    const bSeen = b.lastSeen ?? 0;
    if (aSeen !== bSeen) return bSeen - aSeen;
  }
  const byName = nameCollator.compare(a.name, b.name);
  if (byName !== 0) return byName;
  return a.id - b.id;
}

/** `formatUserStatus` with the page's i18n; falls back to `@username`. */
function contactStatusText(
  contact: KNewPrivateContact,
  t: TFunction,
  language: string,
): string | undefined {
  return (
    formatUserStatus(
      contact.online,
      contact.status,
      contact.lastSeen,
      t,
      language,
    ) ?? (contact.username ? `@${contact.username}` : undefined)
  );
}

function ContactRow({
  contact,
  status,
  onSelect,
}: {
  contact: KNewPrivateContact;
  status: string | undefined;
  onSelect: (contact: KNewPrivateContact) => void;
}) {
  const ripple = useRipple<HTMLButtonElement>();

  return (
    <button
      ref={ripple.ref}
      type="button"
      className="k-person-row k-newprivate-person rp rp-overflow"
      onClick={() => onSelect(contact)}
    >
      <ContactAvatar
        member={contact}
        size={42}
        className="k-newprivate-avatar"
        online={contact.online}
      />
      <span className="k-person-row-texts">
        <span className="k-person-row-name">{contact.name}</span>
        {status ? (
          <span className="k-person-row-status">{status}</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The New Private Chat page — what the pencil menu's "New Private Chat" opens in
 * Web K: the **Contacts** super tab (`sidebarLeft/tabs/contacts.tsx`), not a
 * picker. The header's title is replaced by the search pill, a sort button is
 * appended at the header end, and the body is the account's contact list. With
 * zero saved contacts the body is simply empty (reference image 6 shows exactly
 * that: back arrow, focused search pill, sort glyph, blank body, corner `+`).
 *
 * - Rows: 56px, 42px avatar (photo or peer-colour gradient + online dot), name
 *   16/21 and the presence/username line, exactly the ContactsList row.
 * - Sorting: by last seen (default) or by name, persisted like tweb's
 *   `appSettings.contactsSortMode`. The glyph is the mode the button switches
 *   to (`sortName`/`sortOnline`), matching tweb `replaceButtonIcon`.
 * - The corner `+` opens the create-contact popup in tweb; tgdesk has no
 *   contacts.addContact flow yet, so the parent shows the addSoon hint.
 * - Search filters locally (tweb does not call contacts.search here).
 */
export function KNewPrivateChat({
  onBack,
  onSelectContact,
  onLoadContacts,
  onAddContact,
  onToast,
}: KNewPrivateChatProps): JSX.Element {
  const { t, i18n } = useTranslation();

  const [contacts, setContacts] = useState<KNewPrivateContact[]>([]);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ContactSortMode>(readSortMode);
  const [loaded, setLoaded] = useState(false);

  const searchHostRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoadContacts);
  const toastRef = useRef(onToast);
  const addRipple = useRipple<HTMLButtonElement>();
  const sortRipple = useRipple<HTMLButtonElement>();

  useEffect(() => {
    loadRef.current = onLoadContacts;
  }, [onLoadContacts]);
  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  // Load once; a late answer after the page closed is dropped.
  useEffect(() => {
    let cancelled = false;
    void loadRef.current().then(
      (rows) => {
        if (cancelled) return;
        setContacts(Array.isArray(rows) ? rows : []);
        setLoaded(true);
      },
      () => {
        if (cancelled) return;
        // Web K shows the empty body while the contact list is unavailable;
        // there is no separate error state on this page to paint.
        setContacts([]);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // tweb focuses the contacts search once the tab has slid in — on desktops
  // only (`IS_MOBILE || !canFocus`), and the reference shows the focused pill.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const timer = window.setTimeout(() => {
      searchHostRef.current?.querySelector("input")?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = needle
      ? contacts.filter((contact) => {
          const name = contact.name.toLocaleLowerCase();
          const username = (contact.username ?? "").toLocaleLowerCase();
          return name.includes(needle) || username.includes(needle);
        })
      : contacts;
    return [...filtered].sort((a, b) => compareContacts(a, b, sortMode));
  }, [contacts, query, sortMode]);

  const toggleSortMode = () => {
    setSortMode((current) => {
      const next = current === "online" ? "name" : "online";
      try {
        localStorage.setItem(SORT_STORAGE_KEY, next);
      } catch {
        // Quota/privacy-mode failures only cost the next launch's default.
      }
      return next;
    });
  };

  const handleSelect = (contact: KNewPrivateContact) => {
    if (!contact.peerId) {
      // Without the opaque peer id the chat cannot be opened; this only
      // happens if the parent wiring drops the field.
      toastRef.current?.(t("kNewChat.createFailed"));
      return;
    }
    onSelectContact(contact.peerId);
  };

  return (
    <div className="k-page k-newprivate-page">
      {/* tweb replaces the header's title with the search pill and appends the
       * sort button at the header end. */}
      <div className="sidebar-header k-super-tab-header k-newprivate-header">
        <button
          type="button"
          className="btn-icon sidebar-close-button"
          aria-label={t("kNewChat.back")}
          onClick={onBack}
        >
          <KIcon name="left" className="button-icon" />
        </button>
        <div ref={searchHostRef} className="k-newprivate-search">
          <KSearchField
            value={query}
            onChange={setQuery}
            placeholder={t("common.search")}
            oldStyle={false}
          />
        </div>
        <button
          ref={sortRipple.ref}
          type="button"
          className="btn-icon k-newprivate-sort"
          aria-label={t("kContacts.sortAria")}
          onClick={toggleSortMode}
        >
          <KIcon
            name={sortMode === "online" ? "sort_name" : "sort_online"}
            className="button-icon"
          />
        </button>
      </div>
      <div className="k-super-tab-content">
        <KScrollArea className="k-newprivate-scroll">
          {loaded && visibleContacts.length > 0 ? (
            <div className="k-newprivate-list">
              {visibleContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  status={contactStatusText(contact, t, i18n.language)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : null}
        </KScrollArea>
      </div>
      <button
        ref={addRipple.ref}
        type="button"
        className="btn-corner btn-circle is-visible k-newprivate-add"
        aria-label={t("kContacts.addContact")}
        onClick={onAddContact}
      >
        <KIcon name="add" className="k-newprivate-add-icon" />
      </button>
    </div>
  );
}
