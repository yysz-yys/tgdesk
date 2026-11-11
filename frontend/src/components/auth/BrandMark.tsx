import { IconBrandTelegram } from "@tabler/icons-react";
import { cn } from "../../lib/cn";

export function BrandMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("tg-brand-mark", className)} style={{ width: size, height: size }}>
      <IconBrandTelegram size={Math.round(size * 0.58)} stroke={1.8} aria-hidden="true" />
    </span>
  );
}
