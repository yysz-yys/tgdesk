import { IconAlertCircle, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type CalloutTone = "error" | "info" | "success";

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

const icons = {
  error: IconAlertCircle,
  info: IconInfoCircle,
  success: IconCheck,
};

export function Callout({ tone = "error", title, children, className }: CalloutProps) {
  const Icon = icons[tone];
  return (
    <div className={cn("tg-callout", className)} data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      <Icon size={17} stroke={1.9} className="tg-callout-icon" />
      <div className="tg-callout-body">
        {title ? <div className="tg-callout-title">{title}</div> : null}
        <div className="tg-callout-text">{children}</div>
      </div>
    </div>
  );
}
