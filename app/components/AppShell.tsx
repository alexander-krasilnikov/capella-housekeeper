"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import SlackConnectionIndicator from "./SlackConnectionIndicator";
import { logoutAction, setSidebarCollapsedAction } from "../actions";
import type { SlackBotStatus } from "@/lib/slackBot";

export type NavTarget = "clusters" | "history" | "settings";

/** Stacked-database glyph for the Clusters nav item - matches the 20x20 stroke-icon style used elsewhere (see ClusterTable's ChevronIcon). Exported so DashboardTabs can reuse it for its "Total Clusters" stat tile without duplicating the markup. */
export function ClustersIcon({ className }: { className?: string }) {
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
      <ellipse cx="10" cy="4.5" rx="6" ry="2.5" />
      <path d="M4 4.5v5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-5" />
      <path d="M4 9.5v5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-5" />
    </svg>
  );
}

/** Clock glyph for the History nav item. */
function HistoryIcon({ className }: { className?: string }) {
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
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

/** Chevron for the sidebar collapse toggle - points left (collapse) by default, rotated 180deg when collapsed (expand). */
function CollapseIcon({ className }: { className?: string }) {
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
      <path d="M13 4l-6 6 6 6" />
    </svg>
  );
}

/** Broom glyph for the brand mark - "housekeeping". Drawn to read at 20px inside the small brand square. */
function BroomIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 2.5v6" />
      <path d="M6.5 8.5h7l1.2 8h-9.4z" />
      <path d="M10 12.5v4" />
    </svg>
  );
}

/** Settings glyph - three sliders (horizontal lines with a knob each), a common settings affordance that's easy to hand-draw consistently with this file's other stroke icons. */
function SlidersIcon({ className }: { className?: string }) {
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
      <line x1="3" y1="6" x2="17" y2="6" />
      <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="7" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <line x1="3" y1="14" x2="17" y2="14" />
      <circle cx="13" cy="14" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * One sidebar row, rendered either as an in-place view switch (`onClick`,
 * `role="tab"`) or as real navigation (`href`) - Clusters/History are the
 * former inside the dashboard and the latter from any other page; Settings
 * is always the latter. See AppShell's own comment for why the choice is
 * made by the caller rather than this component.
 */
function NavEntry({
  active,
  icon,
  label,
  count,
  collapsed,
  onClick,
  href,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  /** Omitted entirely (not shown as 0) when the caller has no figure to show - e.g. Settings, or Clusters/History rendered outside the dashboard. */
  count?: number;
  collapsed: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const className = `flex items-center rounded-lg py-2 text-sm transition ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${
    active ? "bg-brand-soft font-bold text-brand" : "text-ink-muted hover:bg-panel-hover hover:text-ink"
  }`;
  const content = (
    <>
      {icon}
      {!collapsed && (
        <>
          <span>{label}</span>
          {count !== undefined && (
            <span className={`ml-auto text-xs ${active ? "text-brand/70" : "text-ink-faint"}`}>{count}</span>
          )}
        </>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} title={collapsed ? label : undefined} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={className}
    >
      {content}
    </button>
  );
}

/**
 * Persistent sidebar + top header shared by every authenticated page - see
 * dashboard-shell spec. Mounted independently by both `DashboardTabs` (for
 * `/`, passing `onSelectTab` so Clusters/History stay in-place client tab
 * switches) and the settings page (for `/settings`, omitting `onSelectTab`
 * so those same two items fall back to real navigation to `/`) - not folded
 * into a single "third tab" model, since the settings page depends on being
 * a real route (its server actions redirect with `searchParams` for flash
 * banners) - see design.md.
 */
export default function AppShell({
  activeNav,
  title,
  clusterCount,
  historyCount,
  initialSlackStatus,
  initialCollapsed,
  onSelectTab,
  children,
}: {
  activeNav: NavTarget;
  title: string;
  /** Omitted (no badge shown) when the caller has no live count to show - e.g. the settings page. */
  clusterCount?: number;
  historyCount?: number;
  initialSlackStatus: SlackBotStatus;
  /**
   * Resolved server-side from the `chk_sidebar_collapsed` cookie (see
   * sidebarPreference.ts) by whichever page renders AppShell, so the very
   * first paint already matches the operator's saved preference - unlike a
   * `localStorage`-backed read-after-mount, which would default to expanded
   * on every fresh mount (i.e. every dashboard <-> settings navigation,
   * since each is a different page/route) and then visibly snap collapsed a
   * moment later.
   */
  initialCollapsed: boolean;
  /** Present only when mounted inside the dashboard, where Clusters/History switch client-side state rather than navigating. */
  onSelectTab?: (tab: "clusters" | "history") => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [, startTransition] = useTransition();

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    startTransition(() => {
      setSidebarCollapsedAction(next);
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`flex shrink-0 flex-col border-r border-line bg-canvas transition-[width] duration-150 ${
          collapsed ? "w-16" : "w-52"
        }`}
      >
        {/* Brand block - icon alone when collapsed, icon + wordmark when expanded. */}
        <div
          className={`flex h-16 shrink-0 items-center border-b border-line ${collapsed ? "justify-center px-2" : "px-3"}`}
        >
          {/* The mark doubles as the collapse/expand affordance in both
              states (the chevron below is easy to miss at rail width). */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink transition hover:bg-brand-hover"
          >
            <BroomIcon className="h-5 w-5" />
          </button>
          {!collapsed && (
            <span className="ml-2.5 whitespace-nowrap text-sm font-semibold tracking-tight">
              <span className="text-ink">Capella</span> <span className="text-brand">Housekeeper</span>
            </span>
          )}
        </div>

        <div className={`flex px-2 pt-2 ${collapsed ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-lg p-2 text-ink-muted transition hover:bg-panel-hover hover:text-ink"
          >
            <CollapseIcon className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* role="tablist" rather than <nav>: within the dashboard these
            switch the view in place (buttons with aria-selected); from any
            other page they're real links instead - see NavEntry. */}
        <div
          role="tablist"
          aria-label="Dashboard view"
          className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2"
        >
          <NavEntry
            active={activeNav === "clusters"}
            icon={<ClustersIcon className="h-5 w-5 shrink-0" />}
            label="Clusters"
            count={clusterCount}
            collapsed={collapsed}
            onClick={onSelectTab ? () => onSelectTab("clusters") : undefined}
            href={onSelectTab ? undefined : "/"}
          />
          <NavEntry
            active={activeNav === "history"}
            icon={<HistoryIcon className="h-5 w-5 shrink-0" />}
            label="History"
            count={historyCount}
            collapsed={collapsed}
            onClick={onSelectTab ? () => onSelectTab("history") : undefined}
            href={onSelectTab ? undefined : "/"}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-line p-2">
          <NavEntry
            active={activeNav === "settings"}
            icon={<SlidersIcon className="h-5 w-5 shrink-0" />}
            label="Settings"
            collapsed={collapsed}
            href="/settings"
          />
          <div className={collapsed ? "flex justify-center" : ""}>
            <ThemeToggle collapsed={collapsed} />
          </div>
          <div className={collapsed ? "flex justify-center" : ""}>
            <SlackConnectionIndicator initialStatus={initialSlackStatus} collapsed={collapsed} />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover"
            >
              Log out
            </button>
          </form>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">{children}</div>
      </main>
    </div>
  );
}
