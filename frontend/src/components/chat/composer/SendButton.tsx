import { Icon, Spinner } from "../../../ui";

export type SendButtonMode = "send" | "edit" | "voice" | "loading";

const ICONS: Record<Exclude<SendButtonMode, "loading">, string> = {
  send: "send",
  edit: "check",
  voice: "mic",
};

/**
 * The single morphing 40 px round button from Web K: paper plane while there is
 * something to send, check while editing, microphone when the input is empty,
 * and a spinner while the send RPC is in flight. Disabled slow-mode keeps the
 * button visible but greyed out (Web K disables it and shows a timer tooltip).
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
  return (
    <button
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
        <Icon name={ICONS[mode]} size={22} strokeWidth={2} />
      )}
    </button>
  );
}
