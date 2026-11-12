import { IconCheck, IconFolder } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TDataExport } from "../../../bindings/tgdesk/internal/kernel/models";
import type { AuthUser } from "../../types";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

interface LoginSuccessStepProps {
  user: AuthUser | null;
  tdata: TDataExport | null;
  tdataError: string;
}

export function LoginSuccessStep({ user, tdata, tdataError }: LoginSuccessStepProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-step tg-login-success">
      <span className="tg-login-success-icon">
        <IconCheck size={30} stroke={2.4} />
      </span>
      <h2>{t("login.successTitle")}</h2>
      <p>{user?.displayName ?? t("login.successDescription")}</p>

      {tdata ? (
        <div className="tg-login-tdata">
          <span className="tg-login-tdata-icon">
            <IconFolder size={16} />
          </span>
          <div>
            <strong>{t("login.tdataTitle")}</strong>
            <span title={tdata.path}>{t("login.tdataSaved", { path: tdata.path })}</span>
          </div>
        </div>
      ) : null}

      {tdataError ? (
        <Callout tone="error">
          {t("login.tdataFailed", { error: tdataError })}
        </Callout>
      ) : null}

      <span className="tg-login-success-loading">
        <Spinner size={16} />
        {t("login.successDescription")}
      </span>
    </div>
  );
}
