import { useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";
import { useRipple } from "./useRipple";

interface KNewMenuProps {
  onCreate: (kind: "channel" | "group" | "private") => void;
}

/**
 * The pencil corner button and its menu (tweb createNewChatsMenuButton /
 * createNewChatsMenuOptions): New Channel, New Group, New Private Chat above
 * the button, opening toward the top-left. The pencil swaps to a cross while
 * the menu is open (`.menu-open`, animated-button-icon).
 */
export function KNewMenu({ onCreate }: KNewMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ripple = useRipple<HTMLButtonElement>();

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger>
        <button
          ref={ripple.ref}
          type="button"
          id="new-menu"
          className={
            open
              ? "btn-new-menu btn-circle rp btn-corner z-depth-1 is-visible menu-open"
              : "btn-new-menu btn-circle rp btn-corner z-depth-1 is-visible"
          }
          aria-label={t("sidebar.newMessage")}
        >
          <KIcon
            name="newchat_filled"
            className="animated-button-icon-icon animated-button-icon-icon-first"
          />
          <KIcon
            name="close"
            className="animated-button-icon-icon animated-button-icon-icon-last"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        className="k-menu k-new-menu"
        side="top"
        align="end"
        sideOffset={10}
      >
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onCreate("channel")}
        >
          <KIcon name="newchannel" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.newChannel")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onCreate("group")}
        >
          <KIcon name="newgroup" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">{t("kMenu.newGroup")}</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className="btn-menu-item"
          onSelect={() => onCreate("private")}
        >
          <KIcon name="newprivate" className="btn-menu-item-icon" />
          <span className="btn-menu-item-text">
            {t("kMenu.newPrivateChat")}
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
