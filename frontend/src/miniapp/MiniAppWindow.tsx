import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Browser, Window as WailsWindow } from "@wailsio/runtime";
import type { Appearance } from "../ui/theme";
import { Button, Icon, Spinner } from "../ui";
import {
  browserFallbackUrl,
  isAllowedMiniAppUrl,
  parseMiniAppState,
  takeMiniAppState,
  type MiniAppState,
} from "./miniAppState";
import { withThemeParams } from "./themeParams";

const LOAD_TIMEOUT_MS = 25_000;

type StateError = "missing" | "invalid";

interface MiniAppWindowProps {
  session: string;
  appearance: Appearance;
}

/**
 * Mini-app window content (Telegram Web K browser panel analogue).
 *
 * Security model: the Wails window always loads this local page; the third-party
 * web app lives inside a sandboxed cross-origin iframe and never gets the Wails
 * runtime/bindings. v1 forwards no bridge events (`web_app_ready`,
 * `web_app_data_send`, theme requests, …) between the iframe and the app — that
 * is a documented limitation; the mini app gets its launch data (including
 * tgWebAppData) from the URL hash computed by `messages.requestWebView`.
 */
export function MiniAppWindow({ session, appearance }: MiniAppWindowProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<MiniAppState | null>(null);
  const [stateError, setStateError] = useState<StateError | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setStateError(null);
    setAvatarFailed(false);
    if (!session) {
      setStateError("missing");
      return;
    }
    void takeMiniAppState(session)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        const parsed = parseMiniAppState(raw);
        if (!parsed || !isAllowedMiniAppUrl(parsed.url)) {
          setStateError("invalid");
          return;
        }
        setState(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          setStateError("invalid");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const targetUrl = useMemo(() => {
    if (!state || !isAllowedMiniAppUrl(state.url)) {
      return null;
    }
    return withThemeParams(state.url, appearance);
  }, [appearance, state]);

  // A frame that never fires onLoad (offline, blocked) falls back to the error
  // state after a generous timeout. A blocked X-Frame-Options page can still
  // fire onLoad with an error document; the header "open in browser" action is
  // the escape hatch for that case.
  useEffect(() => {
    if (!targetUrl) {
      return;
    }
    setReady(false);
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [targetUrl, attempt]);

  const markLoaded = useCallback(() => {
    setReady(true);
    setTimedOut(false);
  }, []);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const closeWindow = useCallback(() => {
    void WailsWindow.Close();
  }, []);

  const openInBrowser = useCallback(() => {
    if (!state) {
      return;
    }
    const fallback = browserFallbackUrl(state.url);
    if (fallback) {
      void Browser.OpenURL(fallback);
    }
  }, [state]);

  const title =
    state?.title?.trim() || state?.botName?.trim() || t("miniApp.windowTitle");
  const avatarInitial =
    (state?.botName?.trim() || state?.title?.trim() || "?").slice(0, 1).toUpperCase();

  let body: ReactNode;
  if (stateError) {
    body = (
      <div className="mini-app-status">
        <span className="mini-app-status-icon">
          <Icon name="warning" size={22} />
        </span>
        <h2>
          {stateError === "missing" ? t("miniApp.stateUnavailable") : t("miniApp.failed")}
        </h2>
        {stateError === "invalid" ? <p>{t("miniApp.failedHint")}</p> : null}
        <div className="mini-app-status-actions">
          <Button variant="ghost" onClick={closeWindow}>
            {t("miniApp.close")}
          </Button>
        </div>
      </div>
    );
  } else if (!state || !targetUrl) {
    body = (
      <div className="mini-app-loading">
        <Spinner size={26} />
        <span>{t("miniApp.loading")}</span>
      </div>
    );
  } else {
    body = (
      <>
        <iframe
          key={`${targetUrl}-${attempt}`}
          className="mini-app-frame"
          src={targetUrl}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={markLoaded}
        />
        {!ready || timedOut ? (
          <div className="mini-app-overlay">
            {timedOut ? (
              <div className="mini-app-status">
                <span className="mini-app-status-icon">
                  <Icon name="warning" size={22} />
                </span>
                <h2>{t("miniApp.failed")}</h2>
                <p>{t("miniApp.failedHint")}</p>
                <div className="mini-app-status-actions">
                  <Button variant="soft" icon="rotate_left" onClick={retry}>
                    {t("miniApp.reload")}
                  </Button>
                  <Button variant="surface" icon="open_in_new" onClick={openInBrowser}>
                    {t("miniApp.openInBrowser")}
                  </Button>
                  <Button variant="ghost" onClick={closeWindow}>
                    {t("miniApp.close")}
                  </Button>
                </div>
                <p className="mini-app-status-note">{t("miniApp.browserNote")}</p>
              </div>
            ) : (
              <div className="mini-app-loading">
                <Spinner size={26} />
                <span>{t("miniApp.loading")}</span>
              </div>
            )}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="mini-app-window">
      <header
        className="mini-app-header"
        style={{ "--wails-draggable": "drag" } as CSSProperties}
      >
        <div className="mini-app-title">
          {state?.avatarUrl && !avatarFailed ? (
            <img
              className="mini-app-avatar"
              src={state.avatarUrl}
              alt=""
              draggable={false}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="mini-app-avatar mini-app-avatar-fallback">
              {state ? avatarInitial : <Icon name="bot" size={13} />}
            </span>
          )}
          <span className="mini-app-title-text" title={title}>
            {title}
          </span>
        </div>
        <div
          className="mini-app-actions"
          style={{ "--wails-draggable": "no-drag" } as CSSProperties}
        >
          {state ? (
            <button
              type="button"
              className="mini-app-header-btn"
              aria-label={t("miniApp.openInBrowser")}
              title={t("miniApp.openInBrowser")}
              onClick={openInBrowser}
            >
              <Icon name="open_in_new" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="mini-app-header-btn mini-app-close"
            aria-label={t("miniApp.close")}
            title={t("miniApp.close")}
            onClick={closeWindow}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      <div className="mini-app-body">{body}</div>
    </div>
  );
}
