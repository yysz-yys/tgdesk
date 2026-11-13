import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, Icon, Spinner } from "../../ui";

interface VideoPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onLoad: () => Promise<string>;
}

export function VideoPlayerDialog({
  open,
  onOpenChange,
  title,
  onLoad,
}: VideoPlayerDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const loadRef = useRef(onLoad);
  loadRef.current = onLoad;

  useEffect(() => {
    if (!open) {
      setUrl("");
      setFailed(false);
      return;
    }
    let cancelled = false;
    setUrl("");
    setFailed(false);
    void loadRef
      .current()
      .then((next) => {
        if (!cancelled) {
          setUrl(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title || t("media.video")}
      description={t("chat.videoPlayer")}
      closeLabel={t("rightPanel.close")}
      width="760px"
    >
      <div className="f-video-player">
        {failed ? (
          <div className="f-video-status">
            <Icon name="error" size={24} />
            <span>{t("chat.videoLoadFailed")}</span>
          </div>
        ) : url ? (
          <video
            className="f-video-media"
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="f-video-status">
            <Spinner size={22} />
            <span>{t("chat.videoLoading")}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
