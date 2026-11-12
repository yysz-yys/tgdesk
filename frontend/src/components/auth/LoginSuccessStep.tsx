import { useTranslation } from "react-i18next";
import { Callout } from "../ui/Callout";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

interface LoginSuccessStepProps {
  tdataError: string;
}

export function LoginSuccessStep({ tdataError }: LoginSuccessStepProps) {
  const { t } = useTranslation();

  return (
    <div className="g-login-step g-login-success">
      <span className="g-login-success-icon">
        <Icon name="check" size={30} />
      </span>
      <h2>{t("login.successTitle")}</h2>
      <span className="g-login-success-loading">
        <Spinner size={16} />
        {t("login.successDescription")}
      </span>

      {tdataError ? (
        <Callout tone="error">{t("login.tdataFailed", { error: tdataError })}</Callout>
      ) : null}
    </div>
  );
}
