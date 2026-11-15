import { Icon, Spinner } from "../../../ui";
import { useRipple } from "../../k/useRipple";

export type SendButtonMode = "send" | "edit" | "voice" | "loading";

/** Glyph size per Web K: plane 22px, check 24px, mic 22px (`_chat.scss:179-183`). */
const ICONS: Record<Exclude<SendButtonMode, "loading">, string> = {
  send: "send",
  edit: "check",
  voice: "mic",
};
const ICON_SIZES: Record<Exclude<SendButtonMode, "loading">, number> = {
  send: 22,
  edit: 24,
  voice: 22,
};

/**
 * The single morphing 40 px round button from Web K. All three glyphs stay in
 * the DOM and cross-fade/scale through `animation-level-icon-in` over 200 ms
 * (`_chat.scss:185-195`) instead of swapping instantly; the active plane keeps
 * Web K's `margin-inline-start:-3px; margin-bottom:-1px` optical offset.
 */
export function SendButton({
  mode,
  label,
  title,
  disabled,
  onClick,
}: {
  mode: SendButtonMode;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const modes = ["send", "edit", "voice"] as const;
  const { ref } = useRipple<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="tg-composer__send"
      data-mode={mode}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      {mode === "loading" ? (
        <Spinner size={18} className="tg-composer__send-spinner" />
      ) : (
        <span className="tg-composer__send-icons" aria-hidden="true">
          {modes.map((item) => (
            <span
              key={item}
              className="tg-composer__send-icon"
              data-icon={item}
              data-visible={mode === item ? true : undefined}
            >
              <Icon
                name={ICONS[item]}
                size={ICON_SIZES[item]}
                strokeWidth={2}
              />
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
