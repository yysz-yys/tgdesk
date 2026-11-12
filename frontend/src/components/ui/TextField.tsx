import { useEffect, useRef, type ElementType } from "react";
import "@material/web/textfield/outlined-text-field.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

const MdTextField = "md-outlined-text-field" as unknown as ElementType;

type MaterialTextField = HTMLElement & {
  value: string;
  error: boolean;
  errorText: string;
  supportingText: string;
  disabled: boolean;
  focus: () => void;
};

export interface TextFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  type?: "text" | "password" | "search" | "tel" | "email" | "url" | "number" | "textarea";
  supportingText?: string;
  errorText?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: string;
  autoComplete?: string;
  maxLength?: number;
  name?: string;
  required?: boolean;
  rows?: number;
  leadingIcon?: string;
  trailingIcon?: string;
  className?: string;
  onEnter?: () => void;
}

/**
 * Outlined Material 3 text field. Value and validation state are synchronised
 * onto Google's `md-outlined-text-field` element; input events are observed on
 * the host because the real input lives in the component's shadow root.
 */
export function TextField({
  value,
  onValueChange,
  label,
  ariaLabel,
  placeholder,
  type = "text",
  supportingText,
  errorText,
  disabled = false,
  autoFocus = false,
  inputMode,
  autoComplete,
  maxLength,
  name,
  required = false,
  rows,
  leadingIcon,
  trailingIcon,
  className,
  onEnter,
}: TextFieldProps) {
  const ref = useRef<MaterialTextField | null>(null);

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
    element.error = Boolean(errorText);
    element.errorText = errorText ?? "";
    element.supportingText = supportingText ?? "";
    element.disabled = disabled;
  }, [disabled, errorText, supportingText]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const handleInput = () => onValueChange(element.value);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        type !== "textarea" &&
        onEnter
      ) {
        event.preventDefault();
        onEnter();
      }
    };

    element.addEventListener("input", handleInput);
    element.addEventListener("keydown", handleKeyDown);
    return () => {
      element.removeEventListener("input", handleInput);
      element.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEnter, onValueChange, type]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const timer = window.setTimeout(() => ref.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  return (
    <MdTextField
      ref={ref}
      className={cn("g-text-field", className)}
      label={label}
      aria-label={ariaLabel}
      placeholder={placeholder}
      type={type}
      name={name}
      required={required}
      disabled={disabled}
      maxLength={maxLength}
      rows={rows}
      inputMode={inputMode}
      autocomplete={autoComplete}
    >
      {leadingIcon ? <Icon name={leadingIcon} slot="leading-icon" size={20} /> : null}
      {trailingIcon ? <Icon name={trailingIcon} slot="trailing-icon" size={20} /> : null}
    </MdTextField>
  );
}
