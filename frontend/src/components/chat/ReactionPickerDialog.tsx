import { useTranslation } from "react-i18next";
import { Button, Dialog } from "../../ui";

const REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "🔥",
  "😮",
  "😢",
  "🎉",
  "😡",
  "👎",
  "🤔",
  "👏",
  "🙏",
  "💯",
  "🥰",
  "😍",
  "🤯",
  "😴",
  "🤝",
  "👀",
  "✨",
  "💔",
  "✅",
  "🤣",
  "😎",
];

interface ReactionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chosen?: string;
  onSelect: (emoji: string) => void;
}

/** Compact emoji grid for the message reaction action. */
export function ReactionPickerDialog({
  open,
  onOpenChange,
  chosen,
  onSelect,
}: ReactionPickerDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("chat.reactionPicker")}
      description={t("chat.reactionPickerHint")}
      closeLabel={t("rightPanel.close")}
      width="360px"
    >
      <div className="g-reaction-grid">
        {REACTIONS.map((emoji) => (
          <button
            type="button"
            key={emoji}
            className="g-reaction-choice"
            data-chosen={chosen === emoji || undefined}
            aria-label={emoji}
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      {chosen ? (
        <Button variant="ghost" fullWidth onClick={() => onSelect("")}>
          {t("chat.removeReaction")}
        </Button>
      ) : null}
    </Dialog>
  );
}
