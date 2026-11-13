import { Select as RadixSelect } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  size?: "1" | "2" | "3";
  disabled?: boolean;
  className?: string;
}

/** Select atom with the same label rhythm as TextField. */
export function SelectField({
  value,
  onValueChange,
  options,
  label,
  ariaLabel,
  placeholder,
  size = "3",
  disabled,
  className,
}: SelectFieldProps) {
  return (
    <div className={cn("f-field", className)}>
      {label ? <span className="f-field-label">{label}</span> : null}
      <RadixSelect.Root value={value} onValueChange={onValueChange} size={size} disabled={disabled}>
        <RadixSelect.Trigger
          className="f-select-trigger"
          placeholder={placeholder}
          aria-label={ariaLabel ?? label ?? placeholder}
        />
        <RadixSelect.Content position="popper">
          {options.map((option) => (
            <RadixSelect.Item key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </RadixSelect.Item>
          ))}
        </RadixSelect.Content>
      </RadixSelect.Root>
    </div>
  );
}
