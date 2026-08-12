"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ClusterTable, { type ClusterRow } from "./ClusterTable";
import HistoryTable, { type HistoryRow } from "./HistoryTable";
import ThemeToggle from "./ThemeToggle";
import SlackConnectionIndicator from "./SlackConnectionIndicator";
import { logoutAction } from "../actions";
import { dailySpendFromSnapshots, type CostSnapshot } from "@/lib/costSeries";
import { maxClustersPerDay, type ClusterLifetime } from "@/lib/clusterCounts";
import { formatUsd } from "@/lib/format";
import type { SlackBotStatus } from "@/lib/slackBot";

type Tab = "clusters" | "history";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "capella-housekeeper:sidebar-collapsed:v1";

/** Stacked-database glyph for the Clusters nav item - matches the 20x20 stroke-icon style used elsewhere (see ClusterTable's ChevronIcon). */
function ClustersIcon({ className }: { className?: string }) {
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

/** People glyph for the "Cluster Owners" stat tile. */
function OwnersIcon({ className }: { className?: string }) {
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
      <circle cx="8" cy="6.5" r="3" />
      <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M14 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1.4.8 2.3 2.2 2.3 4.1" />
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

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  collapsed,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg py-2 text-sm transition ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${
        active ? "bg-brand-soft font-bold text-brand" : "text-ink-muted hover:bg-panel-hover hover:text-ink"
      }`}
    >
      {icon}
      {!collapsed && (
        <>
          <span>{label}</span>
          <span className={`ml-auto text-xs ${active ? "text-brand/70" : "text-ink-faint"}`}>{count}</span>
        </>
      )}
    </button>
  );
}

/** Sidebar footer link - same shape as NavItem, but a real navigation Link rather than a same-page view switch, so it carries no tab/aria-selected semantics. */
function SidebarLink({ href, icon, label, collapsed }: { href: string; icon: React.ReactNode; label: string; collapsed: boolean }) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg py-2 text-sm text-ink-muted transition hover:bg-panel-hover hover:text-ink ${
        collapsed ? "justify-center px-2" : "gap-3 px-3"
      }`}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

interface DailyValue {
  label: string;
  /** null = no figure derivable for this day, rendered as "-" rather than a zero bar. */
  value: number | null;
}

/** Compact stat tile - real data, no mount-gate needed since these are neither locale- nor timezone-sensitive. */
function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4 shadow-sm">
      {icon}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
        <div className="text-xl font-semibold leading-none text-ink">{value}</div>
      </div>
    </div>
  );
}

/**
 * Rolling 7-day bar chart. `days` is null until the mounted effect in
 * DashboardTabs computes it client-side, since day boundaries and weekday
 * labels depend on the visitor's own timezone/locale.
 *
 * Bars are scaled to the series' own maximum - there is no fixed 0-100% axis
 * to scale against (unlike the percentage axis in the Stitch mock this is
 * styled after, whose numbers were placeholder values).
 */
