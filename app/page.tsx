import Link from "next/link";
import { readClusters } from "@/lib/store";
import { readSettings } from "@/lib/settings";
import { formatConfigSummary, formatStatusLabel } from "@/lib/configSummary";
import { isAlreadyOff } from "@/lib/slack";
import { isEmailLike } from "@/lib/notifications";
import { ageDaysBetween, ageHoursBetween, formatAge } from "@/lib/format";
import { computeAgeStatus } from "@/lib/ageStatus";
import { type ClusterRow } from "./components/ClusterTable";
import { type HistoryRow } from "./components/HistoryTable";
import DashboardTabs from "./components/DashboardTabs";
import RefreshButton from "./components/RefreshButton";
import SlackConnectionIndicator from "./components/SlackConnectionIndicator";
import ThemeToggle from "./components/ThemeToggle";
import { getSlackBotStatus } from "@/lib/slackBot";
import { getLifecycleAuditLog, describeAuditEntry, TRIGGER_LABEL } from "@/lib/historyView";
import { logoutAction } from "./actions";

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
  const [clusters, settings, auditLog] = await Promise.all([readClusters(), readSettings(), getLifecycleAuditLog()]);
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

  return (
    <main className="mx-auto w-full px-6 py-8 sm:w-[90%]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Capella <span className="text-brand">Housekeeper</span>
          </h1>
          <p className="text-sm text-ink-muted">
            {rows.length} cluster{rows.length === 1 ? "" : "s"} across all configured organizations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SlackConnectionIndicator initialStatus={getSlackBotStatus()} />
          <ThemeToggle />
          <Link
            href="/settings"
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover"
          >
            Settings
          </Link>
          <RefreshButton />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <DashboardTabs clusterRows={rows} historyRows={historyRows} />
    </main>
  );
}
