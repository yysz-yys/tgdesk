import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "../lib/cn";

export interface AvatarProps {
  title: string;
  initials: string;
  color: string;
  size?: number;
  online?: boolean;
  photo?: string;
  className?: string;
}

/** Chat/account avatar: photo when available, deterministic initials otherwise. */
export function Avatar({
  title,
  initials,
  color,
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

  return (
    <span
      className={cn("f-avatar", className)}
      style={
        {
          "--avatar-size": `${size}px`,
          "--avatar-color": color,
          "--avatar-font-size": `${Math.max(11, Math.round(size * 0.36))}px`,
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
        <span className="f-avatar-initials">{initials}</span>
      )}
      {online ? <span className="f-avatar-online" /> : null}
    </span>
  );
}
