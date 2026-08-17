"use client";

import { useEffect, useState } from "react";
import AppShell from "./AppShell";
import ClusterTable, { type ClusterRow } from "./ClusterTable";
import HistoryTable, { type HistoryRow } from "./HistoryTable";
import { dailySpendFromSnapshots, type CostSnapshot } from "@/lib/costSeries";
import { maxClustersPerDay, type ClusterLifetime } from "@/lib/clusterCounts";
import { formatUsd } from "@/lib/format";
import type { ConsentAndActionHealth } from "@/lib/consentActionHealth";
import type { SlackBotStatus } from "@/lib/slackBot";

type Tab = "clusters" | "history";

interface DailyValue {
  label: string;
  /** null = no figure derivable for this day, rendered as "-" rather than a zero bar. */
  value: number | null;
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

/**
 * One row of the funnel/actions panels' horizontal bar chart: a label, a bar
 * scaled to the panel's own maximum, and the raw count (the bar is a visual
 * aid, not a replacement for it - see spec "raw counts... not percentages or
 * rates").
 */
function HorizontalBarRow({ label, value, maxValue }: { label: string; value: number; maxValue: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-24 shrink-0 text-xs text-ink-muted">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-line/50">
        <div
          className="h-full rounded-full bg-brand/70"
          style={{ width: `${value > 0 ? Math.max(4, (value / maxValue) * 100) : 0}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-sm font-semibold leading-none text-ink">{value}</span>
    </div>
  );
}

/** A titled panel of horizontal bars, one per row, each scaled to the panel's own maximum value - the shared shape behind both the Consent Cycles and Actions Taken panels below. See consent-action-health-stats spec "Funnel panel shows raw counts per outcome" / "Actions-taken panel shows raw counts by trigger". */
function BarPanel({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const maxValue = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="min-w-[280px] flex-1 rounded-xl border border-line bg-panel p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {rows.map((row) => (
        <HorizontalBarRow key={row.label} label={row.label} value={row.value} maxValue={maxValue} />
      ))}
    </div>
  );
}

export default function DashboardTabs({
  clusterRows,
  historyRows,
  costSnapshots,
  clusterLifetimes,
  consentActionHealth,
  initialSlackStatus,
  developerTurnOnEnabled,
  initialSidebarCollapsed,
  initialTab,
}: {
  clusterRows: ClusterRow[];
  historyRows: HistoryRow[];
  costSnapshots: CostSnapshot[];
  clusterLifetimes: ClusterLifetime[];
  consentActionHealth: ConsentAndActionHealth;
  initialSlackStatus: SlackBotStatus;
  developerTurnOnEnabled: boolean;
  initialSidebarCollapsed: boolean;
  /** From the `?tab=history` link AppShell's History nav item falls back to when mounted outside the dashboard (e.g. navigating there from Settings) - lets that link actually land on History instead of always reopening on Clusters. */
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [clusterCount, setClusterCount] = useState<DailyValue[] | null>(null);
  const [dailySpend, setDailySpend] = useState<DailyValue[] | null>(null);

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
          <BarPanel
            title="Consent Cycles (7d)"
            rows={[
              { label: "Approved", value: consentActionHealth.funnel.approved },
              { label: "Snoozed", value: consentActionHealth.funnel.snoozed },
              { label: "Expired", value: consentActionHealth.funnel.expired },
              { label: "Still pending", value: consentActionHealth.funnel.pending },
            ]}
          />
          <BarPanel
            title="Actions Taken (7d)"
            rows={[
              { label: "Auto", value: consentActionHealth.actions.autoDecided },
              { label: "Slack", value: consentActionHealth.actions.slackApproved },
              { label: "Manual", value: consentActionHealth.actions.manual },
            ]}
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
