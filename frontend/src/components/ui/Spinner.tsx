import { createElement } from "react";
import type { CSSProperties, ElementType } from "react";
import "@material/web/progress/circular-progress.js";

const MdCircularProgress = "md-circular-progress" as unknown as ElementType;

/** Material 3 circular progress indicator. */
export function Spinner({
  size = 20,
  label,
  style,
  className,
}: {
  size?: number;
  label?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return createElement(MdCircularProgress, {
    indeterminate: true,
    className,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: { width: size, height: size, ...style },
  });
}

export const CircularProgress = Spinner;
