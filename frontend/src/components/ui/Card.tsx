import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export function Card({
  children,
  variant = "outlined",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "outlined" | "elevated" | "filled" | "tonal";
}) {
  return (
    <div className={cn("g-card", className)} data-variant={variant} {...props}>
      {children}
    </div>
  );
}

export function CardIcon({ name, tone = "primary" }: { name: string; tone?: "primary" | "secondary" | "tertiary" }) {
  return (
    <span className="g-card-icon" data-tone={tone}>
      <Icon name={name} size={20} />
    </span>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="g-card-title">{children}</h3>;
}

export function CardBody({ children }: { children: ReactNode }) {
  return <p className="g-card-body">{children}</p>;
}
