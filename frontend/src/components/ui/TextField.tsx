import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  fieldClassName?: string;
}

export function TextField({
  label,
  hint,
  error,
  leading,
  trailing,
  fieldClassName,
  className,
  id,
  ...props
}: TextFieldProps) {
  const inputId = id ?? props.name;
  return (
    <label className={cn("tg-field", className)}>
      {label ? <span className="tg-field-label">{label}</span> : null}
      <span className={cn("tg-input-wrap", fieldClassName)} data-invalid={error ? true : undefined}>
        {leading ? <span className="tg-input-affix">{leading}</span> : null}
        <input id={inputId} className="tg-input" {...props} />
        {trailing ? <span className="tg-input-affix">{trailing}</span> : null}
      </span>
      {error ? <span className="tg-field-error">{error}</span> : hint ? <span className="tg-field-hint">{hint}</span> : null}
    </label>
  );
}
