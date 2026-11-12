import { useEffect, useRef, useState } from "react";
import type { Chat } from "../../types";
import { Avatar } from "../ui/Avatar";

export type ChatAvatarLoader = (chatID: string) => Promise<string>;

const photoCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function load(chatID: string, loader: ChatAvatarLoader) {
  if (photoCache.has(chatID)) {
    return Promise.resolve(photoCache.get(chatID) ?? "");
  }
  const current = pending.get(chatID);
  if (current) {
    return current;
  }
  const request = loader(chatID)
    .catch(() => "")
    .then((value) => {
      const next = value ? `data:image/jpeg;base64,${value}` : "";
      photoCache.set(chatID, next);
      pending.delete(chatID);
      return next;
    });
  pending.set(chatID, request);
  return request;
}

interface ChatAvatarProps {
  chat: Chat;
  size?: number;
  className?: string;
  loader: ChatAvatarLoader;
}

/**
 * Lazy profile-photo avatar. The photo request starts only when the avatar is
 * near the viewport, so long dialog lists do not fan out dozens of Telegram
 * calls at once. Initials stay visible if the peer has no photo.
 */
export function ChatAvatar({ chat, size = 42, className, loader }: ChatAvatarProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState(() => photoCache.get(chat.id) ?? "");

  useEffect(() => {
    setPhoto(photoCache.get(chat.id) ?? "");
  }, [chat.id]);

  useEffect(() => {
    if (photo || photoCache.has(chat.id)) {
      return;
    }
    let cancelled = false;
    const host = hostRef.current;
    const start = () => {
      void load(chat.id, loader).then((value) => {
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
  }, [chat.id, loader, photo]);

  return (
    <span ref={hostRef} className="g-chat-avatar">
      <Avatar
        title={chat.title}
        initials={chat.initials}
        color={chat.color}
        size={size}
        online={chat.online}
        photo={photo || undefined}
        className={className}
      />
    </span>
  );
}

export function clearChatAvatarCache() {
  photoCache.clear();
  pending.clear();
}
