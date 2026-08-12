import { readClusters, readHistory } from "@/lib/store";
import { readSettings } from "@/lib/settings";
import type { CostSnapshot } from "@/lib/costSeries";
import type { ClusterLifetime } from "@/lib/clusterCounts";
import { formatConfigSummary, formatStatusLabel } from "@/lib/configSummary";
import { isAlreadyOff } from "@/lib/slack";
import { isEmailLike } from "@/lib/notifications";
import { ageDaysBetween, ageHoursBetween, formatAge } from "@/lib/format";
import { computeAgeStatus } from "@/lib/ageStatus";
import { type ClusterRow } from "./components/ClusterTable";
import { type HistoryRow } from "./components/HistoryTable";
import DashboardTabs from "./components/DashboardTabs";
import { getSlackBotStatus } from "@/lib/slackBot";
import { getLifecycleAuditLog, describeAuditEntry, TRIGGER_LABEL } from "@/lib/historyView";

// This page reads the local JSON store directly (not via fetch()), so
// Next has no signal that it's dynamic and will statically pre-render it
// at build time otherwise - freezing the dashboard on whatever the store
// contained during `next build` instead of showing live data per request.
export const dynamic = "force-dynamic";

function formatStorage(storage: { type?: string; sizeGb?: number; iops?: number } | undefined): string {
  if (!storage) return "—";
  const parts = [
    storage.sizeGb !== undefined ? `${storage.sizeGb} GB` : null,
    storage.type ?? null,
    storage.iops !== undefined ? `${storage.iops} IOPS` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export default async function DashboardPage() {
  const [clusters, settings, auditLog, history] = await Promise.all([
    readClusters(),
    readSettings(),
    getLifecycleAuditLog(),
    readHistory(),
  ]);
  const now = Date.now();

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
      storageSummary: formatStorage(c.config.nodeSpec.storage),
      actualCost: c.actualCost.amountUsd,
      actualCostAsOfMs: c.actualCost.asOf ? new Date(c.actualCost.asOf).getTime() : null,
      actualCostUnavailableReason: c.actualCost.unavailableReason ?? null,
      statusLabel: formatStatusLabel(c.config.status),
      statusIsOff: isAlreadyOff(c.config.status),
      ownerEligibleForAsk: isEmailLike(c.ownerDerived),
      consentStatus: c.consentStatus,
      actionOutcome: c.actionOutcome,
      snoozeUntilMs: c.snoozeUntil ? new Date(c.snoozeUntil).getTime() : null,
      snoozeJustification: c.snoozeJustification,
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

  // All chrome (brand, nav, page header, logout) lives in DashboardTabs -
  // the page title depends on which view is active, which is client state.
  return (
    <DashboardTabs
      clusterRows={rows}
      historyRows={historyRows}
      costSnapshots={costSnapshots}
      clusterLifetimes={clusterLifetimes}
      initialSlackStatus={getSlackBotStatus()}
    />
  );
}
