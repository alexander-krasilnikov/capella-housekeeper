"use client";

import { useEffect } from "react";

/**
 * Keeps the resolved theme tracking the OS preference live while in "system"
 * mode - e.g. the OS switches to dark at sunset while this page is still
 * open. Reads `data-theme-mode` fresh on every media-query change event
 * rather than capturing it once, so it stays correct even after
 * ThemeToggle switches modes later in the same page session.
 */
export default function ThemeSync() {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function applyIfSystem() {
      const root = document.documentElement;
      if (root.getAttribute("data-theme-mode") !== "system") return;
      root.setAttribute("data-theme", mediaQuery.matches ? "dark" : "light");
    }
    mediaQuery.addEventListener("change", applyIfSystem);
    return () => mediaQuery.removeEventListener("change", applyIfSystem);
  }, []);

  return null;
}
