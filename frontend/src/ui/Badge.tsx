import { Badge as RadixBadge } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface BadgeProps {
  count: number;
  muted?: boolean;
  className?: string;
}

/** Unread counter atom; muted chats use the quiet gray scale. */
export function Badge({ count, muted = false, className }: BadgeProps) {
  return (
    <RadixBadge
      className={cn("f-badge", className)}
      color={muted ? "gray" : "indigo"}
      variant={muted ? "soft" : "solid"}
      radius="full"
      size="1"
    >
      {count > 99 ? "99+" : count}
    </RadixBadge>
  );
}
