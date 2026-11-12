import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface ChatComposerProps {
  chatId: string;
  onSend: (text: string) => Promise<void>;
  onToast: (message: string) => void;
  enterToSend: boolean;
}

export function ChatComposer({ chatId, onSend, onToast, enterToSend }: ChatComposerProps) {
  const { t } = useTranslation();
  const draftKey = `tgdesk.draft.${chatId}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(localStorage.getItem(draftKey) ?? "");
  }, [draftKey]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    if (text.trim()) {
      localStorage.setItem(draftKey, text);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [chatId, draftKey, text]);

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
    <div className="g-composer">
      <div className="g-composer-field">
        <IconButton
          label={t("chat.attach")}
          icon="add"
          iconSize={22}
          onClick={() => onToast(t("chat.attachmentsSoon"))}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (!enterToSend) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={t("chat.messagePlaceholder")}
          aria-label={t("chat.messagePlaceholder")}
        />
        <IconButton
          label={t("chat.emoji")}
          icon="mood"
          onClick={() => setText((current) => `${current}😊`)}
        />
        {text.trim() ? (
          sending ? (
            <span className="g-composer-sending">
              <Spinner size={20} />
            </span>
          ) : (
            <IconButton
              className="g-composer-send"
              variant="filled"
              label={t("chat.send")}
              icon="send"
              onClick={() => void submit()}
            />
          )
        ) : (
          <IconButton
            label={t("chat.voice")}
            icon="mic"
            onClick={() => onToast(t("chat.voiceSoon"))}
          />
        )}
      </div>
    </div>
  );
}
