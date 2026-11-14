import { useTranslation } from "react-i18next";
import { Icon } from "../../../ui";
import { formatSlowTimer } from "./model";

/**
 * Compact slow-mode hint. Web K shows slow mode as a tooltip on the send
 * button, so the visible part stays small: a clock chip with the remaining
 * seconds; the full sentence lives in the title/aria description.
 */
export function SlowModeHint({
  configuredSeconds,
  remainingSeconds,
}: {
  configuredSeconds: number;
  remainingSeconds: number;
}) {
  const { t } = useTranslation();
  if (configuredSeconds <= 0) {
    return null;
  }
  const timer = formatSlowTimer(remainingSeconds);
  const title =
    remainingSeconds > 0
      ? t("input.slowModeHint", { timer })
      : t("input.slowMode");

  return (
    <span
      className="tg-composer__slow"
      data-counting={remainingSeconds > 0 ? true : undefined}
      title={title}
      aria-label={title}
      role="timer"
    >
      <Icon name="schedule" size={15} />
      <span className="tg-composer__slow-text">
        {remainingSeconds > 0 ? timer : t("input.slowMode")}
      </span>
    </span>
  );
}
