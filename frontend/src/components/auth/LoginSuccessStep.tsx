import { IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { AuthUser } from "../../types";
import { Spinner } from "../ui/Spinner";

export function LoginSuccessStep({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-step tg-login-success">
      <span className="tg-login-success-icon">
        <IconCheck size={31} stroke={2.5} />
      </span>
      <h2>{t("login.successTitle")}</h2>
      <p>{user?.displayName ?? t("login.successDescription")}</p>
      <Spinner size={18} />
    </div>
  );
}
