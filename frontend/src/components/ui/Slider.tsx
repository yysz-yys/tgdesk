import { useEffect, useRef, type ElementType } from "react";
import "@material/web/slider/slider.js";
import { cn } from "../../lib/cn";

const MdSlider = "md-slider" as unknown as ElementType;

type MaterialSlider = HTMLElement & { value: number; disabled: boolean };

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Material 3 slider. */
export function Slider({
  value,
  min = 1,
  max = 16,
  step = 1,
  onValueChange,
  label,
  disabled = false,
  className,
}: SliderProps) {
  const ref = useRef<MaterialSlider | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element && element.value !== value) {
      element.value = value;
    }
    if (element) {
      element.disabled = disabled;
    }
  }, [disabled, value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const handleInput = () => onValueChange(Number(element.value));
    element.addEventListener("input", handleInput);
    return () => element.removeEventListener("input", handleInput);
  }, [onValueChange]);

  return (
    <MdSlider
      ref={ref}
      className={cn("g-slider", className)}
      min={min}
      max={max}
      step={step}
      value={value}
      valueLabel={String(value)}
      labeled
      aria-label={label}
      disabled={disabled}
    />
  );
}
