import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  IconAlertTriangle,
  IconCheck,
  IconFile,
  IconFolder,
  IconPlayerPause,
  IconPlayerPlay,
  IconRotate,
  IconX,
} from "@tabler/icons-react";
import type { DownloadTask } from "../../types";
import { IconButton } from "../ui/IconButton";

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
      return t("downloads.failedRetry");
    default:
      return "";
  }
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

  return (
    <div className="task-row">
      <span className="file-icon" style={{ background: task.color }}>
        {isDone ? (
          <IconCheck size={20} stroke={2.4} />
        ) : isFailed ? (
          <IconAlertTriangle size={20} stroke={2} />
        ) : (
          <IconFile size={20} stroke={1.8} />
        )}
      </span>

      <div className="task-main">
        <div className="task-topline">
          <span className="task-name">{task.name}</span>
          <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--tg-secondary)]">
            {task.ext}
          </span>
        </div>
        <div className="task-meta">
          {[task.chat, task.size, taskDetail(task, t)].filter(Boolean).join(" · ")}
        </div>
        {!isDone && (
          <div className="progress-track">
            <div
              className="progress-value"
              data-status={task.status}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="task-actions">
        {task.status === "active" && (
          <IconButton label={t("downloads.pause")} onClick={() => onPause(task.id)}>
            <IconPlayerPause size={19} />
          </IconButton>
        )}
        {(task.status === "paused" || task.status === "queued") && (
          <IconButton label={t("downloads.resume")} onClick={() => onResume(task.id)}>
            <IconPlayerPlay size={19} />
          </IconButton>
        )}
        {task.status === "failed" && (
          <IconButton label={t("downloads.retry")} onClick={() => onRetry(task.id)}>
            <IconRotate size={19} />
          </IconButton>
        )}
        {isDone && (
          <IconButton label={t("common.openFolder")} onClick={() => onOpenFolder(task)}>
            <IconFolder size={19} />
          </IconButton>
        )}
        {!isDone && !isFailed && (
          <IconButton label={t("common.openFolder")} onClick={() => onOpenFolder(task)}>
            <IconFolder size={19} />
          </IconButton>
        )}
        <IconButton
          label={isDone ? t("downloads.remove") : t("downloads.cancel")}
          onClick={() => onRemove(task.id)}
        >
          <IconX size={19} />
        </IconButton>
      </div>
    </div>
  );
}
