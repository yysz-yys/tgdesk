import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/**
 * Material 3 segmented button. Each segment is a native button with
 * `aria-pressed`, so keyboard and screen-reader behaviour stays predictable;
 * the selected segment receives a check icon and the tonal container.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("g-segmented", className)} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className="g-segmented-item"
            data-selected={selected || undefined}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {selected ? (
              <Icon name="check" size={16} />
            ) : option.icon ? (
              <Icon name={option.icon} size={16} />
            ) : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
