import { useTranslation } from "react-i18next";
import { Spinner } from "../ui/Spinner";
import { BrandMark } from "./BrandMark";

export function LoginLoading() {
  const { t } = useTranslation();

  return (
    <div className="tg-login-loading">
      <span className="tg-login-loading-mark">
        <BrandMark size={58} />
      </span>
      <Spinner size={18} />
      <p>{t("login.checkingSession")}</p>
    </div>
  );
}
