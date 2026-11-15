import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadTask, MessageMedia } from "../../types";
import { DocumentDownload, type DocumentDownloadState } from "./DocumentDownload";
import "./document-bubble.css";

/** Web K's per-extension icon plate colours (`_document.scss:113-123`). */
const EXT_BACKGROUND: Record<string, string> = {
  zip: "#FB8C00",
  pdf: "#DF3F40",
  apk: "#43A047",
};

/**
 * Port of tweb's `MiddleEllipsisElement` (temp/tweb `middleEllipsis.ts`): the
 * file name is cut in the middle so the extension stays visible, measured at
 * the rendered font and recomputed whenever the row is resized.
 *
 * tweb measures on a canvas at `500 16px Roboto`; the chat here may use another
 * font stack, so this measures a hidden copy of the text instead — the exact
 * width the browser renders. The hidden copy that keeps the bubble's
 * shrink-to-fit width stable is the `.k-document-name-spacer`.
 */
function MiddleEllipsis({ text }: { text: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const measurer = measureRef.current;
    if (!host || !measurer || typeof ResizeObserver === "undefined") {
      return;
    }
    const ellipsis = "\u2026";
    const update = () => {
      const available = host.clientWidth;
      if (!available) return;
      // measure the rendered width of a candidate head…tail string
      const widthOf = (value: string) => {
        measurer.textContent = value;
        return measurer.getBoundingClientRect().width;
      };
      if (widthOf(text) <= available + 0.5) {
        setDisplay(text);
        setTruncated(false);
        host.removeAttribute("title");
        return;
      }
      host.setAttribute("title", text);
      const candidate = (removed: number) => {
        const kept = text.length - removed;
        const front = Math.max(1, Math.floor(kept / 2));
        const head = text.slice(0, front).replace(/\s*$/u, "");
        const tail = text.slice(text.length - (kept - front)).replace(/^\s*/u, "");
        return head + ellipsis + tail;
      };
      let low = 1;
      let high = Math.max(1, text.length - 3);
      let result = candidate(high);
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const value = candidate(middle);
        if (widthOf(value) < available) {
          result = value;
          high = middle - 1;
        } else {
          low = middle + 1;
        }
      }
      setDisplay(result);
      setTruncated(true);
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    update();
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <span className="k-document-name-spacer" aria-hidden="true">
        {text}
      </span>
      <span
        ref={measureRef}
        className="k-document-name-measure"
        aria-hidden="true"
      >
        {text}
      </span>
      <span
        ref={hostRef}
        className="k-document-name-text"
        data-truncated={truncated || undefined}
        dir="auto"
      >
        {display}
      </span>
    </>
  );
}

function fileNameExt(media: MessageMedia): string {
  if (media.ext?.trim()) return media.ext.trim().toLowerCase();
  const name = media.name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  return "file";
}

function downloadState(task?: DownloadTask): DocumentDownloadState {
  if (!task) return "idle";
  switch (task.status) {
    case "active":
    case "queued":
      return "downloading";
    case "paused":
      return "paused";
    case "failed":
      return "failed";
    case "done":
      return "done";
    default:
      return "idle";
  }
}

interface FileDocumentRowProps {
  media: MessageMedia;
  task?: DownloadTask;
  /** Start the transfer (idle rows and retries of failed ones). */
  onStart?: () => void;
  onPause?: (task: DownloadTask) => void;
  onResume?: (task: DownloadTask) => void;
  /** Open the delivered file once the transfer is done. */
  onOpen?: (task: DownloadTask) => void;
}

/**
 * The document row of a file bubble, ported from tweb's `document.ts` DOM and
 * `_document.scss` / `_chatBubble.scss` geometry:
 *
 * ```
 * button.k-document[data-state]
 *   span.k-document-ico         54x54, margin-inline-start:-66px, radius 6
 *     span.k-document-ico-text  the extension, 18px, hidden while downloading
 *     DocumentDownload          the hover-revealed arrow / progress ring
 *   span.k-document-name        16px/500, middle ellipsis
 *   span.k-document-size        14px, secondary, bytes only
 * ```
 */
export function FileDocumentRow({
  media,
  task,
  onStart,
  onPause,
  onResume,
  onOpen,
}: FileDocumentRowProps) {
  const { t } = useTranslation();
  const state = downloadState(task);
  const ext = fileNameExt(media);
  const extBackground = EXT_BACKGROUND[ext];
  const name = media.name?.trim() || "Unknown.file";
  const size = media.size?.trim() || "";
  const progress = Math.max(0, Math.min(100, task?.progress ?? 0));

  const label =
    state === "downloading"
      ? t("downloads.progressPauseLabel", { progress })
      : state === "paused"
        ? t("downloads.pausedResumeLabel", { progress })
        : state === "failed"
          ? t("downloads.failedRetryLabel")
          : state === "done"
            ? t("downloads.downloaded")
            : t("common.download");

  const activate = () => {
    if (!task) {
      onStart?.();
      return;
    }
    switch (task.status) {
      case "active":
      case "queued":
        onPause?.(task);
        break;
      case "paused":
        onResume?.(task);
        break;
      case "failed":
        onStart?.();
        break;
      case "done":
        onOpen?.(task);
        break;
      default:
        onStart?.();
    }
  };

  return (
    <button
      type="button"
      className={`k-document k-document-ext-${/^[a-z0-9]+$/u.test(ext) ? ext : "file"}`}
      style={
        extBackground
          ? ({ "--k-doc-bg": extBackground } as React.CSSProperties)
          : undefined
      }
      data-state={state}
      data-downloading={state === "downloading" || undefined}
      data-indicator={
        state === "downloading" || state === "paused" || state === "failed"
          ? true
          : undefined
      }
      aria-label={label}
      onClick={activate}
    >
      <span className="k-document-ico" aria-hidden="true">
        <span className="k-document-ico-text">{ext}</span>
        <DocumentDownload state={state} progress={progress} />
      </span>
      <span className="k-document-name">
        <MiddleEllipsis text={name} />
      </span>
      {size ? <span className="k-document-size">{size}</span> : null}
    </button>
  );
}
