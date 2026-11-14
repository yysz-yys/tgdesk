import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "../lib/cn";
import { peerAvatarBackground } from "../data/telegram";

export interface AvatarProps {
  title: string;
  initials: string;
  /** Flat CSS colour; used when no `seed` is given. */
  color: string;
  /**
   * Peer seed (`kind:id:hash`, `user:123:hash`, …) that picks the Web K
   * peer-colour gradient. Takes precedence over `color`.
   */
  seed?: string;
  size?: number;
  online?: boolean;
  photo?: string;
  className?: string;
}

/**
 * Chat/account avatar: photo when available, deterministic initials otherwise.
 * Letter avatars use Telegram Web K's peer-colour gradient and its letter scale
 * (`Avatar` scss: ~37% of the circle at weight 500, uppercase).
 */
export function Avatar({
  title,
  initials,
  color,
  seed,
  size = 40,
  online = false,
  photo,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photo]);

  const showPhoto = Boolean(photo) && !failed;
  const background = seed != null ? peerAvatarBackground(seed) : color;

  return (
    <span
      className={cn("f-avatar", className)}
      style={
        {
          "--avatar-size": `${size}px`,
          "--avatar-color": background,
          "--avatar-font-size": `${Math.round(size * 0.37)}px`,
        } as CSSProperties
      }
      title={title}
      aria-hidden="true"
      data-photo={showPhoto || undefined}
    >
      {showPhoto ? (
        <img
          className="f-avatar-photo"
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        // `toUpperCase` is a no-op for scripts without case (CJK, Arabic, …).
        <span className="f-avatar-initials">{initials.toUpperCase()}</span>
      )}
      {online ? <span className="f-avatar-online" /> : null}
    </span>
  );
}
