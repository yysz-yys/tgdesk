import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Dialog, Icon, Spinner, TextField } from "../../ui";
import { ChatAvatar } from "./ChatAvatar";

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: Chat[];
  currentChatId: string;
  onForward: (chatID: string) => Promise<void>;
}

/** Telegram Web-style "Forward to…" picker: search chats, pick one destination. */
export function ForwardDialog({
  open,
  onOpenChange,
  chats,
  currentChatId,
  onForward,
}: ForwardDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [sendingTo, setSendingTo] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      setSendingTo("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return chats.filter((chat) => {
      if (!needle) {
        return true;
      }
      return `${chat.title} ${chat.username ?? ""}`.toLowerCase().includes(needle);
    });
  }, [chats, query]);

  const forward = async (chat: Chat) => {
    if (sendingTo) {
      return;
    }
    setSendingTo(chat.id);
    try {
      await onForward(chat.id);
    } finally {
      setSendingTo("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("chat.forwardTo")}
      description={t("chat.forwardChooseChat")}
      closeLabel={t("rightPanel.close")}
      width="420px"
    >
      <TextField
        size="2"
        value={query}
        onValueChange={setQuery}
        placeholder={t("chat.forwardSearch")}
        aria-label={t("chat.forwardSearch")}
        leadingIcon="search"
      />
      <div className="g-forward-list">
        {filtered.length === 0 ? (
          <p className="g-forward-empty">{t("chat.noPeople")}</p>
        ) : (
          filtered.map((chat) => (
            <button
              type="button"
              key={chat.id}
              className="g-forward-row"
              disabled={Boolean(sendingTo)}
              data-current={chat.id === currentChatId || undefined}
              onClick={() => void forward(chat)}
            >
              <ChatAvatar chat={chat} size={38} />
              <span className="g-forward-copy">
                <span className="g-forward-title">{chat.title}</span>
                <span className="g-forward-sub">
                  {chat.username
                    ? `@${chat.username}`
                    : t(
                        chat.kind === "private"
                          ? "rightPanel.privateChat"
                          : chat.kind === "channel"
                            ? "chat.channel"
                            : "chat.group",
                      )}
                </span>
              </span>
              {sendingTo === chat.id ? (
                <Spinner size={18} />
              ) : chat.id === currentChatId ? (
                <span className="g-forward-current">{t("chat.forwardHere")}</span>
              ) : (
                <Icon name="forward" size={16} className="g-forward-icon" />
              )}
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
