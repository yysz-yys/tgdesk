import { useEffect, useRef, type ElementType } from "react";
import "@material/web/select/outlined-select.js";
import "@material/web/select/select-option.js";
import { cn } from "../../lib/cn";

const MdSelect = "md-outlined-select" as unknown as ElementType;
const MdOption = "md-select-option" as unknown as ElementType;

type MaterialSelect = HTMLElement & {
  value: string;
  disabled: boolean;
};

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  label?: string;
  supportingText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Outlined Material 3 select backed by Google's md-outlined-select. */
export function SelectField({
  value,
  onValueChange,
  options,
  label,
  supportingText,
  disabled = false,
  className,
  ariaLabel,
}: SelectFieldProps) {
  const ref = useRef<MaterialSelect | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element && element.value !== value) {
      element.value = value;
    }
  }, [value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.disabled = disabled;
    const handleChange = () => onValueChange(element.value);
    element.addEventListener("change", handleChange);
    return () => element.removeEventListener("change", handleChange);
  }, [disabled, onValueChange]);

  return (
    <MdSelect
      ref={ref}
      className={cn("g-select-field", className)}
      label={label}
      supportingText={supportingText}
      disabled={disabled}
      aria-label={ariaLabel}
      menuPositioning="fixed"
      clampMenuWidth
    >
      {options.map((option) => (
        <MdOption
          key={option.value}
          value={option.value}
          selected={option.value === value}
          disabled={option.disabled}
        >
          <div slot="headline">{option.label}</div>
        </MdOption>
      ))}
    </MdSelect>
  );
}
