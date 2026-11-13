import { useTranslation } from "react-i18next";
import { Callout, Icon, Spinner } from "../../ui";

interface LoginSuccessStepProps {
  tdataError: string;
}

export function LoginSuccessStep({ tdataError }: LoginSuccessStepProps) {
  const { t } = useTranslation();

  return (
    <div className="f-login-step f-login-success">
      <span className="f-success-mark">
        <Icon name="check" size={26} strokeWidth={2} />
      </span>
      <h2>{t("login.successTitle")}</h2>
      <span className="f-success-loading">
        <Spinner size={15} />
        {t("login.successDescription")}
      </span>

      {tdataError ? (
        <Callout tone="error">{t("login.tdataFailed", { error: tdataError })}</Callout>
      ) : null}
    </div>
  );
}
