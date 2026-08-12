export const SIDEBAR_COLLAPSED_COOKIE_NAME = "chk_sidebar_collapsed";

/** Missing/anything-but-"true" means expanded - the same "absence is the non-default" convention as theme.ts's parseThemeMode. */
export function parseSidebarCollapsed(value: string | undefined | null): boolean {
  return value === "true";
}
