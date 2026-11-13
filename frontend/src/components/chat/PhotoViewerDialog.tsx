import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, Icon, Spinner } from "../../ui";

interface PhotoViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;
  title: string;
}

/** Full-size photo viewer. The image is streamed from Telegram on demand. */
export function PhotoViewerDialog({
  open,
  onOpenChange,
  url,
  title,
}: PhotoViewerDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) {
      setLoading(true);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    // The image may already be in the WebView cache and complete before the
    // React onLoad handler attaches.
    if (imageRef.current?.complete) {
      setLoading(false);
    }
  }, [open, url]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t("chat.photoViewer")}
      closeLabel={t("rightPanel.close")}
      width="900px"
      className="g-photo-dialog"
      style={{ padding: 12 }}
    >
      <div className="g-photo-viewer">
        {!url || failed ? (
          <div className="g-photo-viewer-status">
            <Icon name="image" size={28} />
            <span>{t("chat.photoLoadFailed")}</span>
          </div>
        ) : (
          <>
            <img
              ref={imageRef}
              className="g-photo-viewer-image"
              src={url}
              alt={title}
              draggable={false}
              data-loaded={!loading || undefined}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
            {loading ? (
              <div className="g-photo-viewer-status">
                <Spinner size={24} />
                <span>{t("chat.photoLoading")}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
