/**
 * Set management affordances shared by the set rail, the section headers and the
 * search/featured set rows.
 *
 * Telegram Web K keeps install/uninstall/archive in the settings screen; this
 * picker follows Web A and exposes them directly: right-click any installed set
 * (rail tab or section header) for Archive/Remove, right-click the Recent header
 * for Clear recent, and use the hover "more" button in a section header. Search
 * results and Trending rows show a visible Add button for non-installed sets.
 */
import { Archive, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { StickerSetInfo } from "../../../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Menu,
  MenuItem,
} from "../../../ui";

export type StickerSetActionKind = "install" | "uninstall" | "archive";

export interface StickerSetActionRequest {
  kind: StickerSetActionKind;
  set: StickerSetInfo;
}

interface ActionSpec {
  kind: StickerSetActionKind;
  labelKey: string;
}

function actionSpecs(installed: boolean): ActionSpec[] {
  if (!installed) {
    return [{ kind: "install", labelKey: "emojiPicker.addStickers" }];
  }
  return [
    { kind: "archive", labelKey: "emojiPicker.archiveSet" },
    { kind: "uninstall", labelKey: "emojiPicker.removeSet" },
  ];
}

function ActionIcon({ kind }: { kind: StickerSetActionKind }) {
  const props = { size: 16, strokeWidth: 1.8, "aria-hidden": true as const };
  if (kind === "install") {
    return <Plus {...props} />;
  }
  if (kind === "archive") {
    return <Archive {...props} />;
  }
  return <Trash2 {...props} />;
}

interface ActionsProps {
  set?: StickerSetInfo;
  /** Installed state; rail/header sets are installed by definition. */
  installed?: boolean;
  busy?: boolean;
  onAction?: (request: StickerSetActionRequest) => void;
  onClearRecent?: () => void;
}

/** Right-click menu for a set rail tab / section header / Recent header. */
export function StickerSetContextMenu({
  children,
  set,
  installed = true,
  busy = false,
  onAction,
  onClearRecent,
}: ActionsProps & { children: ReactElement }) {
  const { t } = useTranslation();
  const specs = set && onAction ? actionSpecs(installed) : [];
  if (specs.length === 0 && !onClearRecent) {
    return children;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {specs.map((spec) => (
          <ContextMenuItem
            key={spec.kind}
            icon={<ActionIcon kind={spec.kind} />}
            disabled={busy}
            danger={spec.kind === "uninstall"}
            onSelect={() => {
              if (set) {
                onAction?.({ kind: spec.kind, set });
              }
            }}
          >
            {t(spec.labelKey)}
          </ContextMenuItem>
        ))}
        {onClearRecent ? (
          <ContextMenuItem
            icon={<RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />}
            onSelect={onClearRecent}
          >
            {t("emojiPicker.clearRecent")}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Hover "more" button (section headers) opening the same actions as a menu. */
export function StickerSetMoreMenu({
  set,
  installed = true,
  busy = false,
  onAction,
}: ActionsProps) {
  const { t } = useTranslation();
  if (!set || !onAction) {
    return null;
  }
  const specs = actionSpecs(installed);
  return (
    <Menu
      trigger={
        <span className="g-emoji-picker-set-more-content">
          <span className="g-emoji-picker-visually-hidden">
            {t("emojiPicker.setActions")}
          </span>
          <MoreHorizontal size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
      }
      triggerClassName="g-emoji-picker-set-more"
      contentClassName="f-menu"
      side="bottom"
      align="end"
    >
      {specs.map((spec) => (
        <MenuItem
          key={spec.kind}
          className="f-menu-item"
          disabled={busy}
          onSelect={() => onAction({ kind: spec.kind, set })}
        >
          <span className="f-menu-icon">
            <ActionIcon kind={spec.kind} />
          </span>
          <span className="f-menu-label">{t(spec.labelKey)}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}
