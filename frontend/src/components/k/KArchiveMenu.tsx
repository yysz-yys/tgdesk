import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";

interface KArchiveMenuProps {
  archiveRowVisible: boolean;
  onMarkAllRead: () => void;
  onToggleArchiveRow: () => void;
}

/**
 * The three-dot button in the archived-chats header (tweb archivesTab.tsx
 * appends a ButtonMenuToggle with the `more` icon; the buttons come from
 * getArchiveContextMenuButtons). Styled with tweb's `.btn-menu` / `.btn-menu-item`
 * metrics.
 */
export function KArchiveMenu({
  archiveRowVisible,
  onMarkAllRead,
  onToggleArchiveRow,
}: KArchiveMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <button
          type="button"
          className="btn-icon"
          aria-label={t("sidebar.archiveMenu")}
        >
          <KIcon name="more" className="button-icon" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        className="k-menu"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenu.Item className="btn-menu-item" onSelect={onMarkAllRead}>
          <KIcon name="readchats" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("sidebar.markAllRead")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={onToggleArchiveRow}
        >
          <KIcon
            name={archiveRowVisible ? "movetomenu" : "movetochats"}
            className="btn-menu-item-icon"
          />
          <span className="btn-menu-item-text">
            {archiveRowVisible
              ? t("sidebar.hideArchiveFromChatList")
              : t("sidebar.showArchiveInChatList")}
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
