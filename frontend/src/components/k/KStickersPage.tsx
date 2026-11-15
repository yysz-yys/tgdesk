import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StickerDoc, StickerSetInfo } from "../../types";
import {
  installSet,
  loadFeaturedStickerSets,
  loadStickerPacks,
  loadStickerSet,
  networkKey,
  uninstallSet,
  type PickerNetwork,
} from "../../lib/stickerApi";
import { KIcon } from "./KIcon";
import { KSearchField } from "./KSearchField";
import { KStickerMedia } from "./KStickerMedia";
import { openStickerPopup } from "./stickerPopupStore";
import { useScrollThumb } from "./KScrollArea";

/**
 * Fixture data a preview harness can hand the page (no kernel side effects):
 * the featured sets, five preview documents per set and the installed ids.
 */
export interface KStickersPreviewData {
  sets: StickerSetInfo[];
  docs: Record<string, StickerDoc[]>;
  installed: ReadonlySet<string>;
}

export interface KStickersPageProps {
  proxy?: string;
  ntp?: string;
  backLabel: string;
  onBack: () => void;
  onToast: (message: string) => void;
  /** False when the app runs with animations disabled (tweb lite mode 0). */
  animationsEnabled?: boolean;
  /** Dev-preview fixture; only `k-preview.html` passes it. */
  preview?: KStickersPreviewData;
}

/**
 * The "Stickers and Emoji" tab Web K opens from the Stickers tip's "Trending
 * Stickers" link and from Settings' Stickers row.
 *
 * tweb composes this from `sidebarLeft/tabs/stickersAndEmoji.tsx` (the settings
 * page) and its trending body `sidebarRight/tabs/stickers.tsx`: the tab title is
 * replaced by a 44px InputSearch field, and the content is one section per
 * featured pack — pack name over "N stickers", an Add/Added pill at the end, and
 * a row of the pack's first five stickers at 68×68 (`#stickers-container` rules:
 * `.sticker-set` 140px, `.sticker-set-header` 16px inline start + 12px bottom,
 * `.sticker-set-button` 30px, `.sticker-set-stickers` space-around). The pack
 * previews load lazily as a section scrolls in, and the whole pack opens the
 * sticker-set popup; with no chat to send to (the tab opened from the empty
 * column) a sticker press falls through to its pack, as in the reference.
 */
