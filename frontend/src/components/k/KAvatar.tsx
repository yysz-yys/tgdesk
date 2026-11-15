import type { CSSProperties, ReactNode } from "react";
import type { Chat } from "../../types";
import { chatAbbreviation, peerColorName } from "./model";
import { KIcon } from "./KIcon";
import { KAvatarAutoDelete } from "./KAvatarAutoDelete";
import { autoDeleteBadge } from "./avatarAutoDelete";

type AvatarKind = "peer" | "saved" | "archive";

interface KAvatarProps {
  chat?: Chat;
  kind?: AvatarKind;
  className?: string;
  /** Circle size in px (54 in the chat list, 40 in the tips peer tiles). */
  size?: number;
}

/**
 * Web K chat-list avatar: a 54px circle with either the peer's photo or the
 * gradient palette entry (`abs(peerId) % 7`), plus the TTL badge and online dot.
 */
export function KAvatar({
  chat,
  kind = "peer",
  className,
  size = 54,
}: KAvatarProps) {
  const isSaved = kind === "saved" || Boolean(chat?.saved);
  const isArchive = kind === "archive";

  let inner: ReactNode;
  let dataColor: string | undefined;

  if (isArchive) {
    dataColor = "archive";
    inner = (
      <div className="archive-media-content">
        <KIcon name="archive_filled" className="archive-media-icon" />
      </div>
    );
  } else if (isSaved) {
    inner = <KIcon name="saved_filled" className="avatar-icon avatar-icon-saved_filled" />;
  } else if (chat?.avatarUrl) {
    inner = (
      <img
        className="avatar-photo"
        src={chat.avatarUrl}
        alt=""
        draggable={false}
        decoding="async"
      />
    );
  } else {
    dataColor = chat ? peerColorName(chat) : "blue";
    inner = (chat ? chatAbbreviation(chat.title) : "T").toUpperCase();
  }

  // Auto-delete timers show on photo and coloured avatars alike (tweb paints the
  // 1D/2D badge over every dialog avatar with a TTL).
  const badge = !isSaved && !isArchive ? autoDeleteBadge(chat?.ttl) : null;
  const hasPhoto = Boolean(chat?.avatarUrl);

  return (
    <div
      className={[
        "avatar avatar-like avatar-54 avatar-gradient row-media row-media-bigger dialog-avatar",
        !isArchive && !isSaved && chat?.online ? "is-online" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-color={dataColor}
      data-peer-id={chat?.id}
      role="img"
      aria-label={chat?.title}
      style={{ "--size": `${size}px` } as CSSProperties}
    >
      {inner}
      {badge ? (
        <KAvatarAutoDelete
          badge={badge}
          photoUrl={hasPhoto ? chat?.avatarUrl : undefined}
          colored={!hasPhoto}
        />
      ) : null}
    </div>
  );
}
