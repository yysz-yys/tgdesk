import { Avatar } from "../../ui";

interface PeerAvatarProps {
  peerID?: string;
  title: string;
  initials: string;
  color: string;
  /** Peer seed for Web K's gradient letter avatar (`kind:id:hash`). */
  seed?: string;
  photo?: string;
  size?: number;
  className?: string;
}

/**
 * Lazy sender avatar for group/channel messages. `photo` is the loopback URL
 * generated with the message; the browser defers and caches the request.
 */
export function PeerAvatar({
  title,
  initials,
  color,
  seed,
  photo,
  size = 32,
  className,
}: PeerAvatarProps) {
  return (
    <span className="g-peer-avatar">
      <Avatar
        title={title}
        initials={initials}
        color={color}
        seed={seed}
        size={size}
        photo={photo}
        className={className}
      />
    </span>
  );
}
