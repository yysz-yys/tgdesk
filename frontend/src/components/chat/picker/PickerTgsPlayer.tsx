/**
 * One-shot TGS (gzipped Lottie) player for the picker preview overlay.
 *
 * This is the picker-local sibling of `TgsSticker` in `MessageMediaView.tsx`
 * (which is not exported and is IO-driven for message bubbles). The picker only
 * ever mounts it inside the single hover/hold overlay, so it intentionally does
 * not use an IntersectionObserver: it fetches, gunzips when needed, plays, and
 * destroys the lottie instance on unmount. Reduced motion renders one still
 * frame instead of looping.
 */
import { useEffect, useRef, useState } from "react";

interface PickerTgsPlayerProps {
  src: string;
  posterUrl?: string;
  /** Extra class for the host element (sizing lives with the caller). */
  className?: string;
}

interface LottieAnimation {
  destroy: () => void;
  play: () => void;
  pause: () => void;
  goToAndStop: (value: number, isFrame?: boolean) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function PickerTgsPlayer({ src, posterUrl, className }: PickerTgsPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<LottieAnimation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    const reducedMotion = prefersReducedMotion();

    const load = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`sticker ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let text: string;
        if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
          const gzip = new DecompressionStream("gzip");
          const stream = new Blob([buffer]).stream().pipeThrough(gzip);
          text = await new Response(stream).text();
        } else {
          text = await new Response(buffer).text();
        }
        const animationData: unknown = JSON.parse(text);
        const lottie = (await import("lottie-web")).default;
        if (cancelled) {
          return;
        }
        const animation = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: !reducedMotion,
          autoplay: !reducedMotion,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animationRef.current = animation;
        if (reducedMotion) {
          animation.goToAndStop(0, true);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [src]);

  if (failed || !src) {
    return posterUrl ? (
      <img className={className} src={posterUrl} alt="" draggable={false} />
    ) : null;
  }

  return (
    <div
      ref={hostRef}
      className={className}
      data-loaded={loaded || undefined}
      aria-hidden="true"
    />
  );
}
