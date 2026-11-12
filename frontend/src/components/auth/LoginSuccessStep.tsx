import { useTranslation } from "react-i18next";
import type { TDataExport } from "../../../bindings/tgdesk/internal/kernel/models";
import type { AuthUser } from "../../types";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

interface LoginSuccessStepProps {
  user: AuthUser | null;
  tdata: TDataExport | null;
  tdataError: string;
}

export function LoginSuccessStep({ user, tdata, tdataError }: LoginSuccessStepProps) {
  const { t } = useTranslation();

  return (
    <div className="g-login-step g-login-success">
      <span className="g-login-success-icon">
        <Icon name="check" size={30} />
      </span>
      <h2>{t("login.successTitle")}</h2>
      <p>{user?.displayName ?? t("login.successDescription")}</p>

      {tdata ? (
        <div className="g-login-tdata">
          <Icon name="check_circle" size={18} />
          <span>{t("login.tdataWritten")}</span>
        </div>
      ) : null}

      {tdataError ? (
        <Callout tone="error">{t("login.tdataFailed", { error: tdataError })}</Callout>
      ) : null}

      <span className="g-login-success-loading">
        <Spinner size={16} />
        {t("login.successDescription")}
      </span>
    </div>
  );
}
