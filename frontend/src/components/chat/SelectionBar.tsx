import { useTranslation } from "react-i18next";
import { IconCheck, IconDownload, IconX } from "@tabler/icons-react";
import { Button } from "../ui/Button";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDownload: () => void;
}

export function SelectionBar({ count, onClear, onDownload }: SelectionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-selection-bar">
      <span className="tg-selection-icon">
        <IconCheck size={17} stroke={2.4} />
      </span>
      <span className="tg-selection-count">{t("chat.selected", { count })}</span>
      <div className="tg-selection-actions">
        <Button variant="ghost" size="sm" onClick={onClear} leading={<IconX size={16} />}>
          {t("chat.clear")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onDownload}
          leading={<IconDownload size={16} />}
        >
          {t("chat.download")}
        </Button>
      </div>
    </div>
  );
}
