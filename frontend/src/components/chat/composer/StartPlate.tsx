import { ControlPlate } from "./ControlPlate";
import { ComposerButton } from "./ComposerButton";

/**
 * Web K control plate for a bot that was never messaged (or is blocked): one
 * wide primary START button that calls messages.startBot, matching
 * input.ts:2478-2498 / 3458. The plate is the same card as the message plate,
 * so it cross-fades in place.
 */
export function StartPlate({
  label,
  onStart,
  disabled,
}: {
  label: string;
  onStart: () => void;
  disabled?: boolean;
}) {
  return (
    <ControlPlate
      center={
        <ComposerButton
          className="tg-composer__plate-button tg-composer__plate-button--primary"
          disabled={disabled}
          onClick={onStart}
        >
          {label}
        </ComposerButton>
      }
    />
  );
}
