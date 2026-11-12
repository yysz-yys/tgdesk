import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import "@material/web/tabs/tabs.js";
import "@material/web/tabs/primary-tab.js";
import { cn } from "../../lib/cn";

const MdTabs = "md-tabs" as unknown as ElementType;
const MdPrimaryTab = "md-primary-tab" as unknown as ElementType;

type MaterialTabs = HTMLElement & { activeTabIndex: number };

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

/** Material 3 primary tabs. Content panels stay owned by the caller. */
export function Tabs({ items, value, onChange, ariaLabel, className }: TabsProps) {
  const ref = useRef<MaterialTabs | null>(null);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  useEffect(() => {
    const element = ref.current;
    if (element && element.activeTabIndex !== activeIndex) {
      element.activeTabIndex = activeIndex;
    }
  }, [activeIndex]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const handleChange = () => {
      const next = items[element.activeTabIndex];
      if (next && next.value !== value) {
        onChange(next.value);
      }
    };
    element.addEventListener("change", handleChange);
    return () => element.removeEventListener("change", handleChange);
  }, [items, onChange, value]);

  return (
    <MdTabs
      ref={ref}
      className={cn("g-tabs", className)}
      aria-label={ariaLabel}
      activeTabIndex={activeIndex}
    >
      {items.map((item) => (
        <MdPrimaryTab key={item.value} id={`tab-${item.value}`}>
          <span className="g-tab-label">
            {item.label}
            {typeof item.count === "number" ? (
              <span className="g-tab-count">{item.count}</span>
            ) : null}
          </span>
        </MdPrimaryTab>
      ))}
    </MdTabs>
  );
}
