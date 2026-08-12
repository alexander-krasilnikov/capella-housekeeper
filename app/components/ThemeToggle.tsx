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

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v2M10 15.5v2M3.5 10h-2M18.5 10h-2M5.6 5.6 4.2 4.2M15.8 15.8l-1.4-1.4M5.6 14.4l-1.4 1.4M15.8 4.2l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5Z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="14" height="9.5" rx="1.5" />
      <path d="M7 17.5h6M10 13.5v4" />
    </svg>
  );
}

const MODE_ICON: Record<ThemeMode, (props: { className?: string }) => React.ReactElement> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
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

  if (collapsed) {
    const ActiveIcon = MODE_ICON[active];
    const next = OPTIONS[(OPTIONS.findIndex((o) => o.mode === active) + 1) % OPTIONS.length].mode;
    return (
      <button
        type="button"
        onClick={() => select(next)}
        title={`Theme: ${OPTIONS.find((o) => o.mode === active)?.label} (click for ${OPTIONS.find((o) => o.mode === next)?.label})`}
        className="flex items-center justify-center rounded-lg p-2 text-ink-muted transition hover:bg-panel-hover hover:text-ink"
      >
        <ActiveIcon className="h-5 w-5 shrink-0" />
      </button>
    );
  }

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
