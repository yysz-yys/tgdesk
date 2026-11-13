import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../hooks/useSettings";
import type { ThemePreference } from "../../hooks/useTheme";
import {
  Icon,
  Menu,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "../../ui";
import { BrandMark } from "./BrandMark";

export type LoginLanguage = AppSettings["language"];

const LANGUAGE_NAMES: Record<"en" | "zh" | "ja", string> = {
  en: "English",
  zh: "简体中文",
  ja: "日本語",
};

const THEME_ICONS: Record<ThemePreference, string> = {
  system: "routine",
  light: "light_mode",
  dark: "dark_mode",
};

interface LoginShellProps {
  children: ReactNode;
  language: LoginLanguage;
  onLanguageChange: (language: LoginLanguage) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

/**
 * F sign-in surface: a floating card between one brand lockup and one quiet
 * footer. Language and theme are the only chrome outside the card; both stay
 * persisted in AppSettings.
 */
export function LoginShell({
  children,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
}: LoginShellProps) {
  const { t, i18n } = useTranslation();
  const resolved = (i18n.resolvedLanguage ?? "en") as keyof typeof LANGUAGE_NAMES;
  const currentName = LANGUAGE_NAMES[resolved] ?? LANGUAGE_NAMES.en;
  const languageLabel =
    language === "system" ? `${t("common.systemDefault")} · ${currentName}` : currentName;
  const themeLabel = t(`settings.appearance.${theme}`);

  return (
    <div className="f-login">
      <main className="f-login-main">
        <div className="f-login-brand">
          <BrandMark size={32} alt="" />
          <span className="f-login-wordmark">tgdesk</span>
        </div>

        <section className="f-login-card" aria-label={t("login.title")}>
          {children}
        </section>

        <div className="f-login-footer">
          <Menu
            side="top"
            triggerClassName="f-footer-language"
            trigger={
              <>
                <Icon name="language" size={15} />
                <span>{languageLabel}</span>
                <Icon name="expand_more" size={13} />
              </>
            }
          >
            <MenuLabel>{t("login.language")}</MenuLabel>
            <MenuRadioGroup
              value={language}
              onValueChange={(value) => onLanguageChange(value as LoginLanguage)}
            >
              <MenuRadioItem value="system">{t("common.systemDefault")}</MenuRadioItem>
              <MenuSeparator />
              {(["en", "zh", "ja"] as const).map((code) => (
                <MenuRadioItem key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </Menu>

          <span className="f-footer-dot" />

          <Menu
            side="top"
            triggerClassName="f-footer-theme"
            trigger={
              <>
                <Icon name={THEME_ICONS[theme]} size={15} />
                <span className="f-sr-only">{themeLabel}</span>
              </>
            }
          >
            <MenuLabel>{t("settings.appearance.theme")}</MenuLabel>
            <MenuRadioGroup
              value={theme}
              onValueChange={(value) => onThemeChange(value as ThemePreference)}
            >
              {(["system", "light", "dark"] as const).map((value) => (
                <MenuRadioItem key={value} value={value}>
                  {t(`settings.appearance.${value}`)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </Menu>

          <span className="f-footer-dot" />
          <span className="f-footer-legal">{t("login.footerReal")}</span>
        </div>
      </main>
    </div>
  );
}
