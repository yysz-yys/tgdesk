import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "../../ui";

/**
 * Telegram Web K's profile QR button glyph. The UI icon set has no QR entry and
 * `ui/Icon.tsx` is owned by the shell workstream, so the dialog carries its own
 * tiny stroke icon (Lucide's `qr-code` outline).
 */
export function QrCodeIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </svg>
  );
}

export interface PeerQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Public username of the peer; the QR encodes https://t.me/<username>. */
  username: string;
  onToast?: (message: string) => void;
  /** t.me router wired by the shell; falls back to the system browser. */
  onOpenLink?: (url: string) => void;
}

/**
 * Telegram Web's "profile QR code" sheet, reduced to what a desktop client
 * needs: the code itself on a white card, the @username caption, the link and
 * copy/open actions. The QR is drawn client-side; no network request.
 */
export function PeerQrDialog({
  open,
  onOpenChange,
  username,
  onToast,
  onOpenLink,
}: PeerQrDialogProps) {
  const { t } = useTranslation();
  const [copying, setCopying] = useState(false);
  const clean = username
    .trim()
    .replace(/^@+/u, "")
    .replace(/^https?:\/\/t\.me\//iu, "");
  if (!clean) {
    return null;
  }
  const url = `https://t.me/${clean}`;
  const display = `t.me/${clean}`;

  const copy = async () => {
    if (copying) {
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      onToast?.(t("profile.linkCopied"));
    } catch {
      onToast?.(t("profile.copyFailed"));
    } finally {
      setCopying(false);
    }
  };

  const openLink = () => {
    if (onOpenLink) {
      onOpenLink(url);
      return;
    }
    void Browser.OpenURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("profile.qrCode")}
      description={t("profile.qrScanHint")}
      closeLabel={t("rightPanel.close")}
      className="f-peer-qr"
      width="340px"
    >
      <div className="f-peer-qr-card">
        <QRCodeSVG
          value={url}
          size={192}
          level="M"
          bgColor="#ffffff"
          fgColor="#1c2024"
          marginSize={2}
          title={t("profile.qrCode")}
        />
        <span className="f-peer-qr-caption" dir="ltr">
          @{clean.toUpperCase()}
        </span>
      </div>
      <span className="f-peer-qr-link" dir="ltr">
        {display}
      </span>
      <div className="f-peer-qr-actions">
        <Button
          variant="soft"
          icon="content_copy"
          disabled={copying}
          onClick={() => void copy()}
        >
          {t("profile.copyLink")}
        </Button>
        <Button variant="solid" icon="open_in_new" onClick={openLink}>
          {t("profile.openLink")}
        </Button>
      </div>
    </Dialog>
  );
}
