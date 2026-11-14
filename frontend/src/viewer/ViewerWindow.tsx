import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Events, Window as WailsWindow } from "@wailsio/runtime";
import { Service as AppService } from "../../bindings/tgdesk/internal/app";
import { useSettings } from "../hooks/useSettings";
import { EmptyState, Spinner, Toast } from "../ui";
import { MediaViewer } from "../components/media/MediaViewer";
import type {
  MediaViewerWindowState,
  ViewerAuthor,
  ViewerItem,
} from "../components/media/types";

interface ViewerWindowProps {
  session: string;
}

/**
 * Detached media viewer window content: loads the session payload written by
 * the chat window, renders the shared MediaViewer and bridges its actions back
 * to the main window (forward/delete/show-in-chat) or calls the backend
 * directly (video stream URL, downloads).
 */
export function ViewerWindow({ session }: ViewerWindowProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [state, setState] = useState<MediaViewerWindowState | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setFailed(false);
    if (!session) {
      setFailed(true);
      return;
    }
    void AppService.TakeMediaViewerState(session)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        const parsed = JSON.parse(raw) as MediaViewerWindowState;
        if (!parsed.items?.length) {
          throw new Error("empty viewer state");
        }
        setState(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string) => setToast(message), []);

  const closeWindow = useCallback(() => {
    void WailsWindow.Close();
  }, []);

  const focusMainWindow = useCallback(() => {
    try {
      const main = WailsWindow.Get("main");
      void main.Show();
      void main.Focus();
    } catch {
      // The main window may already be gone.
    }
  }, []);

  const items = state?.items ?? [];
  const authorCache = useMemo(() => state?.authors ?? {}, [state]);

  const authorOf = useCallback(
    (message: ViewerItem["message"]): ViewerAuthor =>
      authorCache[String(message.id)] ?? {
        name: state?.chat.title ?? "",
        initials: "?",
        color: "#5b8def",
      },
    [authorCache, state?.chat.title],
  );

  const loadVideo = useCallback(
    (chatId: string, messageId: number) =>
      AppService.GetVideoStream(
        chatId,
        messageId,
        state?.network.proxy ?? "",
        state?.network.ntp ?? "",
        state?.network.tdlStreaming ?? settings.tdlStreaming,
      ),
    [settings.tdlStreaming, state?.network],
  );

  const download = useCallback(
    (message: ViewerItem["message"]) => {
      if (!state) {
        return;
      }
      void AppService.StartDownload(
        state.chat.id,
        state.chat.title,
        [message.id],
        state.network.proxy,
        state.network.ntp,
        settings.downloadDir,
        settings.template,
        {
          threads: settings.threads,
          pool: settings.pool,
          limit: settings.limit,
          skipSame: settings.skipSame,
          rewriteExt: settings.rewriteExt,
          takeout: settings.takeout,
          reconnectSeconds: settings.reconnectSeconds,
        },
      )
        .then(() => showToast(t("viewer.downloadStarted")))
        .catch(() => showToast(t("toasts.downloadStartFailed")));
    },
    [settings, showToast, state, t],
  );

  const emitAction = useCallback(
    (kind: "forward" | "delete" | "showInChat", messageIds: number[]) => {
      if (!state) {
        return;
      }
      void Events.Emit("mediaViewer:action", {
        kind,
        chatId: state.chat.id,
        messageIds,
      });
    },
    [state],
  );

  if (failed) {
    return (
      <main className="viewer-window-status">
        <EmptyState icon="error" title={t("viewer.windowLoadFailed")} />
      </main>
    );
  }
  if (!state) {
    return (
      <main className="viewer-window-status">
        <Spinner size={26} />
      </main>
    );
  }

  return (
    <main className="viewer-window-body">
      <MediaViewer
        items={items}
        initialId={state.initialId}
        authorOf={authorOf}
        onClose={closeWindow}
        onLoadVideo={loadVideo}
        onDownload={download}
        onForward={(message) => {
          emitAction("forward", [message.id]);
          focusMainWindow();
        }}
        onDelete={(message) => {
          emitAction("delete", [message.id]);
          focusMainWindow();
        }}
        onShowInChat={(message) => {
          emitAction("showInChat", [message.id]);
          focusMainWindow();
          window.setTimeout(() => void WailsWindow.Close(), 80);
        }}
        onToast={showToast}
      />
      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}
