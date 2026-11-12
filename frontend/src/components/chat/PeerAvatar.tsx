import { useEffect, useRef, useState } from "react";
import type { ChatAvatarLoader } from "./ChatAvatar";
import { Avatar } from "../ui/Avatar";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function load(peerID: string, loader: ChatAvatarLoader) {
  if (cache.has(peerID)) {
    return Promise.resolve(cache.get(peerID) ?? "");
  }
  const current = pending.get(peerID);
  if (current) {
    return current;
  }
  const request = loader(peerID)
    .catch(() => "")
    .then((value) => {
      const next = value ? `data:image/jpeg;base64,${value}` : "";
      cache.set(peerID, next);
      pending.delete(peerID);
      return next;
    });
  pending.set(peerID, request);
  return request;
}

interface PeerAvatarProps {
  peerID?: string;
  title: string;
  initials: string;
  color: string;
  size?: number;
  loader: ChatAvatarLoader;
  className?: string;
}

/** Lazy sender avatar for group/channel messages. */
export function PeerAvatar({
  peerID,
  title,
  initials,
  color,
  size = 32,
  loader,
  className,
}: PeerAvatarProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState(() => (peerID ? cache.get(peerID) ?? "" : ""));

  useEffect(() => {
    setPhoto(peerID ? cache.get(peerID) ?? "" : "");
  }, [peerID]);

  useEffect(() => {
    if (!peerID || photo || cache.has(peerID)) {
      return;
    }
    let cancelled = false;
    const host = hostRef.current;
    const start = () => {
      void load(peerID, loader).then((value) => {
        if (!cancelled) {
          setPhoto(value);
        }
      });
    };
    if (!host || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loader, peerID, photo]);

  return (
    <span ref={hostRef} className="g-peer-avatar">
      <Avatar
        title={title}
        initials={initials}
        color={color}
        size={size}
        photo={photo || undefined}
        className={className}
      />
    </span>
  );
}
