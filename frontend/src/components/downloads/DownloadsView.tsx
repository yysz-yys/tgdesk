import { useMemo, useState } from "react";
import { DropdownMenu } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { DownloadTask, TaskStatus } from "../../types";
import { Button, Chip, EmptyState, Icon, IconButton } from "../../ui";
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
}

function EmptyTab({
  status,
  completedCount = 0,
  onOpenFolder,
}: {
  status: TaskStatus;
  completedCount?: number;
  onOpenFolder: () => void;
}) {
  const { t } = useTranslation();
  const title =
    status === "active"
      ? t("downloads.emptyActiveTitle")
      : status === "done"
        ? t("downloads.emptyCompletedTitle")
        : t("downloads.emptyFailedTitle");
  const copy =
    status === "active"
      ? completedCount > 0
        ? t("downloads.emptyActiveCompleted")
        : t("downloads.emptyActive")
      : status === "done"
        ? t("downloads.emptyCompleted")
        : t("downloads.emptyFailed");

  return (
    <EmptyState
      icon={status === "done" ? "task_alt" : status === "failed" ? "error" : "download"}
      title={title}
      description={copy}
      action={
        <Button variant="surface" size="2" icon="folder_open" onClick={onOpenFolder}>
          {t("downloads.openFolder")}
        </Button>
      }
    />
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
}: DownloadsViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("active");
  const running = active.filter((task) => task.status === "active").length;
  const queued = active.filter((task) => task.status === "queued").length;

  const summary = useMemo(() => {
    if (active.length === 0) {
      return t("downloads.noActive");
    }
    return [
      t("downloads.activeCount", { count: running }),
      queued > 0 ? t("downloads.queuedCount", { count: queued }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [active.length, queued, running, t]);

  const tasks = tab === "completed" ? completed : tab === "failed" ? failed : active;
  const status: TaskStatus = tab === "completed" ? "done" : tab === "failed" ? "failed" : "active";

  return (
    <section className="f-page f-downloads" aria-label={t("downloads.title")}>
      <header className="f-page-head">
        <div className="f-page-title">
          <h1>{t("downloads.title")}</h1>
          <p>{summary}</p>
        </div>
        <div className="f-page-actions">
            <IconButton
              label={t("downloads.pauseAll")}
              icon="pause_circle"
              size="2"
              iconSize={18}
              disabled={running === 0}
              onClick={onPauseAll}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  label={t("downloads.menu")}
                  icon="more_vert"
                  size="2"
                  iconSize={18}
                  tooltip={false}
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" sideOffset={6} className="f-menu-content">
                <DropdownMenu.Item className="f-menu-row" onSelect={onOpenDownloadFolder}>
                  <Icon name="folder_open" size={15} />
                  <span>{t("downloads.openFolder")}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item className="f-menu-row" color="red" onSelect={onClearCompleted}>
                  <Icon name="delete_sweep" size={15} />
                  <span>{t("downloads.clearCompleted")}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </header>

        <div className="f-download-tabs" role="tablist" aria-label={t("downloads.title")}>
          <Chip
            active={tab === "active"}
            count={active.length}
            onClick={() => setTab("active")}
          >
            {t("downloads.tabActive")}
          </Chip>
          <Chip
            active={tab === "completed"}
            count={completed.length}
            onClick={() => setTab("completed")}
          >
            {t("downloads.tabCompleted")}
          </Chip>
          <Chip
            active={tab === "failed"}
            count={failed.length}
            onClick={() => setTab("failed")}
          >
            {t("downloads.tabFailed")}
          </Chip>
        </div>

        <div className="f-download-scroll" role="tabpanel">
          {tasks.length === 0 ? (
            <EmptyTab
              status={status}
              completedCount={completed.length}
              onOpenFolder={onOpenDownloadFolder}
            />
          ) : (
            <div className="f-task-list">
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
          )}
        </div>
      </section>
  );
}
