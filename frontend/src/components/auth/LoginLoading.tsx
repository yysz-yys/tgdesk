import { useTranslation } from "react-i18next";
import { Spinner } from "../../ui";
import { BrandMark } from "./BrandMark";

export function LoginLoading() {
  const { t } = useTranslation();

  return (
    <div className="f-login-loading">
      <BrandMark size={50} />
      <Spinner size={22} label={t("login.checkingSession")} />
      <p>{t("login.checkingSession")}</p>
    </div>
  );
}
