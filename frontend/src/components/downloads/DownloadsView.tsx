import { useTranslation } from "react-i18next";
import {
  IconDownload,
  IconDots,
  IconFolder,
  IconPlayerPause,
  IconTrash,
} from "@tabler/icons-react";
import * as Tabs from "@radix-ui/react-tabs";
import type { DownloadTask, TaskStatus } from "../../types";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { TaskRow } from "./TaskRow";

interface DownloadsViewProps {
  active: DownloadTask[];
  completed: DownloadTask[];
  failed: DownloadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenFolder: (task: DownloadTask) => void;
  onPauseAll: () => void;
  onClearCompleted: () => void;
  onOpenDownloadFolder: () => void;
  onToast: (message: string) => void;
}

function EmptyTab({
  status,
  completedCount = 0,
}: {
  status: TaskStatus;
  completedCount?: number;
}) {
  const { t } = useTranslation();
  const copy =
    status === "active"
      ? completedCount > 0
        ? t("downloads.emptyActiveCompleted")
        : t("downloads.emptyActive")
      : status === "done"
        ? t("downloads.emptyCompleted")
        : t("downloads.emptyFailed");

  return (
    <div className="empty-state">
      <span className="empty-icon">
        <IconDownload size={27} stroke={1.7} />
      </span>
      <div className="empty-title">{t("downloads.emptyTitle")}</div>
      <div className="empty-copy">{copy}</div>
    </div>
  );
}

export function DownloadsView({
  active,
  completed,
  failed,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpenFolder,
  onPauseAll,
  onClearCompleted,
  onOpenDownloadFolder,
  onToast,
}: DownloadsViewProps) {
  const { t } = useTranslation();
  const running = active.filter((task) => task.status === "active").length;
  const queued = active.filter((task) => task.status === "queued").length;

  const renderTasks = (tasks: DownloadTask[], status: TaskStatus) => {
    if (tasks.length === 0) {
      return <EmptyTab status={status} completedCount={completed.length} />;
    }

    return (
      <div className="task-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onPause={onPause}
            onResume={onResume}
            onRetry={onRetry}
            onOpenFolder={onOpenFolder}
            onRemove={onRemove}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="downloads-view" aria-label={t("downloads.title")}>
      <header className="downloads-header">
        <div className="downloads-heading">
          <h1>{t("downloads.title")}</h1>
          <p>
            {active.length > 0
              ? [t("downloads.activeCount", { count: running }), queued > 0 ? t("downloads.queuedCount", { count: queued }) : null]
                  .filter(Boolean)
                  .join(" · ")
              : t("downloads.noActive")}
          </p>
        </div>

        <IconButton label={t("downloads.pauseAll")} disabled={running === 0} onClick={onPauseAll}>
          <IconPlayerPause size={21} stroke={1.8} />
        </IconButton>

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="icon-button" aria-label={t("downloads.menu")}>
              <IconDots size={21} stroke={1.8} />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<IconFolder size={16} />} onSelect={onOpenDownloadFolder}>
              {t("downloads.openFolder")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<IconTrash size={16} />} onSelect={onClearCompleted} danger>
              {t("downloads.clearCompleted")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      <Tabs.Root defaultValue="active" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="tabs" aria-label={t("downloads.title")}>
          <Tabs.Trigger value="active" className="tab">
            {t("downloads.tabActive")} <span className="tab-count">{active.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="completed" className="tab">
            {t("downloads.tabCompleted")} <span className="tab-count">{completed.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="failed" className="tab">
            {t("downloads.tabFailed")} <span className="tab-count">{failed.length}</span>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="active" className="downloads-scroll outline-none">
          {renderTasks(active, "active")}
        </Tabs.Content>
        <Tabs.Content value="completed" className="downloads-scroll outline-none">
          {renderTasks(completed, "done")}
        </Tabs.Content>
        <Tabs.Content value="failed" className="downloads-scroll outline-none">
          {renderTasks(failed, "failed")}
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