function DailyBarChart({
  title,
  days,
  formatValue,
  emptyMessage,
}: {
  title: string;
  days: DailyValue[] | null;
  formatValue: (value: number) => string;
  /** Shown instead of bars when no day in the window has a derivable figure. */
  emptyMessage: string;
}) {
  const known = days?.filter((d) => d.value !== null).map((d) => d.value as number) ?? [];
  const hasData = known.length > 0;
  const maxValue = Math.max(1, ...known);
  const placeholder: DailyValue[] = Array.from({ length: 7 }, () => ({ label: "", value: null }));

  return (
    <div className="min-w-[280px] flex-1 rounded-xl border border-line bg-panel p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {days && !hasData ? (
        <div className="flex h-[76px] items-center justify-center text-center text-xs text-ink-faint">
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className="flex h-16 items-end gap-2">
            {(days ?? placeholder).map((day, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
                {days && (
                  <span className="mb-1 text-[10px] text-ink-faint">
                    {day.value === null ? "–" : formatValue(day.value)}
                  </span>
                )}
                <div
                  className="w-full rounded-t bg-brand/70"
                  style={{
                    height: days && day.value !== null ? `${Math.max(2, (day.value / maxValue) * 100)}%` : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {(days ?? placeholder).map((day, i) => (
              <span key={i} className="flex-1 text-center text-[10px] text-ink-muted">
                {day.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardTabs({
  clusterRows,
  historyRows,
  costSnapshots,
  clusterLifetimes,
  initialSlackStatus,
}: {
  clusterRows: ClusterRow[];
  historyRows: HistoryRow[];
  costSnapshots: CostSnapshot[];
  clusterLifetimes: ClusterLifetime[];
  initialSlackStatus: SlackBotStatus;
}) {
  const [tab, setTab] = useState<Tab>("clusters");
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedLoaded, setCollapsedLoaded] = useState(false);
  const [clusterCount, setClusterCount] = useState<DailyValue[] | null>(null);
  const [dailySpend, setDailySpend] = useState<DailyValue[] | null>(null);

  const distinctOwners = useMemo(
    // "Unknown" is the placeholder for a cluster with no derived owner (see
    // page.tsx), not a person - counting it would inflate the figure.
    () => new Set(clusterRows.map((r) => r.owner).filter((owner) => owner !== "Unknown")).size,
    [clusterRows],
  );

  // Reading localStorage during render would break server/client hydration
  // (server has no localStorage), so this only happens after mount, then
  // the write-back effect below is gated on collapsedLoaded to avoid
  // clobbering the saved value with the initial `false` default before it's
  // had a chance to load - same pattern as ClusterTable's configLoaded.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
    setCollapsedLoaded(true);
  }, []);

  useEffect(() => {
    if (!collapsedLoaded) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsedLoaded, collapsed]);

  // Bucketing by calendar day, and naming that day, both depend on the
  // visitor's own timezone/locale - a server component can't know either,
  // so (like FormattedDateTime and ThemeToggle's system-preference
  // resolution) this only runs client-side, post-mount.
  useEffect(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 8 boundaries delimiting the 7 rolling days ending with today.
    const boundaries = Array.from({ length: 8 }, (_, i) => startOfToday.getTime() - (6 - i) * DAY_MS);
    const labels = boundaries
      .slice(0, 7)
      .map((start) => new Date(start).toLocaleDateString(undefined, { weekday: "short" }));

    const counts = maxClustersPerDay(clusterLifetimes, boundaries);
    setClusterCount(labels.map((label, i) => ({ label, value: counts[i] ?? null })));

    const spend = dailySpendFromSnapshots(costSnapshots, boundaries);
    setDailySpend(labels.map((label, i) => ({ label, value: spend[i] ?? null })));
  }, [clusterLifetimes, costSnapshots]);

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
            onClick={() => setCollapsed((c) => !c)}
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
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-lg p-2 text-ink-muted transition hover:bg-panel-hover hover:text-ink"
          >
            <CollapseIcon className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* role="tablist" rather than <nav>: these switch the view in place
            (buttons with aria-selected), they aren't links to other pages. */}
        <div
          role="tablist"
          aria-label="Dashboard view"
          className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2"
        >
          <NavItem
            active={tab === "clusters"}
            onClick={() => setTab("clusters")}
            icon={<ClustersIcon className="h-5 w-5 shrink-0" />}
            label="Clusters"
            count={clusterRows.length}
            collapsed={collapsed}
          />
          <NavItem
            active={tab === "history"}
            onClick={() => setTab("history")}
            icon={<HistoryIcon className="h-5 w-5 shrink-0" />}
            label="History"
            count={historyRows.length}
            collapsed={collapsed}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-line p-2">
          <SidebarLink href="/settings" icon={<SlidersIcon className="h-5 w-5 shrink-0" />} label="Settings" collapsed={collapsed} />
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
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {tab === "clusters" ? "Cluster Management" : "Lifecycle History"}
          </h1>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover"
            >
              Log out
            </button>
          </form>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {tab === "clusters" && (
            <div className="mb-4 flex flex-wrap items-stretch gap-4">
              <StatTile
                icon={<ClustersIcon className="h-5 w-5 shrink-0 text-brand" />}
                label="Total Clusters"
                value={clusterRows.length}
              />
              <StatTile
                icon={<OwnersIcon className="h-5 w-5 shrink-0 text-brand" />}
                label="Cluster Owners"
                value={distinctOwners}
              />
              <DailyBarChart
                title="Cluster Count"
                days={clusterCount}
                formatValue={(v) => String(v)}
                emptyMessage="No clusters existed in the last 7 days."
              />
              <DailyBarChart
                title="Daily Spend"
                days={dailySpend}
                formatValue={formatUsd}
                emptyMessage="No cost data for the last 7 days - the Capella API key has no billing access, or usage hasn't been reported yet."
              />
            </div>
          )}
          {tab === "clusters" ? <ClusterTable rows={clusterRows} /> : <HistoryTable rows={historyRows} />}
        </div>
      </main>
    </div>
  );
}
