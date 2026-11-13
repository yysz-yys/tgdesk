import { useEffect, useState } from "react";
import { Icon } from "../../ui";

interface MediaThumbProps {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}

/**
 * Inline thumbnail served by the loopback image endpoint. Native lazy loading
 * plus the WebView HTTP cache replace the old per-image base64 RPC and the
 * `data/thumbs` files next to the executable.
 */
export function MediaThumb({ src, fallbackSrc, alt, className }: MediaThumbProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setFailed(false);
    setLoaded(false);
  }, [src, fallbackSrc]);

  if (!currentSrc || failed) {
    return (
      <span className="g-media-thumb-loading" data-failed={failed || undefined}>
        <Icon name="image" size={28} />
      </span>
    );
  }

  return (
    <img
      className={className ?? "g-media-thumb"}
      src={currentSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-loaded={loaded || undefined}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
          setLoaded(false);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
