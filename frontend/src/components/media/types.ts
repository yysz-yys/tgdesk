import type { Message } from "../../types";

/** Media kinds the full-screen viewer can page through. */
export type ViewerKind = "photo" | "video" | "animation" | "video_note";

/** One slide of the media viewer: a single message's viewable media. */
export interface ViewerItem {
  message: Message;
  kind: ViewerKind;
  /** Full-size image URL (photos) or poster fallback for documents. */
  imageUrl?: string;
  /** Small thumbnail used as the opening snapshot and loading backdrop. */
  thumbUrl?: string;
  /** Directly playable URL (animations/GIFs); videos are resolved lazily. */
  streamUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  name?: string;
}

/** Viewport rectangle captured from the clicked thumbnail for the open animation. */
export interface ViewerSource {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Effective corner radius of the clicked thumbnail, in CSS pixels. */
  radius: number;
  /** Thumbnail shown while the media morphs out of its bubble. */
  imageUrl?: string;
}

/** Captures the clicked media element so the viewer can grow out of its bubble. */
export function captureViewerSource(
  element: HTMLElement | null | undefined,
  imageUrl?: string,
): ViewerSource | undefined {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return undefined;
  }
  const style = window.getComputedStyle(element);
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius,
    imageUrl,
  };
}

export interface ViewerAuthor {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
  peerId?: string;
}

const VIEWABLE_KINDS = new Set<ViewerKind>([
  "photo",
  "video",
  "animation",
  "video_note",
]);

export function viewerKindFor(message: Message): ViewerKind | undefined {
  const kind = message.media?.kind as ViewerKind | undefined;
  if (!kind || !VIEWABLE_KINDS.has(kind) || !message.media) {
    return undefined;
  }
  return kind;
}

export function viewerItemFor(message: Message): ViewerItem | undefined {
  const media = message.media;
  const kind = viewerKindFor(message);
  if (!media || !kind) {
    return undefined;
  }
  return {
    message,
    kind,
    imageUrl: media.photoUrl || (kind === "photo" ? media.thumbUrl : undefined),
    thumbUrl: media.thumbUrl || (kind === "photo" ? media.photoUrl : undefined),
    streamUrl: media.streamUrl,
    width: media.width,
    height: media.height,
    duration: media.duration,
    name: media.name,
  };
}

/** Flat, chronological list of the viewable media in a loaded chat history. */
export function viewerItemsFrom(messages: Message[]): ViewerItem[] {
  const items: ViewerItem[] = [];
  for (const message of messages) {
    const item = viewerItemFor(message);
    if (item) {
      items.push(item);
    }
  }
  return items;
}
