import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export function SelectField({ label, hint, className, children, ...props }: SelectFieldProps) {
  return (
    <label className={cn("tg-field", className)}>
      {label ? <span className="tg-field-label">{label}</span> : null}
      <span className="tg-input-wrap tg-select-wrap">
        <select className="tg-input tg-select" {...props}>
          {children}
        </select>
      </span>
      {hint ? <span className="tg-field-hint">{hint}</span> : null}
    </label>
  );
}
