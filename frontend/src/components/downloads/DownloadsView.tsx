import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadTask, TaskStatus } from "../../types";
import { Button, Chip, EmptyState, IconButton } from "../../ui";
import { TaskRow } from "./TaskRow";

interface DownloadsViewProps {
  active: DownloadTask[];
  completed: DownloadTask[];
  failed: DownloadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  onClearFailed: () => void;
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
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  onClearFailed,
  onOpenDownloadFolder,
}: DownloadsViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("active");
  const running = active.filter((task) => task.status === "active").length;
  const queued = active.filter((task) => task.status === "queued").length;
  const paused = active.filter((task) => task.status === "paused").length;

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
  // One toggle replaces the old pause-all/resume-all pair: it pauses while
  // anything is moving and resumes once everything is held.
  const hasRunning = running + queued > 0;
  const toggleAll = hasRunning ? onPauseAll : onResumeAll;

  return (
    <section className="f-page f-downloads" aria-label={t("downloads.title")}>
      <header className="f-page-head">
        <div className="f-page-title">
          <h1>{t("downloads.title")}</h1>
          <p>{summary}</p>
        </div>
        <div className="f-page-actions">
          <IconButton
            label={hasRunning ? t("downloads.pauseAll") : t("downloads.resumeAll")}
            icon={hasRunning ? "pause_circle" : "play_arrow"}
            size="2"
            iconSize={18}
            disabled={!hasRunning && paused === 0}
            onClick={toggleAll}
          />
          <IconButton
            label={t("downloads.openFolder")}
            icon="folder_open"
            size="2"
            iconSize={18}
            onClick={onOpenDownloadFolder}
          />
          <IconButton
            label={t("downloads.clearCompleted")}
            icon="delete_sweep"
            color="red"
            size="2"
            iconSize={18}
            disabled={completed.length === 0}
            onClick={onClearCompleted}
          />
          <IconButton
            label={t("downloads.clearFailed")}
            icon="delete_forever"
            color="red"
            size="2"
            iconSize={18}
            disabled={failed.length === 0}
            onClick={onClearFailed}
          />
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
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </div>
      </section>
  );
}
