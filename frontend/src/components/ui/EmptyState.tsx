import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Centred Material 3 empty state. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("g-empty-state", className)}>
      <span className="g-empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="g-empty-title">{title}</h2>
      {description ? <p className="g-empty-copy">{description}</p> : null}
      {action ? <div className="g-empty-action">{action}</div> : null}
    </div>
  );
}
