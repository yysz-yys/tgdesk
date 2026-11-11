import { IconBrandTelegram } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
      <div className="tg-login-atmosphere" aria-hidden="true">
        <span className="tg-login-aurora" />
        <span className="tg-login-orbit tg-login-orbit-one" />
        <span className="tg-login-orbit tg-login-orbit-two" />
        <span className="tg-login-iconfield" />
        <IconBrandTelegram className="tg-login-plane" size={540} stroke={0.7} />
      </div>

      <main className="tg-login-frame">{children}</main>

      <footer className="tg-login-footer">
        <span>{tdlVersion ? t("sidebar.tdlVersion", { version: tdlVersion }) : t("sidebar.kernel")}</span>
        <span className="tg-login-footer-dot" />
        <span>AGPL-3.0</span>
      </footer>
    </div>
  );
}
