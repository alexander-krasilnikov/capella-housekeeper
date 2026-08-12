"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell, { ClustersIcon } from "./AppShell";
import ClusterTable, { type ClusterRow } from "./ClusterTable";
import HistoryTable, { type HistoryRow } from "./HistoryTable";
import { dailySpendFromSnapshots, type CostSnapshot } from "@/lib/costSeries";
import { maxClustersPerDay, type ClusterLifetime } from "@/lib/clusterCounts";
import { formatUsd } from "@/lib/format";
import type { SlackBotStatus } from "@/lib/slackBot";

type Tab = "clusters" | "history";

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
  developerTurnOnEnabled,
  initialSidebarCollapsed,
}: {
  clusterRows: ClusterRow[];
  historyRows: HistoryRow[];
  costSnapshots: CostSnapshot[];
  clusterLifetimes: ClusterLifetime[];
  initialSlackStatus: SlackBotStatus;
  developerTurnOnEnabled: boolean;
  initialSidebarCollapsed: boolean;
}) {
  const [tab, setTab] = useState<Tab>("clusters");
  const [clusterCount, setClusterCount] = useState<DailyValue[] | null>(null);
  const [dailySpend, setDailySpend] = useState<DailyValue[] | null>(null);

  const distinctOwners = useMemo(
    // "Unknown" is the placeholder for a cluster with no derived owner (see
    // page.tsx), not a person - counting it would inflate the figure.
    () => new Set(clusterRows.map((r) => r.owner).filter((owner) => owner !== "Unknown")).size,
    [clusterRows],
  );

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
    <AppShell
      activeNav={tab}
      title={tab === "clusters" ? "Cluster Management" : "Lifecycle History"}
      clusterCount={clusterRows.length}
      historyCount={historyRows.length}
      initialSlackStatus={initialSlackStatus}
      initialCollapsed={initialSidebarCollapsed}
      onSelectTab={setTab}
    >
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
      {tab === "clusters" ? (
        <ClusterTable rows={clusterRows} developerTurnOnEnabled={developerTurnOnEnabled} />
      ) : (
        <HistoryTable rows={historyRows} />
      )}
    </AppShell>
  );
}
