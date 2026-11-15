import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../ui";
import { useChromeAnimationLevel } from "./useAnimationLevel";
import "./scroll-down-k.css";

interface ScrollDownButtonProps {
  chatId?: string;
  /** Unread messages in the open chat (`Chat.unread`); the Web K badge count. */
  unread?: number;
  /** Muted chats paint the badge secondary instead of primary. */
  muted?: boolean;
  /** Hidden while in-chat search results are shown (`search-results-active`). */
  searchActive?: boolean;
  /** False while the newest history page is still loading (bottom not loaded). */
  bottomLoaded?: boolean;
  /** Runs after the jump (ChatView can mark the chat read / clear the badge). */
  onJump?: () => void;
  className?: string;
}

/** Web K `bubbles.ts:435`: at the bottom while the distance is under 300 px. */
const BOTTOM_THRESHOLD = 300;

/**
 * Web K's scroll-to-bottom button (`bubbles-go-down`,
 * `src/components/chat/input.ts:884-896`, `_chat.scss:1485-1737`): a persistent
 * 48×48 surface circle at the lane's inline end, 56 px above the composer, with
 * the unread `.badge-24` on its corner. It hides through opacity/visibility
 * (not unmount) and is visible while the conversation is scrolled up or the
 * history bottom is not loaded, but never while in-chat search is active.
 *
 * Self-managed: it finds the chat's `.g-message-scroll` scroller itself. Mount
 * it as a direct child of `.g-chat-pane` (sibling of the composer), see the
 * report for the expected ChatView integration.
 */
export function ScrollDownButton({
  chatId,
  unread,
  muted,
  searchActive,
  bottomLoaded = true,
  onJump,
  className,
}: ScrollDownButtonProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scrolledDown, setScrolledDown] = useState(true);
  const [rolling, setRolling] = useState(false);
  const animationLevel = useChromeAnimationLevel();
  const unreadCount = Math.max(0, unread ?? 0);
  const previousUnread = useRef(unreadCount);

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setScrolledDown(distance < BOTTOM_THRESHOLD);
  }, []);

  // Locate the scroller once the pane is in the DOM (and again after a chat
  // switch, when MessageList may mount a fresh scroller).
  useEffect(() => {
    const pane = rootRef.current?.closest(".g-chat-pane");
    const node = pane?.querySelector<HTMLElement>(".g-message-scroll") ?? null;
    scrollerRef.current = node;
    setScrolledDown(true);
    measure();
    if (!node) {
      return;
    }
    const onScroll = () => measure();
    node.addEventListener("scroll", onScroll, { passive: true });
    // New messages (or media growing) change the distance while scrolled up.
    const observer = new MutationObserver(() => measure());
    observer.observe(node, { childList: true, subtree: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => measure());
    resizeObserver?.observe(node);
    if (node.firstElementChild) {
      resizeObserver?.observe(node.firstElementChild);
    }
    return () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, [chatId, measure]);

  // The badge rolls for 200 ms on every count change (tweb setBadgeContent).
  useEffect(() => {
    if (unreadCount === previousUnread.current) {
      return;
    }
    previousUnread.current = unreadCount;
    if (animationLevel < 1) {
      return;
    }
    setRolling(true);
    const id = window.setTimeout(() => setRolling(false), 200);
    return () => window.clearTimeout(id);
  }, [unreadCount, animationLevel]);

  const visible = (!scrolledDown || !bottomLoaded) && !searchActive;

  const jump = () => {
    const node = scrollerRef.current;
    if (node) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: animationLevel >= 2 ? "smooth" : "auto",
      });
      setScrolledDown(true);
    }
    onJump?.();
  };

  return (
    <div
      className={`k-go-down${className ? ` ${className}` : ""}`}
      data-visible={visible || undefined}
      data-search-active={searchActive || undefined}
      ref={rootRef}
    >
      <button
        type="button"
        className="k-go-down-button"
        tabIndex={visible ? 0 : -1}
        aria-label={t("chat.jumpLatest")}
        title={t("chat.jumpLatest")}
        aria-hidden={visible ? undefined : true}
        onClick={jump}
      >
        <Icon name="arrow_downward" size={24} />
        <span
          className={[
            "badge",
            "badge-24",
            "k-go-down-badge",
            muted ? "badge-gray" : "badge-primary",
            unreadCount === 0 ? "is-badge-empty" : "",
            rolling ? "is-rolling" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          <span key={unreadCount} className="k-go-down-badge-value">
            {unreadCount > 0 ? unreadCount : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
