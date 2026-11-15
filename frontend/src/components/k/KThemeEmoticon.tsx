/**
 * One Appearance tile's figure (the house / chick / snowman / ... at the bottom
 * of a theme card), ported from tweb's `chatThemesPicker`:
 *
 *  - the theme's animated emoji — one of the TGS files bundled with the app, or
 *    (for an emoticon that is not bundled) the Lottie JSON served by the
 *    kernel's animated-emoji endpoint — is drawn paused on its first frame;
 *  - when the tile is clicked the reference plays the whole micro-animation once:
 *    the figure is scaled up to twice its size over the standard transition, a
 *    250 ms beat passes, the Lottie runs to its last frame and the figure
 *    settles back down. Motion only runs at the full animation level (2) and
 *    with the OS reduce-motion preference off, like tweb's `liteMode.motion`.
 *
 * Because the stock figures ship with the app, the first launch animates
 * immediately; a click that still lands before the figure has loaded is
 * remembered and replayed once it is ready, so it is not silently lost.
 *
 * Until the data arrives, or when it cannot be loaded, the plain emoji glyph is
 * shown instead, exactly like tweb's `is-static` fallback.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { AnimationItem } from "lottie-web";
import { loadThemeEmoji } from "./themeEmojiCache";

export interface KThemeEmoticonHandle {
  /** Plays the click micro-animation (a no-op unless full animations are on). */
  play: () => void;
  /** Stops a pending playback and settles the figure back to its resting size. */
  cancel: () => void;
}

interface KThemeEmoticonProps {
  /** The theme's emoticon: the bundled figure's key and the static fallback. */
  emoticon: string;
  /** Loopback URL of the Lottie JSON for an emoticon with no bundled file. */
  url?: string;
  /** Sticker ref id from a previous launch (cache key for the kernel path). */
  cacheRef?: string;
  /** False while the tips deck is closed: nothing is loaded or painted then. */
  enabled?: boolean;
}

/** The beat between the click and the Lottie start, as in the reference picker. */
const PLAY_DELAY = 250;
/** How long a click made while the figure was still loading is replayed for. */
const PENDING_PLAY_TTL = 10000;

/** tweb gates the tile animation on `liteMode.isAvailable('motion')`: full
 * animations (level 2) and no OS-level reduce-motion request. */
function motionEnabled(): boolean {
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return (
    document.querySelector(".k-root")?.getAttribute("data-animation-level") ===
    "2"
  );
}

interface LottieApi {
  loadAnimation: (options: Record<string, unknown>) => AnimationItem;
}

export const KThemeEmoticon = forwardRef<
  KThemeEmoticonHandle,
  KThemeEmoticonProps
>(function KThemeEmoticon(
  { emoticon, url, cacheRef, enabled = true },
  ref,
) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const timerRef = useRef(0);
  const pendingPlayRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) {
      return;
    }
    let cancelled = false;
    let animation: AnimationItem | null = null;

    const load = async () => {
      try {
        const animationData = await loadThemeEmoji(emoticon, url, cacheRef);
        if (cancelled) return;
        const lottie = (await import("lottie-web")).default as unknown as LottieApi;
        if (cancelled) return;
        animation = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animationRef.current = animation;
        const settle = () => animation?.goToAndStop(0, true);
        if (animation.isLoaded) {
          settle();
        } else {
          animation.addEventListener("DOMLoaded", settle);
        }
        setReady(true);
        // A click made while the figure was still loading must not be lost.
        const pending = pendingPlayRef.current;
        pendingPlayRef.current = 0;
        if (pending && Date.now() - pending < PENDING_PLAY_TTL) {
          playAnimation();
        }
      } catch {
        // Keep the static emoji: the tile still explains its theme.
      }
    };

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
      animation?.destroy();
      animationRef.current = null;
      setReady(false);
    };
  }, [emoticon, url, cacheRef, enabled]);

  function stopAnimation() {
    window.clearTimeout(timerRef.current);
    wrapperRef.current?.classList.remove("is-animating");
  }

  function playAnimation() {
    const animation = animationRef.current;
    const wrapper = wrapperRef.current;
    if (!animation || !wrapper || !motionEnabled()) {
      return;
    }
    stopAnimation();
    // Rewind to the resting frame, then restart the scale transition from the
    // current (resting) size, so a fast second click replays it.
    animation.stop();
    animation.goToAndStop(0, true);
    wrapper.classList.remove("is-animating");
    void wrapper.offsetWidth;
    wrapper.classList.add("is-animating");
    timerRef.current = window.setTimeout(() => {
      const settle = () => {
        wrapper.classList.remove("is-animating");
        animation.removeEventListener("complete", settle);
      };
      animation.addEventListener("complete", settle);
      animation.play();
    }, PLAY_DELAY);
  }

  useImperativeHandle(ref, () => ({
    play() {
      if (!motionEnabled()) {
        return;
      }
      if (!animationRef.current) {
        // Still loading: replay the animation once the figure is ready.
        pendingPlayRef.current = Date.now();
        return;
      }
      playAnimation();
    },
    cancel() {
      pendingPlayRef.current = 0;
      stopAnimation();
    },
  }));

  return (
    <span ref={wrapperRef} className="k-tip-theme-emoticon">
      {enabled ? (
        <span ref={hostRef} className="k-tip-theme-lottie" aria-hidden="true" />
      ) : null}
      {ready ? null : (
        <span className="k-tip-theme-emoticon-static" aria-hidden="true">
          {emoticon}
        </span>
      )}
    </span>
  );
});
