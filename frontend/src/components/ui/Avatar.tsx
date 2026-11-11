import { cn } from "../../lib/cn";

interface AvatarProps {
  title: string;
  initials: string;
  color: string;
  size?: number;
  online?: boolean;
  className?: string;
}

export function Avatar({
  title,
  initials,
  color,
  size = 54,
  online = false,
  className,
}: AvatarProps) {
  const dot = Math.max(9, Math.round(size * 0.2));

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden="true"
    >
      <span
        className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
        style={{
          background: color,
          fontSize: Math.round(size * 0.34),
          letterSpacing: "-0.02em",
        }}
      >
        {initials}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2"
          style={{
            width: dot,
            height: dot,
            background: "#4dcd5e",
            borderColor: "var(--tg-sidebar)",
          }}
        />
      )}
    </span>
  );
}
