import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import "@radix-ui/themes/styles.css";
import "../ui/f.css";
import "../app.css";
import "../components/layout/layout.css";
import "../components/layout/titlebar.css";
import "../components/chat/chat.css";
import "../components/layout/shell-f.css";
import "../components/downloads/downloads-f.css";
import "../components/settings/settings-f.css";
import "../i18n";
import { AppTheme, type Appearance } from "../ui/theme";
import { MediaViewer } from "../components/media/MediaViewer";
import type { ViewerItem } from "../components/media/types";
import type { Message, MessageMedia } from "../types";

/**
 * Backend-free preview for the full-screen media viewer.
 *
 *   /media-preview.html?state=photo|album|video|note&theme=dark|light&zoom=1
 *
 * Photos are drawn on a canvas at runtime; the video state uses a public sample
 * clip. `zoom=1` dispatches a wheel zoom after mount so a screenshot can show
 * the zoom bar without devtools.
 */
const params = new URLSearchParams(window.location.search);
const state = params.get("state") ?? "photo";
const theme: Appearance = params.get("theme") === "light" ? "light" : "dark";
const wantsZoom = params.get("zoom") === "1";

const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

function drawPhoto(width: number, height: number, from: string, to: string, label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(height / 6)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, width / 2, height / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, width - 48, height - 48);
  }
  return canvas.toDataURL("image/png");
}

function makeMessage(
  id: number,
  media: MessageMedia,
  text?: string,
  groupedId?: string,
): Message {
  return {
    id,
    chatId: "mock-chat",
    out: id % 2 === 0,
    sender: id % 2 === 0 ? undefined : "Geraldine",
    time: "09:58",
    date: "10月10日",
    groupedId,
    text,
    media,
  };
}

function buildItems(): ViewerItem[] {
  const photos = [
    { w: 1600, h: 1000, from: "#1f3b73", to: "#0d1b33", label: "Landscape photo" },
    { w: 900, h: 1350, from: "#5b2c6f", to: "#1b0a21", label: "Portrait photo" },
    { w: 1200, h: 1200, from: "#1e5c4a", to: "#082018", label: "Square photo" },
  ];
  const photoItems: ViewerItem[] = state === "album" ? photos.map((photo, index) => {
    const url = drawPhoto(photo.w, photo.h, photo.from, photo.to, photo.label);
    return {
      message: makeMessage(
        101 + index,
        {
          kind: "photo",
          name: `${photo.label}.jpg`,
          photoUrl: url,
          thumbUrl: url,
          width: photo.w,
          height: photo.h,
        },
        index === 0
          ? "Telegram Web style media viewer — album caption with a link https://telegram.org"
          : undefined,
        "mock-album",
      ),
      kind: "photo",
      imageUrl: url,
      thumbUrl: url,
      width: photo.w,
      height: photo.h,
      name: `${photo.label}.jpg`,
    };
  }) : (() => {
    const photo = photos[0];
    const url = drawPhoto(photo.w, photo.h, photo.from, photo.to, photo.label);
    return [{
      message: makeMessage(101, {
        kind: "photo",
        name: "Landscape photo.jpg",
        photoUrl: url,
        thumbUrl: url,
        width: photo.w,
        height: photo.h,
      }, "Photo caption in the viewer, shown under the media exactly like Telegram Web K does."),
      kind: "photo" as const,
      imageUrl: url,
      thumbUrl: url,
      width: photo.w,
      height: photo.h,
      name: "Landscape photo.jpg",
    }];
  })();

  if (state !== "video" && state !== "note") {
    return photoItems;
  }

  const videoPoster = state === "note"
    ? drawPhoto(640, 640, "#2c3e50", "#0b1520", "Round video")
    : drawPhoto(1280, 720, "#2c3e50", "#0b1520", "Sample video");
  const item: ViewerItem = {
    message: makeMessage(
      state === "note" ? 21 : 22,
      {
        kind: state === "note" ? "video_note" : "video",
        name: "archive-sync-1794556850.mp4",
        thumbUrl: videoPoster,
        duration: 12,
        width: state === "note" ? 640 : 1920,
        height: state === "note" ? 640 : 1080,
        mime: "video/mp4",
        ext: "MP4",
      },
      state === "video" ? "A sample clip loaded from the public MDN test media." : undefined,
    ),
    kind: state === "note" ? "video_note" : "video",
    thumbUrl: videoPoster,
    width: state === "note" ? 640 : 1920,
    height: state === "note" ? 640 : 1080,
    duration: 12,
    name: "archive-sync-1794556850.mp4",
  };
  // Include a photo before the video so prev/next arrows and the counter show.
  return [...photoItems.slice(0, 1), item];
}

function Preview() {
  const [open, setOpen] = useState(true);
  const items = useMemo(buildItems, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  }, []);

  useEffect(() => {
    if (!wantsZoom) {
      return;
    }
    const timer = window.setTimeout(() => {
      const stage = document.querySelector<HTMLElement>(".mv-stage");
      stage?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -420,
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppTheme appearance={theme}>
      <div className="f-shell" aria-hidden="true">
        <aside className="f-sidebar" style={{ padding: 16, color: "var(--f-muted)" }}>
          Mock chat list
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {["Geraldine", "n8n_test", "免费vpn | 正义的反派", "TgtoDrive 交流互助群", "WOVIA 官方群"].map(
              (name) => (
                <div key={name} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--f-accent-soft)",
                    }}
                  />
                  <span>{name}</span>
                </div>
              ),
            )}
          </div>
        </aside>
        <main className="f-chat-pane" style={{ padding: 24, color: "var(--f-muted)" }}>
          <p>The chat stays visible behind the viewer&apos;s translucent overlay.</p>
        </main>
      </div>
      {open ? (
        <MediaViewer
          items={items}
          initialId={items[items.length - 1].message.id}
          authorOf={() => ({
            name: "Geraldine",
            initials: "G",
            color: "#5b8def",
            avatarUrl: undefined,
          })}
          onClose={() => setOpen(false)}
          onLoadVideo={() => Promise.resolve(SAMPLE_VIDEO)}
          onDownload={() => undefined}
          onForward={() => undefined}
          onDelete={() => undefined}
          onShowInChat={() => undefined}
          onToast={(message) => console.log(message)}
        />
      ) : (
        <div style={{ padding: 40 }}>viewer closed</div>
      )}
    </AppTheme>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
