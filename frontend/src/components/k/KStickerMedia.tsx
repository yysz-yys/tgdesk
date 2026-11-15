import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StickerDoc } from "../../types";
import { PickerTgsPlayer } from "../chat/picker/PickerTgsPlayer";
import { KIcon } from "./KIcon";
import { stickerLockColor } from "./stickerLockColor";

interface KStickerMediaProps {
  doc: StickerDoc;
  /** False parks the animation and paints the still frame (hidden deck, reduced motion). */
  enabled?: boolean;
  /**
   * Popup grids only animate the cells in view: an 80-entry pack would otherwise
   * start a Lottie/WebM decoder per sticker at once. Tip cards are a fixed row of
   * three and render eagerly.
   */
  lazy?: boolean;
  /**
   * Delay before this cell's animation is mounted, in ms. The popup staggers its
   * visible cells so opening a 40-sticker pack does not build twenty Lottie
   * instances in the same frame; the still thumbnails are already on screen.
   */
  delay?: number;
  /**
   * Paint Web K's premium lock badge over a premium "sticker effect" document
   * (tweb `wrapSticker({withLock: true})`). Hidden for Premium accounts.
   */
  withLock?: boolean;
  className?: string;
}

/**
 * One sticker document in the Web K tips card / sticker-set popup.
 *
 * tweb renders these with `wrapSticker` (`play: true, loop: true`): animated
 * stickers loop, static ones are still images. The kernel serves each document
 * as a still thumbnail plus the full file; this component paints the thumbnail
 * first and hands the animation to the picker's existing TGS/WebM players, which
 * is the same rendering path the composer already uses. The still frame stays up
 * until the animation has painted its first frame, so a loading cell is never
 * blank.
 */
export function KStickerMedia({
  doc,
  enabled = true,
  lazy = false,
  delay = 0,
  withLock = false,
  className,
}: KStickerMediaProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [visible, setVisible] = useState(delay <= 0);
  const [animationReady, setAnimationReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lockUrl, setLockUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    setFailed(false);
    setAnimationReady(false);
  }, [doc.ref]);

  // The lock plate is tinted with the sticker's own bottom-centre colour.
  useEffect(() => {
    if (!withLock || !doc.effect) {
      setLockUrl(undefined);
      return;
    }
    let alive = true;
    void stickerLockColor(doc).then((url) => {
      if (alive) setLockUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [doc, withLock]);

  useEffect(() => {
    if (!lazy) {
      setInView(true);
      return;
    }
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver !== "function") {
      setInView(true);
      return;
    }
    setInView(false);
    // `root: null` still honours the popup's scroll clipping, so a cell parked
    // below the fold is not "in view" until it is scrolled to.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin: "0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [lazy, doc.kind]);

  // Stagger mounting: only once the cell is in view, and never for the tip
  // card's three eager covers.
  useEffect(() => {
    if (!enabled || !inView || delay <= 0) {
      setVisible(enabled && inView);
      return;
    }
    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay, doc.ref, enabled, inView]);

  // Static stickers have no animation: the full document is already the drawing.
  const still =
    doc.kind === "static" ? (doc.photoUrl ?? doc.thumbUrl) : doc.thumbUrl;
  const animate =
    enabled &&
    visible &&
    Boolean(doc.streamUrl) &&
    doc.kind !== "static" &&
    inView;

  const classes = `k-sticker-media${className ? ` ${className}` : ""}`;

  return (
    <span ref={hostRef} className={classes}>
      {animate && doc.kind === "tgs" ? (
        <PickerTgsPlayer
          key={doc.streamUrl}
          src={doc.streamUrl!}
          className="k-sticker-media-anim"
          onLoaded={() => setAnimationReady(true)}
        />
      ) : animate && doc.kind === "webm" ? (
        <video
          key={doc.streamUrl}
          className="k-sticker-media-anim"
          src={doc.streamUrl}
          poster={doc.thumbUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setAnimationReady(true)}
        />
      ) : null}
      {still && !failed && !(animate && animationReady) ? (
        <img
          className="k-sticker-media-img"
          src={still}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : null}
      {withLock && doc.effect ? (
        <KIcon
          name="premium_lock"
          className="premium-sticker-lock"
          style={
            lockUrl
              ? ({ "--lock-url": `url(${lockUrl})` } as CSSProperties)
              : undefined
          }
        />
      ) : null}
    </span>
  );
}
