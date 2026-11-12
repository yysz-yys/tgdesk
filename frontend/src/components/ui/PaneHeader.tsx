import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface PaneHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  titleAdornment?: ReactNode;
  className?: string;
  /** Use the 16px conversation-heading style instead of the 22px pane title. */
  dense?: boolean;
}

/**
 * Shared 64px top app bar used by the conversation list, chat view and
 * downloads pane. Keeping one header primitive makes title sizes, paddings,
 * dividers and action slots identical across the app.
 */
export function PaneHeader({
  title,
  subtitle,
  leading,
  actions,
  titleAdornment,
  className,
  dense = false,
}: PaneHeaderProps) {
  return (
    <header
      className={cn("g-pane-header", className)}
      data-dense={dense || undefined}
      data-with-leading={leading ? "" : undefined}
    >
      {leading ? <div className="g-pane-header-leading">{leading}</div> : null}
      <div className="g-pane-header-copy">
        <div className="g-pane-header-title-row">
          <h1 className="g-pane-header-title">{title}</h1>
          {titleAdornment}
        </div>
        {subtitle ? <div className="g-pane-header-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="g-pane-header-actions">{actions}</div> : null}
    </header>
  );
}
