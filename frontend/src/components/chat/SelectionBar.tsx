import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDownload: () => void;
}

export function SelectionBar({ count, onClear, onDownload }: SelectionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="g-selection-bar">
      <span className="g-selection-icon">
        <Icon name="check" size={17} />
      </span>
      <span className="g-selection-count">{t("chat.selected", { count })}</span>
      <div className="g-selection-actions">
        <Button variant="text" size="sm" onClick={onClear}>
          {t("chat.clear")}
        </Button>
        <Button variant="filled" size="sm" icon="download" onClick={onDownload}>
          {t("chat.download")}
        </Button>
      </div>
    </div>
  );
}
