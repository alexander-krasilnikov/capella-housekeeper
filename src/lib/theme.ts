export const THEME_COOKIE_NAME = "chk_theme";

export type ThemeMode = "light" | "dark" | "system";

/** Anything other than an explicit "light"/"dark" cookie value means "system" - including a missing cookie. */
export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}
