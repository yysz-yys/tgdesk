import { useTranslation } from "react-i18next";
import type { GiftInfo } from "../../../types";
import { chatColor, chatInitials } from "../../../data/telegram";

/**
 * Telegram Web K's profile "Gifts" tab (`components/stargifts/stargiftsGrid.tsx`,
 * `viewProfile`): a 3-column grid of square gift cards on the panel surface, the
 * sender's 20px avatar in the inline-start corner (anonymous tile when the
 * sender is hidden) and the limited-gift ribbon over the inline-end corner.
 *
 * Our kernel DTO only carries the sender display name (no peer id/photo) and a
 * boolean for collectible gifts, so the sender chip falls back to a peer-colour
 * initial and the ribbon text comes from the limited-gift i18n keys.
 */
export function GiftList({ gifts }: { gifts: GiftInfo[] }) {
  const { t } = useTranslation();
  const limitedLabel = t("rightPanel.giftLimited");
  const soldOutLabel = t("rightPanel.giftSoldOut");

  if (gifts.length === 0) {
    return <p className="k-info-empty">{t("rightPanel.giftsEmpty")}</p>;
  }

  return (
    <div className="k-info-gifts">
      {gifts.map((gift) => {
        const ribbon = gift.soldOut
          ? soldOutLabel
          : gift.unique
            ? limitedLabel
            : "";
        const title = gift.title || t("rightPanel.gift");
        return (
          <button
            type="button"
            className="k-info-gift"
            key={gift.id}
            title={title}
            aria-label={gift.from ? `${title} — ${gift.from}` : title}
          >
            {gift.from ? (
              <span
                className="k-info-gift-sender"
                style={{ background: chatColor(gift.from) }}
                aria-hidden="true"
              >
                {chatInitials(gift.from)}
              </span>
            ) : (
              <span
                className="k-info-gift-sender is-anonymous"
                aria-hidden="true"
              >
                ?
              </span>
            )}
            {gift.thumbUrl ? (
              <img
                className="k-info-gift-thumb"
                src={gift.thumbUrl}
                alt=""
                loading="lazy"
                draggable={false}
              />
            ) : (
              <span
                className="k-info-gift-thumb"
                style={{ background: chatColor(gift.id) }}
                aria-hidden="true"
              />
            )}
            {ribbon ? (
              <span className="k-info-gift-ribbon" aria-hidden="true">
                <span className="k-info-gift-ribbon-text">{ribbon}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
