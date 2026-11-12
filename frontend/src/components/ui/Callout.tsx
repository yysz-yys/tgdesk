import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

type CalloutTone = "error" | "info" | "success" | "warning";

const TONE_ICONS: Record<CalloutTone, string> = {
  error: "error",
  info: "info",
  success: "check_circle",
  warning: "warning",
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Material 3 tonal message card used for inline errors and notices. */
export function Callout({ tone = "error", title, children, className }: CalloutProps) {
  return (
    <div
      className={cn("g-callout", className)}
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={TONE_ICONS[tone]} size={20} className="g-callout-icon" filled />
      <div className="g-callout-copy">
        {title ? <div className="g-callout-title">{title}</div> : null}
        <div className="g-callout-text">{children}</div>
      </div>
    </div>
  );
}
