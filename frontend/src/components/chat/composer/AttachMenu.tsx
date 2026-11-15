import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { ComposerButton } from "./ComposerButton";

/**
 * Telegram attach menu: the generic `.btn-menu` from Web K (min-width 180px,
 * 16px radius, 32px rows, 20px icons, blurred translucent surface) with only
 * the entries this build can actually send — Photo or Video and Document both
 * open the native file picker (`AppService.ChooseFiles`). Media-restricted
 * chats get the attach button disabled instead of dead rows.
 */
export function AttachMenu({
  canSendMedia = true,
  onPick,
}: {
  canSendMedia?: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  if (!canSendMedia) {
    return null;
  }

  return (
    <div
      className="tg-composer__menu"
      role="menu"
      aria-label={t("input.attach")}
      data-composer-popover
    >
      <ComposerButton
        role="menuitem"
        className="tg-composer__menu-item"
        onClick={onPick}
      >
        <Icon name="photo" size={20} />
        <span>{t("input.attachPhotoVideo")}</span>
      </ComposerButton>
      <ComposerButton
        role="menuitem"
        className="tg-composer__menu-item"
        onClick={onPick}
      >
        <Icon name="description" size={20} />
        <span>{t("input.attachDocument")}</span>
      </ComposerButton>
    </div>
  );
}
