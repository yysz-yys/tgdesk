import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { KIcon } from "./KIcon";

export interface KSuperTabEntry {
  /** Stable identity of the page; changing it plays the push/pop transition. */
  key: string;
  body: ReactNode;
}

/**
 * Web K's SliderSuperTab stack inside the left column (tweb
 * components/slider.ts + sliderTab.ts + transition.ts, the `navigation`
 * TransitionSlider): a page opened from the chat list slides in over it from
 * the inline end while the page underneath moves a quarter of the column
 * towards the start and dims, and closing reverses the pair. Pages that cannot
 * be represented by a DOM element (they are React trees) are stacked by index,
 * so the top entry is the one on screen.
 */
export function KSuperTabHost({ stack }: { stack: KSuperTabEntry[] }) {
  const [leaving, setLeaving] = useState<KSuperTabEntry[]>([]);
  const previous = useRef<KSuperTabEntry[]>(stack);
  const signature = stack.map((entry) => entry.key).join("\u0001");
  const previousSignature = useRef(signature);
  const exitTimer = useRef(0);

  useEffect(() => {
    if (previousSignature.current === signature) {
      previous.current = stack;
      return;
    }
    const before = previous.current;
    const isPop = stack.length < before.length;
    previousSignature.current = signature;
    previous.current = stack;
    window.clearTimeout(exitTimer.current);
    if (!isPop) {
      // Opening a page over one that was still closing: drop the exit layer.
      setLeaving([]);
      return;
    }
    const removed = before.slice(stack.length);
    setLeaving(removed);
    exitTimer.current = window.setTimeout(() => setLeaving([]), 340);
  }, [signature, stack]);

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  if (stack.length === 0 && leaving.length === 0) {
    return null;
  }

  const rendered = [...stack, ...leaving];
  return (
    <div className="k-super-tabs" aria-live="polite">
      {rendered.map((entry, index) => {
        const isLeaving = index >= stack.length;
        const isCovered = index < stack.length - 1;
        const classes = [
          "k-super-tab-layer",
          isLeaving ? "is-leaving" : "is-open",
          isCovered ? "is-covered" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={entry.key}
            className={classes}
            style={{ zIndex: index + 1 } as CSSProperties}
            data-tab-key={entry.key}
            aria-hidden={isCovered || isLeaving || undefined}
          >
            {entry.body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The header of a Web K sidebar super tab (tweb's slider tab header): a round
 * back button, the title and optional trailing controls.
 */
export function KSuperTabHeader({
  title,
  onBack,
  backLabel,
  children,
}: {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sidebar-header k-super-tab-header">
      {onBack ? (
        <button
          type="button"
          className="btn-icon sidebar-close-button"
          aria-label={backLabel}
          onClick={onBack}
        >
          <KIcon name="left" className="button-icon" />
        </button>
      ) : null}
      <div className="sidebar-header__title">{title}</div>
      {children}
    </div>
  );
}
