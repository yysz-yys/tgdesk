import { useTranslation } from "react-i18next";
import type { DownloadTask } from "../../types";
import { Icon } from "../../ui";

export type DownloadBadgeVariant = "corner" | "file" | "row";

/**
 * Inline download affordance shared by the chat-info lists and message bubbles:
 * a transparent round button that becomes a progress ring while the transfer
 * runs. Completed downloads draw nothing at all — the delivered file is
 * reachable from Downloads, and Telegram Desktop does not mark finished media
 * in the conversation either.
 */
export function DownloadBadge({
  messageID,
  task,
  onStart,
  onPause,
  onResume,
  variant = "corner",
  asSpan = false,
}: {
  messageID: number;
  task?: DownloadTask;
  onStart?: (ids: number[]) => void;
  /** Accepted for compatibility; completed downloads no longer render a badge. */
  onOpen?: (task: DownloadTask) => void;
  onPause?: (task: DownloadTask) => void;
  onResume?: (task: DownloadTask) => void;
  variant?: DownloadBadgeVariant;
  /** Use inside an existing <button> (media cards); a nested button is invalid. */
  asSpan?: boolean;
}) {
  const { t } = useTranslation();
  const status = task?.status;
  if (status === "done") {
    // A finished transfer shows no badge in the chat at all.
    return null;
  }
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));
  const active = Boolean(task);
  const label =
    status === "paused"
      ? t("downloads.pausedResumeLabel", { progress })
      : status === "failed"
        ? t("downloads.failedRetryLabel")
        : active
          ? t("downloads.progressPauseLabel", { progress })
          : t("common.download");

  const activate = () => {
    if (task?.status === "active" || task?.status === "queued") {
      onPause?.(task);
    } else if (task?.status === "paused") {
      onResume?.(task);
    } else if (!task || task.status === "failed") {
      onStart?.([messageID]);
    }
  };

  const content = (
    <>
      {active ? (
        <svg className="f-info-download-ring" viewBox="0 0 36 36" aria-hidden>
          <circle className="f-info-download-ring-track" cx="18" cy="18" r="16" />
          <circle
            className="f-info-download-ring-bar"
            cx="18"
            cy="18"
            r="16"
            pathLength={100}
            strokeDasharray={`${progress} 100`}
            transform="rotate(-90 18 18)"
          />
        </svg>
      ) : null}
      <Icon
        name={
          status === "failed" ? "refresh" : status === "paused" ? "pause" : "download"
        }
        size={variant === "file" ? 14 : 15}
      />
    </>
  );

  if (asSpan) {
    return (
      <span
        className="f-info-download"
        data-variant={variant}
        data-status={status ?? "idle"}
        role="button"
        tabIndex={-1}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="f-info-download"
      data-variant={variant}
      data-status={status ?? "idle"}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        activate();
      }}
    >
      {content}
    </button>
  );
}
