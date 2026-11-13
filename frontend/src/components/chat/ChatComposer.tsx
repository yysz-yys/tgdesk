import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message, UploadProgress } from "../../types";
import { Icon, IconButton, Progress, Spinner } from "../../ui";

interface ChatComposerProps {
  chatId: string;
  replyingTo?: Message | null;
  editing?: Message | null;
  upload?: UploadProgress;
  onCancelContext: () => void;
  onSend: (text: string) => Promise<void>;
  onAttach: (caption: string) => Promise<boolean>;
  onToast: (message: string) => void;
  enterToSend: boolean;
}

function contextPreview(message: Message): string {
  if (message.text?.trim()) {
    return message.text;
  }
  return message.media?.name ?? "";
}

export function ChatComposer({
  chatId,
  replyingTo,
  editing,
  upload,
  onCancelContext,
  onSend,
  onAttach,
  onToast,
  enterToSend,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const draftKey = `tgdesk.draft.${chatId}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [editText, setEditText] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
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
    setEditText(editing?.text ?? "");
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const value = editing ? editText : text;
  const updateValue = (next: string) => {
    if (editing) {
      setEditText(next);
    } else {
      setText(next);
    }
  };

  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, [value]);

  const submit = async () => {
    const next = value.trim();
    if (!next || sending) {
      return;
    }
    setSending(true);
    try {
      await onSend(next);
      if (editing) {
        setEditText("");
      } else {
        setText("");
      }
      inputRef.current?.focus();
    } catch {
      onToast(t(editing ? "chat.editFailed" : "chat.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const attach = async () => {
    if (attaching || sending) {
      return;
    }
    setAttaching(true);
    try {
      const sent = await onAttach(editing ? "" : text.trim());
      if (sent) {
        setText("");
        inputRef.current?.focus();
      }
    } catch {
      onToast(t("chat.attachFailed"));
    } finally {
      setAttaching(false);
    }
  };

  const placeholder = editing
    ? t("chat.editPlaceholder")
    : replyingTo
      ? t("chat.replyPlaceholder")
      : t("chat.messagePlaceholder");

  return (
    <div className="f-composer">
      {upload ? (
        <div className="f-upload-progress">
          <span className="f-upload-icon">
            <Icon name="attach_file" size={15} />
          </span>
          <span className="f-upload-copy">
            <span className="f-upload-name">{upload.name}</span>
            <span className="f-upload-meta">
              {t("chat.uploading", { percent: Math.round(upload.progress * 100) })}
            </span>
          </span>
          <Progress value={upload.progress} className="f-upload-bar" label={upload.name} />
        </div>
      ) : null}
      {editing || replyingTo ? (
        <div className="f-composer-context" data-editing={editing ? true : undefined}>
          <span className="f-composer-context-icon">
            <Icon name={editing ? "edit" : "reply"} size={16} />
          </span>
          <span className="f-composer-context-copy">
            <span className="f-composer-context-title">
              {editing
                ? t("chat.editingMessage")
                : t("chat.replyTo", {
                    name: replyingTo?.out ? t("chat.you") : replyingTo?.sender || t("chat.sender"),
                  })}
            </span>
            <span className="f-composer-context-text">
              {contextPreview(editing ?? replyingTo!)}
            </span>
          </span>
          <IconButton
            label={t("chat.cancelReply")}
            icon="close"
            size="1"
            iconSize={16}
            onClick={onCancelContext}
          />
        </div>
      ) : null}
      <div className="f-composer-field">
        <IconButton
          label={attaching ? t("chat.attaching") : t("chat.attach")}
          icon="add"
          size="2"
          iconSize={18}
          disabled={attaching || sending}
          onClick={() => void attach()}
        />
        <textarea
          ref={inputRef}
          className="f-composer-input"
          rows={1}
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && (editing || replyingTo)) {
              event.preventDefault();
              onCancelContext();
              return;
            }
            if (!enterToSend) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <IconButton
          label={t("chat.emoji")}
          icon="mood"
          size="2"
          iconSize={18}
          onClick={() => updateValue(`${value}😊`)}
        />
        {value.trim() ? (
          sending ? (
            <span className="f-composer-sending">
              <Spinner size={18} />
            </span>
          ) : (
            <IconButton
              className="f-composer-send"
              variant="solid"
              color="indigo"
              size="2"
              label={editing ? t("chat.saveEdit") : t("chat.send")}
              icon={editing ? "check" : "arrow_up"}
              onClick={() => void submit()}
            />
          )
        ) : (
          <IconButton
            label={t("chat.voice")}
            icon="mic"
            size="2"
            iconSize={18}
            onClick={() => onToast(t("chat.voiceSoon"))}
          />
        )}
      </div>
    </div>
  );
}
