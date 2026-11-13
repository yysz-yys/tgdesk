import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { TextField as RadixTextField } from "@radix-ui/themes";
import { cn } from "../lib/cn";
import { Icon } from "./Icon";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "size" | "color" | "defaultValue" | "type"
> & {
  type?: "text" | "password" | "search" | "tel" | "email" | "url" | "number";
};

export interface TextFieldProps extends InputProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  size?: "1" | "2" | "3";
  leadingIcon?: string;
  trailing?: ReactNode;
  onEnter?: () => void;
  className?: string;
}

/**
 * Text field atom: label, optional hint/error and leading/trailing slots around
 * Radix Themes' input, so every F form shares the same height, radius and state
 * treatment.
 */
export function TextField({
  value,
  onValueChange,
  label,
  hint,
  error,
  size = "3",
  leadingIcon,
  trailing,
  onEnter,
  className,
  id,
  onKeyDown,
  ...props
}: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? `f-field-${generated}`;
  const noteId = `${inputId}-note`;
  const note = error || hint;

  return (
    <div className={cn("f-field", className)}>
      {label ? (
        <label className="f-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <RadixTextField.Root
        {...props}
        id={inputId}
        size={size}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            onEnter
          ) {
            event.preventDefault();
            onEnter();
          }
        }}
      >
        {leadingIcon ? (
          <RadixTextField.Slot side="left">
            <Icon name={leadingIcon} size={16} />
          </RadixTextField.Slot>
        ) : null}
        {trailing ? <RadixTextField.Slot side="right">{trailing}</RadixTextField.Slot> : null}
      </RadixTextField.Root>
      {error ? (
        <span id={noteId} className="f-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className="f-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
