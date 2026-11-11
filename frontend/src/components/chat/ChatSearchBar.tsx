import { useTranslation } from "react-i18next";
import { IconSearch, IconX } from "@tabler/icons-react";
import { IconButton } from "../ui/IconButton";

interface ChatSearchBarProps {
  query: string;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onClose: () => void;
}

export function ChatSearchBar({
  query,
  resultCount,
  onQueryChange,
  onClose,
}: ChatSearchBarProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-chat-search">
      <IconSearch size={18} stroke={1.8} />
      <input
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("chat.searchLoadedPlaceholder")}
        aria-label={t("chat.searchLoadedPlaceholder")}
      />
      {query.trim() ? (
        <span className="tg-chat-search-count">
          {t("chat.searchResultCount", { count: resultCount })}
        </span>
      ) : (
        <span className="tg-chat-search-hint">{t("chat.searchLoadedHint")}</span>
      )}
      <IconButton label={t("chat.searchClose")} onClick={onClose}>
        <IconX size={18} />
      </IconButton>
    </div>
  );
}
