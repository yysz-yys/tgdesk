import { useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  label: string;
  clearLabel?: string;
  compact?: boolean;
  trailing?: ReactNode;
}

/**
 * Material 3 search bar. A native input is used here because the compact
 * single-line toolbar search needs a smaller footprint than md-text-field.
 */
export function SearchField({
  value,
  onValueChange,
  onClear,
  label,
  clearLabel = "Clear search",
  placeholder,
  compact = false,
  trailing,
  className,
  ...props
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn("g-search", compact && "g-search--compact", className)}
      role="search"
    >
      <Icon name="search" size={compact ? 19 : 20} className="g-search-icon" />
      <input
        {...props}
        ref={inputRef}
        className="g-search-input"
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {trailing}
      {value ? (
        <button
          type="button"
          className="g-search-clear"
          aria-label={clearLabel}
          onClick={() => {
            onValueChange("");
            onClear?.();
            inputRef.current?.focus();
          }}
        >
          <Icon name="close" size={17} />
        </button>
      ) : null}
    </div>
  );
}
