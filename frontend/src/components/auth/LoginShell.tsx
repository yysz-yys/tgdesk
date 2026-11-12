import type { ReactNode } from "react";
import { IconBolt, IconCloudDownload, IconShieldLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "./BrandMark";

type LoginSurface = "welcome" | "qr" | "form" | "success";

interface LoginShellProps {
  surface: LoginSurface;
  children: ReactNode;
}

export function LoginShell({ surface, children }: LoginShellProps) {
  const { t } = useTranslation();

  return (
    <div className="tg-login-page" data-surface={surface}>
      <aside className="tg-login-aside" aria-hidden="false">
        <div className="tg-login-aside-glow tg-login-aside-glow-one" />
        <div className="tg-login-aside-glow tg-login-aside-glow-two" />

        <div className="tg-login-brand">
          <span className="tg-login-brand-mark">
            <BrandMark size={64} />
          </span>
          <div className="tg-login-brand-text">
            <strong>{t("login.brandTitle")}</strong>
            <span>{t("login.brandNote")}</span>
          </div>
        </div>

        <div className="tg-login-aside-copy">
          <h1>{t("login.asideTitle")}</h1>
          <p>{t("login.brandSubtitle")}</p>
        </div>

        <ul className="tg-login-features">
          <li>
            <span className="tg-login-feature-icon">
              <IconBolt size={17} />
            </span>
            <div>
              <strong>{t("login.featureFastTitle")}</strong>
              <span>{t("login.featureFastDesc")}</span>
            </div>
          </li>
          <li>
            <span className="tg-login-feature-icon">
              <IconCloudDownload size={17} />
            </span>
            <div>
              <strong>{t("login.featureDownloadsTitle")}</strong>
              <span>{t("login.featureDownloadsDesc")}</span>
            </div>
          </li>
          <li>
            <span className="tg-login-feature-icon">
              <IconShieldLock size={17} />
            </span>
            <div>
              <strong>{t("login.featureSecureTitle")}</strong>
              <span>{t("login.featureSecureDesc")}</span>
            </div>
          </li>
        </ul>

        <div className="tg-login-aside-footer">
          <span>{t("login.brandFooter")}</span>
          <span className="tg-login-aside-dot" />
          <span>AGPL-3.0</span>
        </div>
      </aside>

      <main className="tg-login-main">
        <div className="tg-login-mobile-brand">
          <BrandMark size={40} />
          <span>{t("login.brandTitle")}</span>
        </div>
        <div className="tg-login-card">{children}</div>
      </main>
    </div>
  );
}
