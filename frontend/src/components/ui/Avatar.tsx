import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "../../lib/cn";

interface AvatarProps {
  title: string;
  initials: string;
  color: string;
  size?: number;
  online?: boolean;
  photo?: string;
  className?: string;
}

/** Google-style account/chat avatar with a real photo fallback to initials. */
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
      className={cn("g-avatar", className)}
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
          className="g-avatar-photo"
          src={photo}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="g-avatar-initials">{initials}</span>
      )}
      {online ? <span className="g-avatar-online" /> : null}
    </span>
  );
}
