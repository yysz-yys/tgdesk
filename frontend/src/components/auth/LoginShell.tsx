import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LoginHero } from "./LoginHero";

type LoginSurface = "welcome" | "qr" | "form" | "success";

interface LoginShellProps {
  tdlVersion?: string;
  surface: LoginSurface;
  children: ReactNode;
}

export function LoginShell({ tdlVersion, surface, children }: LoginShellProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-page" data-surface={surface}>
      {surface === "welcome" ? <LoginHero /> : null}

      <main className="tg-login-frame">{children}</main>

      <footer className="tg-login-footer">
        <span>{tdlVersion ? t("sidebar.tdlVersion", { version: tdlVersion }) : t("sidebar.kernel")}</span>
        <span className="tg-login-footer-dot" />
        <span>AGPL-3.0</span>
      </footer>
    </div>
  );
}
