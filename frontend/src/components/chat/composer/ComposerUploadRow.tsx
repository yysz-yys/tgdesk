import { useTranslation } from "react-i18next";
import type { UploadProgress } from "../../../types";
import { Icon, Progress } from "../../../ui";

/** Upload progress row kept inside the composer plate (above the input row). */
export function ComposerUploadRow({ upload }: { upload: UploadProgress }) {
  const { t } = useTranslation();
  const percent = Math.round(upload.progress * 100);

  return (
    <div className="tg-composer__upload" data-failed={upload.failed ? true : undefined}>
      <span className="tg-composer__upload-icon">
        <Icon name="attach_file" size={16} />
      </span>
      <span className="tg-composer__upload-copy">
        <span className="tg-composer__upload-name">{upload.name}</span>
        <span className="tg-composer__upload-meta">
          {upload.failed
            ? t("input.uploadFailed")
            : t("input.uploading", { percent })}
        </span>
      </span>
      <Progress
        value={upload.progress}
        className="tg-composer__upload-bar"
        label={upload.name}
      />
    </div>
  );
}
