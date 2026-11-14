import { FooterPlate } from "./FooterPlate";

/**
 * Web K control plate for bots that were never messaged: one wide primary
 * "START" button that sends `/start`. (Report §1.3 / §2 bot rows.)
 */
export function StartPlate({
  label,
  onStart,
}: {
  label: string;
  onStart: () => void;
}) {
  return (
    <FooterPlate
      label={label}
      center={
        <button
          type="button"
          className="tg-composer__wide tg-composer__wide--primary"
          onClick={onStart}
        >
          {label}
        </button>
      }
    />
  );
}
