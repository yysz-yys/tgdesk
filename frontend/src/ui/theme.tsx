import type { ReactNode } from "react";
import { Theme } from "@radix-ui/themes";

export type Appearance = "light" | "dark";

interface AppThemeProps {
  appearance: Appearance;
  children: ReactNode;
}

/**
 * Single F theme root: indigo accent, slate neutrals, large radius. The theme
 * element deliberately paints no background; screens own their canvas so the
 * window chrome and the content stay one surface.
 */
export function AppTheme({ appearance, children }: AppThemeProps) {
  return (
    <Theme
      className="f-theme"
      appearance={appearance}
      accentColor="indigo"
      grayColor="slate"
      radius="large"
      scaling="100%"
      panelBackground="solid"
      hasBackground={false}
    >
      {children}
    </Theme>
  );
}