export function KStickersPage({
  proxy,
  ntp,
  backLabel,
  onBack,
  onToast,
  animationsEnabled = true,
  preview,
}: KStickersPageProps) {
  const { t } = useTranslation();
  const network = useMemo<PickerNetwork | null>(
    () =>
      proxy === undefined ? null : { proxy, ntp: ntp ?? "" },
    [ntp, proxy],
  );
  const networkSignature = network ? networkKey(network) : "";
  const [featured, setFeatured] = useState<StickerSetInfo[] | null>(null);
  const [installedSets, setInstalledSets] = useState<StickerSetInfo[]>([]);
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(
    () => new Set(preview?.installed ?? []),
  );
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { thumbRef, onThumbMouseDown } = useScrollThumb(scrollRef);

  useEffect(() => {
    if (preview) {
      setFeatured(preview.sets);
      setInstalledIds(new Set(preview.installed));
      setInstalledSets(
        preview.sets.filter((set) => preview.installed.has(set.id)),
      );
      return;
    }
    if (!network) {
      setFeatured([]);
      return;
    }
    let alive = true;
    void Promise.all([
      loadFeaturedStickerSets(network),
      loadStickerPacks(network),
    ])
      .then(([featuredSets, packs]) => {
        if (!alive) return;
        setFeatured(featuredSets);
        setInstalledSets(packs.sets);
        setInstalledIds(new Set(packs.sets.map((set) => set.id)));
      })
      .catch(() => {
        if (alive) setFeatured([]);
      });
    return () => {
      alive = false;
    };
  }, [network, networkSignature, preview]);

  // The tab behaves like tweb's: the trending list until the search field has
  // text, then every known pack whose title matches. (The reference asks the
  // server with messages.searchStickerSets; the kernel exposes that search only
  // for the composer, so this page filters the trending + installed lists.)
  const searchText = query.trim().toLowerCase();
  const shownSets = useMemo(() => {
    const trending = featured ?? [];
    if (!searchText) return trending;
    const seen = new Set<string>();
    const result: StickerSetInfo[] = [];
    for (const set of [...trending, ...installedSets]) {
      if (seen.has(set.id)) continue;
      seen.add(set.id);
      if (set.title.toLowerCase().includes(searchText)) result.push(set);
    }
    return result;
  }, [featured, installedSets, searchText]);

  const toggleInstalled = async (set: StickerSetInfo) => {
    if (busy.has(set.ref)) return;
    const added = installedIds.has(set.id);
    setBusy((current) => new Set(current).add(set.ref));
    try {
      if (!preview) {
        if (!network) return;
        if (added) {
          await uninstallSet(network, set.ref);
        } else {
          await installSet(network, set.ref);
        }
      }
      setInstalledIds((current) => {
        const next = new Set(current);
        if (added) {
          next.delete(set.id);
        } else {
          next.add(set.id);
        }
        return next;
      });
      setInstalledSets((current) => {
        if (added) {
          return current.filter((item) => item.id !== set.id);
        }
        return current.some((item) => item.id === set.id)
          ? current
          : [...current, set];
      });
    } catch {
      onToast(t("stickerSet.error"));
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(set.ref);
        return next;
      });
    }
  };

  return (
    <div className="k-page k-stickers-page">
      <div
        className={
          scrolled
            ? "sidebar-header k-super-tab-header k-stickers-header is-scrolled"
            : "sidebar-header k-super-tab-header k-stickers-header"
        }
      >
        <button
          type="button"
          className="btn-icon sidebar-close-button"
          aria-label={backLabel}
          onClick={onBack}
        >
          <KIcon name="left" className="button-icon" />
        </button>
        <KSearchField
          value={query}
          onChange={setQuery}
          placeholder={t("stickerSet.searchPlaceholder")}
          oldStyle={false}
        />
      </div>
      <div className="k-super-tab-content">
        <div
          ref={scrollRef}
          className="scrollable k-stickers-scroll"
          onScroll={() => {
            const element = scrollRef.current;
            if (element) setScrolled(element.scrollTop > 0);
          }}
        >
          <div className="scrollable-thumb-container">
            <div
              ref={thumbRef}
              className="scrollable-thumb"
              onMouseDown={onThumbMouseDown}
              aria-hidden="true"
            />
          </div>
          <div className="k-sticker-sets">
            {shownSets.map((set) => (
              <TrendingStickerSet
                key={set.ref}
                set={set}
                installed={installedIds.has(set.id)}
                busy={busy.has(set.ref)}
                network={network}
                previewDocs={preview?.docs[set.ref]}
                animationsEnabled={animationsEnabled}
                onOpen={() => openStickerPopup(set)}
                onToggle={() => void toggleInstalled(set)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_STICKERS = 5;

interface TrendingStickerSetProps {
  set: StickerSetInfo;
  installed: boolean;
  busy: boolean;
  network: PickerNetwork | null;
  /** Dev-preview documents; when absent the row fetches them once visible. */
  previewDocs?: StickerDoc[];
  animationsEnabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

/** One trending pack: its header row and five lazy-loaded sticker previews. */
function TrendingStickerSet({
  set,
  installed,
  busy,
  network,
  previewDocs,
  animationsEnabled,
  onOpen,
  onToggle,
}: TrendingStickerSetProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(previewDocs));
  const [docs, setDocs] = useState<StickerDoc[] | null>(previewDocs ?? null);

  // tweb renders the five empty cells first and wraps the documents once
  // `appStickersManager.getStickerSet` answers; the row only asks for them when
  // it comes near the viewport (a featured page lists hundreds).
  useEffect(() => {
    if (visible) return;
    const element = rowRef.current;
    if (!element) return;
    if (typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || docs || !network) return;
    let alive = true;
    void loadStickerSet(network, set.ref)
      .then((detail) => {
        if (alive) {
          setDocs(detail.stickers.slice(0, PREVIEW_STICKERS));
        }
      })
      .catch(() => {
        if (alive) setDocs([]);
      });
    return () => {
      alive = false;
    };
  }, [docs, network, set.ref, visible]);

  const cells = Math.min(PREVIEW_STICKERS, set.count);

  return (
    <div
      ref={rowRef}
      className="k-sticker-set"
      role="button"
      tabIndex={0}
      data-sticker-set={set.id}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="k-sticker-set-header">
        <div className="k-sticker-set-details">
          <div className="k-sticker-set-name">{set.title}</div>
          <div className="k-sticker-set-count">
            {t("stickerSet.stickerCount", { count: set.count })}
          </div>
        </div>
        <button
          type="button"
          className={`btn-primary btn-color-primary k-sticker-set-button${
            installed ? " is-gray" : ""
          }`}
          aria-pressed={installed}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {installed ? t("stickerSet.added") : t("stickerSet.add")}
        </button>
      </div>
      <div className="k-sticker-set-stickers">
        {Array.from({ length: cells }, (_, index) => {
          const doc = docs?.[index];
          return (
            <div key={doc?.ref ?? index} className="k-sticker-set-sticker">
              {doc ? (
                <KStickerMedia
                  doc={doc}
                  lazy
                  delay={index * 40}
                  enabled={animationsEnabled}
                  withLock
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
