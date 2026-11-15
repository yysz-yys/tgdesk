import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { StickerSetDetail, StickerSetInfo } from "../../types";
import {
  archiveSet,
  installSet,
  loadStickerPacks,
  loadStickerSet,
  networkKey,
  uninstallSet,
  type PickerNetwork,
} from "../../lib/stickerApi";
import { KIcon } from "./KIcon";
import { KStickerMedia } from "./KStickerMedia";
import { useScrollThumb } from "./KScrollArea";
import { closeStickerPopup, useStickerPopup } from "./stickerPopupStore";

export interface KStickerSetPopupHostProps {
  /** Kernel transport settings; without them the popup cannot load a set. */
  proxy?: string;
  ntp?: string;
  /** False when the app runs with animations disabled (tweb lite mode 0). */
  animationsEnabled?: boolean;
  /** The account has Telegram Premium: tweb hides the effect lock badges. */
  premiumLocksHidden?: boolean;
  onToast: (message: string) => void;
}

/**
 * Renders the sticker-set preview popup at the page level (App places this in
 * KMainScreen's overlay slot, outside the translated #column-center).
 */
export function KStickerSetPopupHost({
  proxy,
  ntp,
  animationsEnabled = true,
  premiumLocksHidden = false,
  onToast,
}: KStickerSetPopupHostProps) {
  const { set, open } = useStickerPopup();
  const network = useMemo<PickerNetwork | undefined>(
    () => (proxy === undefined ? undefined : { proxy, ntp: ntp ?? "" }),
    [ntp, proxy],
  );
  if (!set) return null;
  return (
    <KStickerSetPopup
      // A different set is a different popup: restart loading and the scroll.
      key={set.ref}
      set={set}
      open={open}
      network={network}
      animationsEnabled={animationsEnabled}
      premiumLocksHidden={premiumLocksHidden}
      onToast={onToast}
    />
  );
}

interface KStickerSetPopupProps {
  set: StickerSetInfo;
  open: boolean;
  network?: PickerNetwork;
  /** False when the app runs with animations disabled (tweb lite mode 0). */
  animationsEnabled?: boolean;
  /** The account has Telegram Premium: tweb hides the effect lock badges. */
  premiumLocksHidden?: boolean;
  onToast: (message: string) => void;
}

/**
 * Telegram Web K's sticker-set popup — tweb `components/popups/stickers.tsx`
 * over `PopupElement` (`scss/partials/popups/_popup.scss`) and the
 * `.popup-stickers` overrides in `_stickers.scss`:
 *
 * - 420x420 modal, 40px radius, dimmed 30% black page behind;
 * - a 56px header (close, 20/26 bold set title, three-dot menu), a 5-column
 *   grid of 80px looping sticker cells, and a floating footer whose white
 *   gradient fades the last row out under the 48px pill button;
 * - the footer button installs the set (blue) or uninstalls it (framed red);
 *   the menu copies the t.me link and archives an installed set;
 * - Esc / the backdrop closes it.
 */
