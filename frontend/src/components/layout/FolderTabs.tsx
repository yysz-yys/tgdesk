import { useTranslation } from "react-i18next";

export type ChatFolder = "all" | "unread" | "groups" | "channels";

interface FolderTabsProps {
  active: ChatFolder;
  counts: Record<ChatFolder, number>;
  onChange: (folder: ChatFolder) => void;
}

const FOLDERS: ChatFolder[] = ["all", "unread", "groups", "channels"];

export function FolderTabs({ active, counts, onChange }: FolderTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-folder-tabs" role="tablist" aria-label={t("sidebar.folders")}>
      {FOLDERS.map((folder) => (
        <button
          key={folder}
          type="button"
          role="tab"
          aria-selected={active === folder}
          className="tg-folder-tab"
          data-active={active === folder}
          onClick={() => onChange(folder)}
        >
          <span>{t(`sidebar.folder.${folder}`)}</span>
          {folder === "unread" && counts.unread > 0 ? (
            <span className="tg-folder-count">{counts.unread > 99 ? "99+" : counts.unread}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
