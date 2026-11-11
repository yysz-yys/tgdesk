import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { IconInfoCircle } from "@tabler/icons-react";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appVersion: string;
  tdlVersion: string;
  tdlCoreVersion: string;
}

export function AboutDialog({
  open,
  onOpenChange,
  appVersion,
  tdlVersion,
  tdlCoreVersion,
}: AboutDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--tg-accent-soft)] text-[var(--tg-accent)]">
              <IconInfoCircle size={22} />
            </span>
            <div>
              <Dialog.Title className="dialog-title">{t("about.title")}</Dialog.Title>
              <Dialog.Description className="dialog-copy">
                {t("about.description")}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 space-y-2 rounded-xl border border-[var(--tg-divider)] p-3 text-[12.5px]">
            <Row label="tgdesk" value={appVersion} />
            <Row label="tdl" value={tdlVersion} />
            <Row label="tdl/core" value={tdlCoreVersion} />
            <Row label={t("about.license")} value="AGPL-3.0" />
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--tg-secondary)]">
            {t("about.disclaimer")}
          </p>

          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="primary-button">
                {t("about.close")}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--tg-secondary)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
