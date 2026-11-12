import { useTranslation } from "react-i18next";
import { IconButton } from "../ui/IconButton";
import { SearchField } from "../ui/SearchField";

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
    <div
      className="g-chat-search"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <SearchField
        autoFocus
        compact
        value={query}
        onValueChange={onQueryChange}
        placeholder={t("chat.searchLoadedPlaceholder")}
        label={t("chat.searchLoadedPlaceholder")}
        clearLabel={t("common.clear")}
        className="g-chat-search-field"
        trailing={
          query.trim() ? (
            <span className="g-chat-search-count">
              {t("chat.searchResultCount", { count: resultCount })}
            </span>
          ) : (
            <span className="g-chat-search-hint">{t("chat.searchLoadedHint")}</span>
          )
        }
      />
      <IconButton label={t("chat.searchClose")} icon="close" onClick={onClose} />
    </div>
  );
}
