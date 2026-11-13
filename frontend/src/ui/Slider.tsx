import { Slider as RadixSlider } from "@radix-ui/themes";
import { cn } from "../lib/cn";

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  className,
}: SliderProps) {
  return (
    <RadixSlider
      className={cn("f-slider", className)}
      value={[value]}
      onValueChange={(next) => onValueChange(next[0] ?? value)}
      min={min}
      max={max}
      step={step}
      size="1"
      aria-label={label}
    />
  );
}
