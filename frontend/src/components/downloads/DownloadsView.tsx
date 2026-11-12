import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadTask, TaskStatus } from "../../types";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { PaneHeader } from "../ui/PaneHeader";
import { Tabs } from "../ui/Tabs";
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
  onMenu: () => void;
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
        <Button variant="text" icon="folder_open" onClick={onOpenFolder}>
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
  onMenu,
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
    <section className="g-downloads" aria-label={t("downloads.title")}>
      <PaneHeader
        className="g-downloads-header"
        title={t("downloads.title")}
        subtitle={summary}
        leading={
          <IconButton
            label={t("common.mainNavigation")}
            icon="menu"
            onClick={onMenu}
          />
        }
        actions={
          <>
            <IconButton
              label={t("downloads.pauseAll")}
              icon="pause_circle"
              disabled={running === 0}
              onClick={onPauseAll}
            />
            <Menu>
              <MenuTrigger asChild>
                <IconButton
                  label={t("downloads.menu")}
                  icon="more_vert"
                  tooltip={false}
                />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Icon name="folder_open" size={18} />} onSelect={onOpenDownloadFolder}>
                  {t("downloads.openFolder")}
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Icon name="delete_sweep" size={18} />} onSelect={onClearCompleted} danger>
                  {t("downloads.clearCompleted")}
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <div className="g-downloads-body">
        <div className="g-downloads-tabs">
          <Tabs
            value={tab}
            onChange={setTab}
            ariaLabel={t("downloads.title")}
            items={[
              { value: "active", label: t("downloads.tabActive"), count: active.length },
              { value: "completed", label: t("downloads.tabCompleted"), count: completed.length },
              { value: "failed", label: t("downloads.tabFailed"), count: failed.length },
            ]}
          />
        </div>

        <div className="g-downloads-scroll" role="tabpanel">
          {tasks.length === 0 ? (
            <EmptyTab
              status={status}
              completedCount={completed.length}
              onOpenFolder={onOpenDownloadFolder}
            />
          ) : (
            <div className="g-task-list">
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
      </div>
    </section>
  );
}
