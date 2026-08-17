import { cookies } from "next/headers";
import { readClusters, readHistory } from "@/lib/store";
import { readSettings } from "@/lib/settings";
import type { CostSnapshot } from "@/lib/costSeries";
import type { ClusterLifetime } from "@/lib/clusterCounts";
import { formatConfigSummary, formatStatusLabel } from "@/lib/configSummary";
import { classifyClusterStatus } from "@/lib/capellaClient";
import { isAlreadyOff } from "@/lib/slack";
import { isEmailLike } from "@/lib/notifications";
import { ageDaysBetween, ageHoursBetween, formatAge } from "@/lib/format";
import { computeAgeStatus } from "@/lib/ageStatus";
import { SIDEBAR_COLLAPSED_COOKIE_NAME, parseSidebarCollapsed } from "@/lib/sidebarPreference";
import { type ClusterRow } from "./components/ClusterTable";
import { type HistoryRow } from "./components/HistoryTable";
import DashboardTabs from "./components/DashboardTabs";
import { getSlackBotStatus } from "@/lib/slackBot";
import { getLifecycleAuditLog, describeAuditEntry, TRIGGER_LABEL } from "@/lib/historyView";
import { summarizeConsentAndActionHealth } from "@/lib/consentActionHealth";

// This page reads the local JSON store directly (not via fetch()), so
// Next has no signal that it's dynamic and will statically pre-render it
// at build time otherwise - freezing the dashboard on whatever the store
// contained during `next build` instead of showing live data per request.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  /** `?tab=history` - only meaningful as a one-time initial value, set by AppShell's History nav link when navigating in from outside the dashboard (e.g. Settings); in-dashboard tab switches are client-side state, not URL-driven. */
  searchParams: Promise<{ tab?: string }>;
}) {
  const [clusters, settings, auditLog, history, cookieStore, resolvedSearchParams] = await Promise.all([
    readClusters(),
    readSettings(),
    getLifecycleAuditLog(),
    readHistory(),
    cookies(),
    searchParams,
  ]);
  const now = Date.now();
  const initialSidebarCollapsed = parseSidebarCollapsed(cookieStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME)?.value);
  const initialTab = resolvedSearchParams.tab === "history" ? "history" : "clusters";

  // Dates/times are intentionally passed as raw timestamps, not
  // pre-formatted strings - formatting happens client-side in
  // ClusterTable so it reflects the visiting browser's own locale
  // (region, calendar, 12h/24h convention), which this server component
  // has no way to know.
  const rows: ClusterRow[] = clusters.map((c) => {
    const createdAtMs = new Date(c.createdAt).getTime();
    const lastActivityMs = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : null;
    return {
      clusterId: c.clusterId,
      orgId: c.orgId,
      projectId: c.projectId,
      org: c.orgName,
      project: c.projectName,
      name: c.clusterName,
      createdAtMs,
      ageLabel: formatAge(createdAtMs, now),
      ageDays: ageDaysBetween(createdAtMs, now),
      lastActivityMs,
      owner: c.ownerDerived ?? "Unknown",
      configSummary: formatConfigSummary(c.config),
      couchbaseVersion: c.config.couchbaseVersion ?? "—",
      actualCost: c.actualCost.amountUsd,
      actualCostAsOfMs: c.actualCost.asOf ? new Date(c.actualCost.asOf).getTime() : null,
      actualCostUnavailableReason: c.actualCost.unavailableReason ?? null,
      statusLabel: formatStatusLabel(c.config.status),
      statusBucket: classifyClusterStatus(c.config.status),
      statusIsOff: isAlreadyOff(c.config.status),
      ownerEligibleForAsk: isEmailLike(c.ownerDerived),
      consentStatus: c.consentStatus,
      actionOutcome: c.actionOutcome,
      snoozeUntilMs: c.snoozeUntil ? new Date(c.snoozeUntil).getTime() : null,
      snoozeJustification: c.snoozeJustification,
      consentStatusChangedAtMs: c.consentStatusChangedAt ? new Date(c.consentStatusChangedAt).getTime() : null,
      workflowNote: c.workflowNote,
      ageStatus: computeAgeStatus(
        ageHoursBetween(createdAtMs, now),
        lastActivityMs,
        c.lastActivitySource,
        now,
        settings,
      ),
      lastSyncedAtMs: new Date(c.lastSyncedAt).getTime(),
    };
  });

  // Same raw-timestamp-not-pre-formatted-string reasoning as `rows` above.
  const historyRows: HistoryRow[] = auditLog.map((entry) => ({
    clusterId: entry.clusterId,
    clusterName: entry.clusterName,
    org: entry.orgName,
    project: entry.projectName,
    takenAtMs: new Date(entry.takenAt).getTime(),
    trigger: entry.trigger,
    triggerLabel: TRIGGER_LABEL[entry.trigger],
    description: describeAuditEntry(entry),
  }));

  // Cost readings over time, for the daily-spend chart. History snapshots are
  // only appended when a tracked field changes, so the newest stored reading
  // can lag the live one - each cluster's current record is appended as a
  // final reading (at its own asOf, not `now`, since that's when the figure
  // was actually measured). Bucketing into days happens client-side, where
  // the viewer's timezone is known.
  const costSnapshots: CostSnapshot[] = [
    ...history.map((snapshot) => ({
      clusterId: snapshot.clusterId,
      takenAtMs: new Date(snapshot.takenAt).getTime(),
      amountUsd: snapshot.record.actualCost.amountUsd,
    })),
    ...clusters.map((c) => ({
      clusterId: c.clusterId,
      takenAtMs: new Date(c.actualCost.asOf ?? c.lastSyncedAt).getTime(),
      amountUsd: c.actualCost.amountUsd,
    })),
  ];

  // When each known cluster existed, for the cluster-count chart. Deleted
  // clusters are removed from the live store, so history is the only record
  // that they ever existed - and it carries the deletedAt that ends their
  // lifetime. The live records are applied last since they're authoritative
  // for anything still present.
  const lifetimeById = new Map<string, ClusterLifetime>();
  const latestSnapshotByCluster = new Map<string, (typeof history)[number]>();
  for (const snapshot of history) {
    const seen = latestSnapshotByCluster.get(snapshot.clusterId);
    if (!seen || snapshot.takenAt > seen.takenAt) latestSnapshotByCluster.set(snapshot.clusterId, snapshot);
  }
  for (const snapshot of latestSnapshotByCluster.values()) {
    lifetimeById.set(snapshot.clusterId, {
      clusterId: snapshot.clusterId,
      createdAtMs: new Date(snapshot.record.createdAt).getTime(),
      deletedAtMs: snapshot.record.deletedAt ? new Date(snapshot.record.deletedAt).getTime() : null,
    });
  }
  for (const c of clusters) {
    lifetimeById.set(c.clusterId, {
      clusterId: c.clusterId,
      createdAtMs: new Date(c.createdAt).getTime(),
      deletedAtMs: c.deletedAt ? new Date(c.deletedAt).getTime() : null,
    });
  }
  const clusterLifetimes = [...lifetimeById.values()];

  // Exact rolling 7-day window (not calendar-day buckets) - unlike the two
  // charts above, this has no per-day axis, so there's no reason to involve
  // the viewer's timezone; safe to compute here with the server's `now`.
  const consentActionHealth = summarizeConsentAndActionHealth(auditLog, now);

  // All chrome (brand, nav, page header, logout) lives in DashboardTabs -
  // the page title depends on which view is active, which is client state.
  return (
    <DashboardTabs
      clusterRows={rows}
      historyRows={historyRows}
      costSnapshots={costSnapshots}
      clusterLifetimes={clusterLifetimes}
      consentActionHealth={consentActionHealth}
      initialSlackStatus={getSlackBotStatus()}
      developerTurnOnEnabled={settings.developerTurnOnEnabled}
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialTab={initialTab}
    />
  );
}
