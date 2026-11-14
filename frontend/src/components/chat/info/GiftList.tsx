import { useTranslation } from "react-i18next";
import type { GiftInfo } from "../../../types";
import { Icon } from "../../../ui";
import { formatChatTime } from "../../../data/telegram";

/**
 * Telegram Web K's profile "Gifts" tab: a grid of saved star gifts. Every card
 * carries the gift thumbnail, its title, the sender ("from"), the Stars value,
 * the date and a "Unique" badge for limited gifts.
 */
export function GiftList({ gifts }: { gifts: GiftInfo[] }) {
  const { t, i18n } = useTranslation();
  // The Lead owns the locale files; fall back to a glyph until the
  // "rightPanel.giftUnique" translation lands instead of leaking a key name.
  const uniqueLabel = i18n.exists("rightPanel.giftUnique")
    ? t("rightPanel.giftUnique")
    : "★";

  return (
    <div className="f-info-gifts">
      {gifts.map((gift) => {
        const stars = gift.stars ?? 0;
        const date = gift.date
          ? formatChatTime(new Date(gift.date * 1000), i18n.language)
          : "";
        return (
          <div className="f-info-gift" key={gift.id}>
            <span className="f-info-gift-thumb-wrap">
              <Icon
                name="redeem"
                size={26}
                className="f-info-gift-thumb-fallback"
              />
              {gift.thumbUrl ? (
                <img
                  className="f-info-gift-thumb"
                  src={gift.thumbUrl}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              {gift.unique ? (
                <span className="f-info-gift-unique">{uniqueLabel}</span>
              ) : null}
            </span>
            <span className="f-info-gift-title">
              {gift.title || t("rightPanel.gift")}
              {gift.count && gift.count > 1 ? (
                <span className="f-info-gift-count">×{gift.count}</span>
              ) : null}
            </span>
            {gift.from ? (
              <span className="f-info-gift-from">{gift.from}</span>
            ) : null}
            <span className="f-info-gift-footer">
              {stars > 0 ? (
                <span className="f-info-gift-stars">
                  <Icon name="star" size={12} />
                  {stars}
                </span>
              ) : null}
              {date ? <span className="f-info-gift-date">{date}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
