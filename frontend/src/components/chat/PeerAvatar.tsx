import { Avatar } from "../../ui";

interface PeerAvatarProps {
  peerID?: string;
  title: string;
  initials: string;
  color: string;
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
        size={size}
        photo={photo}
        className={className}
      />
    </span>
  );
}
