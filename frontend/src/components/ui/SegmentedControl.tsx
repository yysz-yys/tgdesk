import type { ElementType } from "react";
import "@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js";
import "@material/web/labs/segmentedbutton/outlined-segmented-button.js";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

const MdSegmentedButtonSet = "md-outlined-segmented-button-set" as unknown as ElementType;
const MdSegmentedButton = "md-outlined-segmented-button" as unknown as ElementType;

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

/** Google's official outlined segmented button set. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <MdSegmentedButtonSet
      className={cn("g-segmented", className)}
      aria-label={label}
    >
      {options.map((option) => (
        <MdSegmentedButton
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <Icon slot="icon" name={option.icon} size={16} /> : null}
        </MdSegmentedButton>
      ))}
    </MdSegmentedButtonSet>
  );
}
