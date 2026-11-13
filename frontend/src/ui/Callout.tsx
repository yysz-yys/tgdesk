import type { ReactNode } from "react";
import { Callout as RadixCallout } from "@radix-ui/themes";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

export type CalloutTone = "error" | "info" | "success" | "warning";

const TONE = {
  error: { color: "red", icon: "error" },
  info: { color: "indigo", icon: "info" },
  success: { color: "green", icon: "check_circle" },
  warning: { color: "amber", icon: "warning" },
} as const;

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Inline message atom used for auth errors, notices and import failures. */
export function Callout({ tone = "error", title, children, className }: CalloutProps) {
  const look = TONE[tone];
  return (
    <RadixCallout.Root
      color={look.color}
      variant="soft"
      size="1"
      role={tone === "error" ? "alert" : "status"}
      className={cn("f-callout", className)}
    >
      <RadixCallout.Icon>
        <Icon name={look.icon} size={16} />
      </RadixCallout.Icon>
      <RadixCallout.Text>
        {title ? <strong>{title}</strong> : null}
        {title ? " " : null}
        {children}
      </RadixCallout.Text>
    </RadixCallout.Root>
  );
}
