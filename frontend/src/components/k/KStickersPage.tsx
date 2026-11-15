import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StickerSetInfo } from "../../types";
import {
  installSet,
  loadFeaturedStickerSets,
  loadStickerPacks,
  networkKey,
  uninstallSet,
} from "../../lib/stickerApi";
import { KIcon } from "./KIcon";
import { KScrollArea } from "./KScrollArea";
import { KSuperTabHeader } from "./KSuperTab";
import { openStickerPopup } from "./stickerPopupStore";

export interface KStickersPageProps {
  proxy?: string;
  ntp?: string;
  backLabel: string;
  onBack: () => void;
  onToast: (message: string) => void;
}

const FEATURED_LIMIT = 40;

/**
 * The "Stickers and Emoji" settings page, reduced to the block the tips deck
 * links to: Telegram's Trending sticker sets. Web K's full tab also lists the
 * installed and archived sets; this app's sticker management already lives in
 * the composer's picker, so the settings page opens the same trending packs the
 * Stickers tip shows and hands each row to the sticker-set popup.
 *
 * Layout follows the K settings pages (KSuperTabHeader + KScrollArea +
 * `.k-section` rows), so it slides in over the chat list like the real tab.
 */
export function KStickersPage({
  proxy,
  ntp,
  backLabel,
  onBack,
  onToast,
}: KStickersPageProps) {
  const { t } = useTranslation();
  const network = useMemo(
    () => (proxy === undefined ? undefined : { proxy, ntp: ntp ?? "" }),
    [ntp, proxy],
  );
  const networkSignature = network ? networkKey(network) : "";
  const [sets, setSets] = useState<StickerSetInfo[] | null>(null);
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [brokenCovers, setBrokenCovers] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!network) {
      setSets([]);
      return;
    }
    let alive = true;
    void Promise.all([loadFeaturedStickerSets(network), loadStickerPacks(network)])
      .then(([featured, packs]) => {
        if (!alive) return;
        setSets(featured.slice(0, FEATURED_LIMIT));
        setInstalledIds(new Set(packs.sets.map((set) => set.id)));
      })
      .catch(() => {
        if (alive) setSets([]);
      });
    return () => {
      alive = false;
    };
  }, [network, networkSignature]);

  const toggleInstalled = async (set: StickerSetInfo) => {
    if (!network || busy.has(set.ref)) return;
    const added = installedIds.has(set.id);
    setBusy((current) => new Set(current).add(set.ref));
    try {
      if (added) {
        await uninstallSet(network, set.ref);
      } else {
        await installSet(network, set.ref);
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
    } catch {
      onToast(t("emojiPicker.actionFailed"));
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
      <KSuperTabHeader
        title={t("kSettings.stickersAndEmoji")}
        onBack={onBack}
        backLabel={backLabel}
      />
      <div className="k-super-tab-content">
        <KScrollArea className="k-settings-scroll">
          <div className="k-section-container">
            <div className="k-section">
              <div className="k-section-name">{t("tips.trending")}</div>
              {sets === null ? (
                <div className="k-stickers-loading" role="status">
                  <span className="k-newchat-spinner" aria-hidden="true" />
                </div>
              ) : sets.length === 0 ? (
                <div className="k-stickers-empty">{t("tips.stickersEmpty")}</div>
              ) : (
                sets.map((set) => {
                  const installed = installedIds.has(set.id);
                  // The header's cover URL may be an image (set thumbnail) or,
                  // for an animated set thumb, a TGS/WebM file — the <img> then
                  // fails and the fallback glyph stays.
                  const showCover =
                    Boolean(set.coverUrl) && !brokenCovers.has(set.ref);
                  return (
                    <div
                      key={set.ref}
                      className="k-row k-row-clickable k-stickers-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => openStickerPopup(set)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openStickerPopup(set);
                        }
                      }}
                    >
                      <span className="k-stickers-row-cover" aria-hidden="true">
                        {showCover ? (
                          <img
                            src={set.coverUrl}
                            alt=""
                            draggable={false}
                            decoding="async"
                            onError={() =>
                              setBrokenCovers((current) =>
                                new Set(current).add(set.ref),
                              )
                            }
                          />
                        ) : (
                          <KIcon name="stickers_face" />
                        )}
                      </span>
                      <span className="k-row-texts">
                        <span className="k-row-title">{set.title}</span>
                        <span className="k-row-subtitle">
                          {t("emojiPicker.stickerCount", {
                            count: set.count,
                          })}
                        </span>
                      </span>
                      <span className="k-row-right">
                        <button
                          type="button"
                          className={`k-stickers-add${installed ? " is-installed" : ""}`}
                          aria-pressed={installed}
                          disabled={busy.has(set.ref)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleInstalled(set);
                          }}
                        >
                          {installed
                            ? t("emojiPicker.installedSet")
                            : t("emojiPicker.installSet")}
                        </button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </KScrollArea>
      </div>
    </div>
  );
}
