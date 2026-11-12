import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Chat } from "../../types";
import { Dialog } from "../ui/Dialog";
import { SearchField } from "../ui/SearchField";
import { ChatAvatar, type ChatAvatarLoader } from "./ChatAvatar";

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: Chat[];
  onSelect: (id: string) => void;
  onLoadAvatar: ChatAvatarLoader;
}

export function NewMessageDialog({
  open,
  onOpenChange,
  chats,
  onSelect,
  onLoadAvatar,
}: NewMessageDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return chats;
    }
    return chats.filter((chat) =>
      `${chat.title} ${chat.username ?? ""}`.toLowerCase().includes(needle),
    );
  }, [chats, query]);

  const kindLabel = (chat: Chat) =>
    t(
      chat.kind === "private"
        ? "rightPanel.privateChat"
        : chat.kind === "channel"
          ? "rightPanel.channel"
          : "rightPanel.group",
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
        }
        onOpenChange(next);
      }}
      title={t("chat.newMessage")}
      description={t("chat.newMessageDescription")}
      closeLabel={t("rightPanel.close")}
      width={420}
    >
      <div className="g-new-message">
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t("chat.searchPeople")}
          label={t("chat.searchPeople")}
          clearLabel={t("sidebar.clearSearch")}
        />
        <div className="g-new-message-list">
          {results.length > 0 ? (
            results.map((chat) => (
              <button
                type="button"
                className="g-new-message-row"
                key={chat.id}
                onClick={() => {
                  onSelect(chat.id);
                  setQuery("");
                }}
              >
                <ChatAvatar chat={chat} size={40} loader={onLoadAvatar} />
                <span>
                  <strong>{chat.title}</strong>
                  <small>{kindLabel(chat)}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="g-new-message-empty">{t("chat.noPeople")}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
