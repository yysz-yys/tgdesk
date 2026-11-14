import { useEffect, useLayoutEffect, useRef } from "react";
import { formatBadgeCount } from "./model";

export interface KFolderTab {
  id: string;
  label: string;
  unread: number;
  muted?: boolean;
}

interface KFolderTabsProps {
  tabs: KFolderTab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * The folder chip strip floating over the chat list (tweb's FoldersTabs over
 * Tabs.MenuScrollable): a 48px white plate with 40px chips; the active chip
 * keeps a pale accent pill (`.menu-horizontal-div-item-background`) that slides
 * between chips, as tweb's horizontalMenu moves it.
 */
export function KFolderTabs({ tabs, active, onChange }: KFolderTabsProps) {
  const itemsRef = useRef(new Map<string, HTMLDivElement>());
  const previousActive = useRef<string>(active);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Wheel over the strip walks it sideways, exactly like tweb's Scrollable with
  // axis="x" (components/scrollable2.tsx onWheel: deltaY / 4, a plain wheel
  // only). The native horizontal bar stays hidden.
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation();
      if (!event.deltaX && element.scrollWidth > element.clientWidth) {
        const rtl = document.dir === "rtl";
        element.scrollLeft += (event.deltaY / 4) * (rtl ? -1 : 1);
        event.preventDefault();
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // Selecting a tab scrolls it into view, centred like tweb's selectTarget /
  // fastSmoothScroll (only when the strip actually overflows).
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    const item = itemsRef.current.get(active);
    if (!element || !item) return;
    if (element.scrollWidth <= element.clientWidth) return;
    const target =
      item.offsetLeft + item.offsetWidth / 2 - element.clientWidth / 2;
    element.scrollTo({
      left: Math.max(0, Math.min(target, element.scrollWidth - element.clientWidth)),
      behavior: "smooth",
    });
  }, [active]);

  useLayoutEffect(() => {
    const previousId = previousActive.current;
    previousActive.current = active;
    if (previousId === active) return;

    const previousEl = itemsRef.current.get(previousId);
    const currentEl = itemsRef.current.get(active);
    if (!previousEl || !currentEl) return;

    const indicator = currentEl.querySelector<HTMLElement>(
      ".menu-horizontal-div-item-background",
    );
    const previousIndicator = previousEl.querySelector<HTMLElement>(
      ".menu-horizontal-div-item-background",
    );
    if (!indicator || !previousIndicator) return;

    const shiftLeft = previousEl.offsetLeft - currentEl.offsetLeft;
    const clientWidth = indicator.clientWidth;
    if (!clientWidth) return;
    const scaleFactor = previousIndicator.clientWidth / clientWidth;

    indicator.classList.remove("animate");
    indicator.style.transform = `translate3d(${shiftLeft}px, 0, 0)`;
    indicator.style.width = `${clientWidth * scaleFactor}px`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        indicator.classList.add("animate");
        indicator.style.transform = "none";
        indicator.style.width = "";
      });
    });
  }, [active]);

  return (
    <div className="chatlist-overlay">
      {/* tweb Tabs.MenuGradient (appDialogsManager passes it as
          `folders-tabs-gradient`): the list scrolls under the floating panel, so
          a surface-coloured gradient fades the rows out as they pass behind the
          chip plate instead of cutting them sharply. */}
      <div className="menu-horizontal-gradient-container folders-tabs-gradient-container">
        <div className="menu-horizontal-gradient menu-horizontal-gradient-color-surface menu-horizontal-gradient-smaller folders-tabs-gradient" />
      </div>
      <div className="menu-horizontal-scrollable folders-tabs-scrollable">
        <div className="k-scroll-x" ref={scrollerRef}>
          <div className="menu-horizontal-div" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.id === active;
              return (
                <div
                  key={tab.id}
                  ref={(element) => {
                    if (element) itemsRef.current.set(tab.id, element);
                    else itemsRef.current.delete(tab.id);
                  }}
                  className={
                    isActive
                      ? "menu-horizontal-div-item active"
                      : "menu-horizontal-div-item"
                  }
                  role="tab"
                  aria-selected={isActive}
                  data-filter-id={tab.id}
                  onClick={() => onChange(tab.id)}
                >
                  <i
                    className="menu-horizontal-div-item-background"
                    aria-hidden="true"
                  />
                  <div className="menu-horizontal-div-item-span">
                    <span className="text-super" dir="auto">
                      {tab.label}
                    </span>
                    {tab.unread > 0 ? (
                      <div
                        className={
                          tab.muted
                            ? "badge badge-20 badge-gray"
                            : "badge badge-20 badge-primary"
                        }
                      >
                        {formatBadgeCount(tab.unread)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
