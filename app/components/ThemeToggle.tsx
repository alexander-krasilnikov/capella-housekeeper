"use client";

import { useEffect, useState, useTransition } from "react";
import { setThemeAction } from "../actions";
import type { ThemeMode } from "@/lib/theme";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "system", label: "System" },
];

function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // null until mounted: the actual mode lives in the server-rendered
  // data-theme-mode attribute (and the bootstrap script may have already
  // resolved "system"), neither of which this component can read during
  // its own server render - same mounted-gate as FormattedDateTime in
  // ClusterTable.tsx, for the same reason (avoid a hydration mismatch).
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme-mode");
    setMode(current === "light" || current === "dark" ? current : "system");
  }, []);

  function select(next: ThemeMode) {
    setMode(next);
    const root = document.documentElement;
    root.setAttribute("data-theme-mode", next);
    root.setAttribute("data-theme", next === "system" ? resolveSystemTheme() : next);
    startTransition(() => {
      setThemeAction(next);
    });
  }

  const active = mode ?? "system";

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          aria-pressed={active === opt.mode}
          onClick={() => select(opt.mode)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            active === opt.mode ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-panel-hover"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
