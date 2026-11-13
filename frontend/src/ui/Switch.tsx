import { Switch as RadixSwitch } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "1" | "2" | "3";
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  size = "2",
  className,
}: SwitchProps) {
  return (
    <RadixSwitch
      className={cn("f-switch", className)}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      size={size}
      color="indigo"
    />
  );
}
