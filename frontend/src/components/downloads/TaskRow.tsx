import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import type { TFunction } from "i18next";
import type { DownloadTask } from "../../types";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { LinearProgress } from "../ui/Progress";

interface TaskRowProps {
  task: DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenFolder: (task: DownloadTask) => void;
  onRemove: (id: string) => void;
}

function taskDetail(task: DownloadTask, t: TFunction) {
  switch (task.status) {
    case "active": {
      const status = [task.speed, task.eta].filter(Boolean).join(" · ");
      return status || `${task.progress}%`;
    }
    case "queued":
      return t("downloads.queued");
    case "paused":
      return t("downloads.paused", { progress: task.progress });
    case "done":
      return t("downloads.completed", { size: task.size });
    case "failed":
      return task.error || t("downloads.failedRetry");
    default:
      return "";
  }
}

function fileIcon(ext: string) {
  const value = ext.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(value)) {
    return "image";
  }
  if (["mp4", "mov", "mkv", "webm", "avi"].includes(value)) {
    return "movie";
  }
  if (["mp3", "m4a", "flac", "ogg", "wav"].includes(value)) {
    return "audio_file";
  }
  if (value === "pdf") {
    return "picture_as_pdf";
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(value)) {
    return "folder_zip";
  }
  return "description";
}

export function TaskRow({
  task,
  onPause,
  onResume,
  onRetry,
  onOpenFolder,
  onRemove,
}: TaskRowProps) {
  const { t } = useTranslation();
  const isDone = task.status === "done";
  const isFailed = task.status === "failed";
  const isFinished = isDone || isFailed;
  const meta = [task.chat, isDone ? null : task.size, taskDetail(task, t)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="g-task-row" data-status={task.status}>
      <span
        className="g-task-icon"
        style={{ "--task-color": task.color } as CSSProperties}
        aria-hidden="true"
      >
        <Icon
          name={isDone ? "check" : isFailed ? "error" : fileIcon(task.ext)}
          size={21}
        />
      </span>

      <div className="g-task-main">
        <div className="g-task-topline">
          <span className="g-task-name" title={task.name}>
            {task.name}
          </span>
          {task.ext ? <span className="g-task-ext">{task.ext}</span> : null}
        </div>
        <div className="g-task-meta">{meta}</div>
        {!isFinished ? (
          <LinearProgress
            className="g-task-progress"
            value={task.progress / 100}
            tone={isFailed ? "error" : "primary"}
            label={`${task.progress}%`}
          />
        ) : null}
      </div>

      <div className="g-task-actions">
        {task.status === "active" ? (
          <IconButton label={t("downloads.pause")} icon="pause" onClick={() => onPause(task.id)} />
        ) : null}
        {task.status === "paused" || task.status === "queued" ? (
          <IconButton label={t("downloads.resume")} icon="play_arrow" onClick={() => onResume(task.id)} />
        ) : null}
        {isFailed ? (
          <IconButton label={t("downloads.retry")} icon="refresh" onClick={() => onRetry(task.id)} />
        ) : null}
        <IconButton
          label={t("common.openFolder")}
          icon="folder_open"
          onClick={() => onOpenFolder(task)}
        />
        <IconButton
          label={isDone ? t("downloads.remove") : t("downloads.cancel")}
          icon="close"
          onClick={() => onRemove(task.id)}
        />
      </div>
    </article>
  );
}
