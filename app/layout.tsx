import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { Geist } from "next/font/google";
import "./globals.css";
import { THEME_COOKIE_NAME, parseThemeMode } from "@/lib/theme";
import ThemeSync from "./components/ThemeSync";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Capella Housekeeper",
  description: "Monitoring dashboard for running Couchbase Capella clusters",
};

// Resolves "system" to a concrete "light"/"dark" on <html> before the browser
// paints anything, since a request carries no signal for the OS's own
// preference - the server can only ever apply an explicit stored choice.
// See design.md ("Decisions") in openspec/changes/capella-branded-theme for
// why this - rather than the CSS-media-query-only fallback originally
// sketched there - turned out to be the right mechanism: Tailwind's
// selector-based dark: variant (needed so an explicit choice can override
// the OS preference) only responds to the `data-theme` attribute, so
// something has to resolve "system" into a concrete value for it. A classic
// next-themes-style blocking script is the standard answer; ThemeSync
// (mounted once below) keeps it live if the OS preference changes afterwards.
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=document.documentElement;if((r.getAttribute("data-theme-mode")||"system")==="system"){r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const mode = parseThemeMode(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const resolvedTheme = mode === "system" ? undefined : mode;

  return (
    <html
      lang="en"
      data-theme-mode={mode}
      data-theme={resolvedTheme}
      className={sans.variable}
      // The bootstrap script below mutates data-theme on this element before
      // React hydrates whenever mode is "system" (resolving it to a concrete
      // light/dark via matchMedia - see THEME_BOOTSTRAP_SCRIPT). That's a
      // deliberate out-of-band DOM mutation, not a bug: suppress just this
      // element's hydration diff so React doesn't flag the attribute it
      // never controlled in the first place. Scoped to <html> only - it does
      // not suppress mismatches anywhere else in the tree.
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
