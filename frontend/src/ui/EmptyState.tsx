import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Centred empty/loading/error state with the same rhythm as the login card. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("f-empty", className)}>
      <span className="f-empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="f-empty-action">{action}</div> : null}
    </div>
  );
}
