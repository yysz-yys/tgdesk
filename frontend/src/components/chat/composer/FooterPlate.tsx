import type { ReactNode } from "react";

/**
 * Web K "control plate": the same 24 px floating card as the message composer,
 * used for footer actions (mute/unmute, START, read-only restriction) so the
 * footer keeps one width, height and shadow. Optional side slots hold the
 * comments / gift icon buttons from report §7.
 */
export function FooterPlate({
  center,
  leading,
  trailing,
  className,
  label,
}: {
  center: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`tg-composer tg-composer--footer${className ? ` ${className}` : ""}`}
    >
      <div className="tg-composer__lane">
        <div
          className="tg-composer__plate tg-composer__plate--footer"
          role="group"
          aria-label={label}
        >
          <div className="tg-composer__footer-row">
            {leading ? (
              <div className="tg-composer__footer-side">{leading}</div>
            ) : null}
            <div className="tg-composer__footer-center">{center}</div>
            {trailing ? (
              <div className="tg-composer__footer-side">{trailing}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
