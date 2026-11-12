import { useTranslation } from "react-i18next";
import { Spinner } from "../ui/Spinner";
import { BrandMark } from "./BrandMark";

export function LoginLoading() {
  const { t } = useTranslation();

  return (
    <div className="g-login-loading">
      <span className="g-login-loading-mark">
        <BrandMark size={54} />
      </span>
      <Spinner size={20} />
      <p>{t("login.checkingSession")}</p>
    </div>
  );
}
