import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type ElementType,
} from "react";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/textfield/filled-text-field.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

type MaterialSearchField = HTMLElement & {
  value: string;
  focus: () => void;
};

const MdFilledTextField = "md-filled-text-field" as unknown as ElementType;
const MdIconButton = "md-icon-button" as unknown as ElementType;

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  label: string;
  clearLabel?: string;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  className?: string;
  trailing?: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Search is Google's filled text field with a leading search icon and a
 * trailing clear icon button. The wrapper only supplies search semantics.
 */
export function SearchField({
  value,
  onValueChange,
  onClear,
  label,
  clearLabel = "Clear search",
  placeholder,
  compact = false,
  autoFocus = false,
  trailing,
  className,
  onKeyDown,
}: SearchFieldProps) {
  const fieldRef = useRef<MaterialSearchField | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (field && field.value !== value) {
      field.value = value;
    }
  }, [value]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const handleInput = () => onValueChange(field.value);
    field.addEventListener("input", handleInput);
    return () => field.removeEventListener("input", handleInput);
  }, [onValueChange]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const timer = window.setTimeout(() => fieldRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  return (
    <div
      className={cn("g-search", compact && "g-search--compact", className)}
      role="search"
      onKeyDown={onKeyDown}
    >
      <MdFilledTextField
        ref={fieldRef as unknown as Ref<HTMLDivElement>}
        className="g-search-field"
        placeholder={placeholder}
        aria-label={label}
      >
        <Icon slot="leading-icon" name="search" size={compact ? 19 : 20} />
        {value ? (
          <MdIconButton
            slot="trailing-icon"
            className="g-search-clear"
            aria-label={clearLabel}
            onClick={() => {
              onValueChange("");
              onClear?.();
              fieldRef.current?.focus();
            }}
          >
            <Icon name="close" size={18} />
          </MdIconButton>
        ) : null}
      </MdFilledTextField>
      {trailing}
    </div>
  );
}
