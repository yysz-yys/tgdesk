import type { ReactNode } from "react";

/**
 * Web K "control plate" content: `Button.Icon + Button + Button.Icon` laid out
 * inside the same 24 px composer card (tweb controlPlate.tsx). The side slots
 * reserve symmetric space even when empty so the centre button stays centred and
 * the plate keeps exactly the message-input width; with both sides empty the
 * `.is-single` class removes them and the centre spans the plate.
 *
 * The plate shell itself (background, radius, shadow, height) is owned by
 * MessageComposer, which keeps both the writing row and this control row mounted
 * and cross-fades between them (tweb `.rows-wrapper-wrapper.is-centering-*`).
 */
export function ControlPlate({
  leading,
  center,
  trailing,
}: {
  leading?: ReactNode;
  center: ReactNode;
  trailing?: ReactNode;
}) {
  const single = !leading && !trailing;
  return (
    <div
      className={`tg-composer__footer-row${single ? " is-single" : ""}`}
      data-plate-single={single ? true : undefined}
    >
      {single ? null : (
        <div className="tg-composer__footer-side">{leading ?? null}</div>
      )}
      <div className="tg-composer__footer-center">{center}</div>
      {single ? null : (
        <div className="tg-composer__footer-side">{trailing ?? null}</div>
      )}
    </div>
  );
}
