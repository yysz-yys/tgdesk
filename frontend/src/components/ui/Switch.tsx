import { useEffect, useRef, type ElementType } from "react";
import "@material/web/switch/switch.js";
import { cn } from "../../lib/cn";

const MdSwitch = "md-switch" as unknown as ElementType;

type MaterialSwitch = HTMLElement & { selected: boolean; disabled: boolean };

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Material 3 switch. Uses the `selected` property defined by md-switch. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: SwitchProps) {
  const ref = useRef<MaterialSwitch | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (element.selected !== checked) {
      element.selected = checked;
    }
    element.disabled = disabled;
  }, [checked, disabled]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const handleChange = () => onCheckedChange(element.selected);
    element.addEventListener("change", handleChange);
    return () => element.removeEventListener("change", handleChange);
  }, [onCheckedChange]);

  return (
    <MdSwitch
      ref={ref}
      className={cn("g-switch", className)}
      aria-label={label}
      selected={checked}
      disabled={disabled}
    />
  );
}
