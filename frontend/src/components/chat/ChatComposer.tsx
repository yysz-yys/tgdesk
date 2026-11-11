import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconMoodSmile, IconPaperclip, IconSend, IconMicrophone } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface ChatComposerProps {
  onSend: (text: string) => Promise<void>;
  onToast: (message: string) => void;
}

export function ChatComposer({ onSend, onToast }: ChatComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [text]);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) {
      return;
    }
    setSending(true);
    try {
      await onSend(value);
      setText("");
      inputRef.current?.focus();
    } catch {
      onToast(t("chat.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tg-composer">
      <IconButton
        label={t("chat.attach")}
        onClick={() => onToast(t("chat.attachmentsSoon"))}
        className="tg-composer-tool"
      >
        <IconPaperclip size={22} stroke={1.8} />
      </IconButton>

      <div className="tg-composer-field">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={t("chat.messagePlaceholder")}
          aria-label={t("chat.messagePlaceholder")}
        />
        <IconButton
          label={t("chat.emoji")}
          onClick={() => setText((current) => `${current}🙂`)}
          className="tg-composer-tool"
        >
          <IconMoodSmile size={22} stroke={1.8} />
        </IconButton>
      </div>

      {text.trim() ? (
        <button
          type="button"
          className="tg-composer-send"
          onClick={() => void submit()}
          disabled={sending}
          aria-label={t("chat.send")}
        >
          {sending ? <Spinner size={20} /> : <IconSend size={21} stroke={2} />}
        </button>
      ) : (
        <IconButton
          label={t("chat.voice")}
          onClick={() => onToast(t("chat.voiceSoon"))}
          className="tg-composer-tool tg-composer-voice"
        >
          <IconMicrophone size={22} stroke={1.8} />
        </IconButton>
      )}
    </div>
  );
}