function KStickerSetPopup({
  set,
  open,
  network,
  animationsEnabled = true,
  premiumLocksHidden = false,
  onToast,
}: KStickerSetPopupProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<StickerSetDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [installed, setInstalled] = useState(set.installed === true);
  const [busy, setBusy] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { thumbRef, onThumbMouseDown } = useScrollThumb(scrollRef);
  const networkSignature = network ? networkKey(network) : "";
  // tweb mounts the popup hidden, waits two frames, then adds `.active` so the
  // 150 ms fade/48 px slide-up actually plays. The host keeps the popup mounted
  // for the closing animation, so `entered` starts false on every new set.
  const [entered, setEntered] = useState(false);

  const close = useCallback(() => closeStickerPopup(), []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Load the full set and its installed state together: the pack headers only
  // cache the summary, and an installed set has to be known before the footer
  // button can say ADD or REMOVE.
  useEffect(() => {
    if (!network) {
      setLoadFailed(true);
      return;
    }
    let alive = true;
    setDetail(null);
    setLoadFailed(false);
    void Promise.all([
      loadStickerSet(network, set.ref),
      loadStickerPacks(network).then((packs) =>
        packs.sets.some((item) => item.id === set.id),
      ),
    ])
      .then(([loaded, isInstalled]) => {
        if (!alive) return;
        setDetail(loaded);
        setInstalled(isInstalled || loaded.set.installed === true);
      })
      .catch(() => {
        if (!alive) return;
        setLoadFailed(true);
        onToast(t("stickerSet.notFound"));
        close();
      });
    return () => {
      alive = false;
    };
  }, [close, networkSignature, onToast, set.id, set.ref, t, network]);

  // Esc closes, like tweb's navigation stack does for its popups. Capture
  // phase + stopPropagation so the same key press does not also close the
  // sidebar super tab behind the backdrop. An open Radix menu inside the popup
  // takes the first Esc (tweb's menu does the same).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        document.querySelector('[role="menu"][data-state="open"]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close, open]);

  // tweb reveals the grid only once every sticker of the set has been wrapped
  // (its `await Promise.all(loadPromises)` then `setContainers`). We warm the
  // still frames of the first visible rows the same way: the popup keeps its
  // loading spinner instead of flashing a grid of empty cells while the kernel
  // streams forty thumbnails over the loopback server. Animations then fade in
  // cell by cell (see the per-cell `delay` below).
  const [postersReady, setPostersReady] = useState(false);
  useEffect(() => {
    if (!detail) {
      setPostersReady(false);
      return;
    }
    let alive = true;
    setPostersReady(false);
    const urls = detail.stickers
      .slice(0, 25)
      .map((doc) =>
        doc.kind === "static" ? (doc.photoUrl ?? doc.thumbUrl) : doc.thumbUrl,
      )
      .filter((url): url is string => Boolean(url));
    if (urls.length === 0) {
      setPostersReady(true);
      return;
    }
    let remaining = urls.length;
    const settle = () => {
      remaining -= 1;
      if (remaining <= 0 && alive) setPostersReady(true);
    };
    const timeout = window.setTimeout(() => {
      if (alive) setPostersReady(true);
    }, 2500);
    for (const url of urls) {
      const image = new Image();
      image.onload = settle;
      image.onerror = settle;
      image.src = url;
    }
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [detail]);

  const title = detail?.set.title?.trim() || set.title;
  const count = detail?.set.count ?? set.count;
  const loaded = Boolean(detail) && postersReady;
  const canAdd = !installed;

  const buttonLabel = !loaded
    ? t("stickerSet.loading")
    : installed
      ? t("stickerSet.removeCount", { count })
      : t("stickerSet.addCount", { count });

  const toggleInstalled = async () => {
    if (!network || busy || !loaded) return;
    setBusy(true);
    try {
      if (canAdd) {
        await installSet(network, set.ref);
        setInstalled(true);
      } else {
        await uninstallSet(network, set.ref);
        setInstalled(false);
      }
      // tweb's footer button closes the popup once the toggle resolves.
      close();
    } catch {
      onToast(t("stickerSet.error"));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!set.shortName) return;
    try {
      await navigator.clipboard.writeText(
        `https://t.me/addstickers/${set.shortName}`,
      );
    } catch {
      onToast(t("stickerSet.copyFailed"));
    }
  };

  const archive = async () => {
    if (!network) return;
    try {
      await archiveSet(network, set.ref, true);
      onToast(t("stickerSet.archived"));
      close();
    } catch {
      onToast(t("stickerSet.error"));
    }
  };

  const cells = useMemo(() => detail?.stickers ?? [], [detail]);

  return (
    <div
      className={`popup popup-stickers old${open && entered ? " active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="k-sticker-set-popup-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="popup-container">
        <div className="popup-header">
          <button
            type="button"
            className="btn-icon popup-close"
            aria-label={t("emojiPicker.close")}
            onClick={close}
          >
            <KIcon name="close" className="button-icon" />
          </button>
          <div
            className="popup-title"
            id="k-sticker-set-popup-title"
            dir="auto"
          >
            {loaded ? title : t("stickerSet.loading")}
          </div>
          {loaded ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <button
                  type="button"
                  className="btn-icon popup-menu-button"
                  aria-label={t("stickerSet.more")}
                >
                  <KIcon name="more" className="button-icon" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                className="k-menu"
                side="bottom"
                align="end"
                sideOffset={4}
                // Radix portals menus to <body> with no z-index of their own; the
                // popup layer is z-index 300, so its menu has to be raised too.
                style={{ zIndex: 320 }}
              >
                <DropdownMenu.Item
                  className="btn-menu-item"
                  onSelect={() => void copyLink()}
                >
                  <KIcon name="copy" className="btn-menu-item-icon" />
                  <span className="btn-menu-item-text">
                    {t("stickerSet.copyLink")}
                  </span>
                </DropdownMenu.Item>
                {/* tweb only offers the archive entry for an installed set
                    (`verify: () => isStickerSetAdded`). */}
                {installed ? (
                  <DropdownMenu.Item
                    className="btn-menu-item"
                    onSelect={() => void archive()}
                  >
                    <KIcon name="archive" className="btn-menu-item-icon" />
                    <span className="btn-menu-item-text">
                      {t("stickerSet.archive")}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          ) : null}
        </div>

        <div
          ref={scrollRef}
          className={`scrollable popup-scrollable${loaded ? "" : " is-loading"}${
            atStart ? " scrolled-start" : ""
          }`}
          onScroll={() => {
            const element = scrollRef.current;
            if (!element) return;
            setAtStart(element.scrollTop <= 0);
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
          <div className="popup-body">
            {loadFailed ? null : loaded ? (
              <div className="sticker-set">
                <div className="sticker-set-stickers">
                  {cells.map((doc, index) => (
                    <div
                      key={doc.ref}
                      className="sticker-set-sticker media-sticker-wrapper"
                    >
                      <KStickerMedia
                        doc={doc}
                        lazy
                        enabled={animationsEnabled}
                        withLock={!premiumLocksHidden}
                        delay={Math.min(index, 20) * 40}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="k-popup-loading" role="status">
                <span className="k-newchat-spinner" aria-hidden="true" />
                <span className="sr-only">{t("stickerSet.loading")}</span>
              </div>
            )}
          </div>
        </div>

        {loaded ? (
          <div className="popup-footer popup-footer-abitlarger popup-footer-floating">
            <button
              type="button"
              className={`popup-footer-button btn-primary${
                canAdd ? " btn-color-primary" : " btn-primary-transparent danger"
              }`}
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => void toggleInstalled()}
            >
              {buttonLabel}
            </button>
          </div>
        ) : (
          <div className="popup-footer popup-footer-abitlarger popup-footer-shaded">
            <button
              type="button"
              className="popup-footer-button btn-primary btn-transparent primary text-bold"
              disabled
            >
              {t("stickerSet.loading")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
