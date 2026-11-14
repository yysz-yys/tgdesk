import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";

/**
 * Minimal Telegram attach menu. Only the two entries that map to the existing
 * native file picker are rendered (report §8: no dead menu items); both entries
 * call the same `onPick`, which opens `AppService.ChooseFiles` through the
 * composer's `onAttach` flow.
 */
export function AttachMenu({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      className="tg-composer__attach-menu"
      role="menu"
      aria-label={t("input.attach")}
      data-composer-popover
    >
      <button
        type="button"
        role="menuitem"
        className="tg-composer__attach-item"
        onClick={onPick}
      >
        <Icon name="photo" size={20} />
        <span>{t("input.attachPhotoVideo")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="tg-composer__attach-item"
        onClick={onPick}
      >
        <Icon name="description" size={20} />
        <span>{t("input.attachDocument")}</span>
      </button>
    </div>
  );
}
