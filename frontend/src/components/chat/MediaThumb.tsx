import { useEffect, useRef, useState } from "react";
import { IconPhoto } from "@tabler/icons-react";
import { Spinner } from "../ui/Spinner";

interface MediaThumbProps {
  chatID: string;
  messageID: number;
  alt: string;
  onLoad: (chatID: string, messageID: number) => Promise<string>;
  className?: string;
}

const thumbCache = new Map<string, string>();

export function MediaThumb({ chatID, messageID, alt, onLoad, className }: MediaThumbProps) {
  const key = `${chatID}:${messageID}`;
  const [src, setSrc] = useState(() => thumbCache.get(key) ?? "");
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (src || failed) {
      return;
    }
    const node = holder.current;
    if (!node) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await onLoad(chatID, messageID);
        if (cancelled) {
          return;
        }
        if (!data) {
          setFailed(true);
          return;
        }
        const next = `data:image/jpeg;base64,${data}`;
        thumbCache.set(key, next);
        setSrc(next);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chatID, failed, key, messageID, onLoad, src]);

  if (src) {
    return (
      <img
        className={className ?? "media-thumb"}
        src={src}
        alt={alt}
        draggable={false}
      />
    );
  }

  return (
    <span ref={holder} className="media-thumb-loading">
      {failed ? <IconPhoto size={26} stroke={1.6} /> : <Spinner size={20} />}
    </span>
  );
}
