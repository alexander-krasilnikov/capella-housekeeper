import Link from "next/link";
import { readClusters } from "@/lib/store";
import { readSettings } from "@/lib/settings";
import { formatConfigSummary, formatStatusLabel } from "@/lib/configSummary";
import { isAlreadyOff } from "@/lib/slack";
import { ageDaysBetween, formatAge } from "@/lib/format";
import { computeAgeStatus } from "@/lib/ageStatus";
import ClusterTable, { type ClusterRow } from "./components/ClusterTable";
import RefreshButton from "./components/RefreshButton";
import SlackConnectionIndicator from "./components/SlackConnectionIndicator";
import { getSlackBotStatus } from "@/lib/slackBot";
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
  const [clusters, settings] = await Promise.all([readClusters(), readSettings()]);
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
      consentStatus: c.consentStatus,
      actionOutcome: c.actionOutcome,
      snoozeUntilMs: c.snoozeUntil ? new Date(c.snoozeUntil).getTime() : null,
      snoozeJustification: c.snoozeJustification,
      ageStatus: computeAgeStatus(
        ageDaysBetween(createdAtMs, now),
        lastActivityMs,
        c.lastActivitySource,
        now,
        settings,
      ),
      deleted: c.deletedAt !== null,
      lastSyncedAtMs: new Date(c.lastSyncedAt).getTime(),
    };
  });

  return (
    <main className="mx-auto w-full px-6 py-8 sm:w-[90%]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Capella Housekeeper</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {rows.length} cluster{rows.length === 1 ? "" : "s"} across all configured organizations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SlackConnectionIndicator initialStatus={getSlackBotStatus()} />
          <Link
            href="/settings"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Settings
          </Link>
          <RefreshButton />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <ClusterTable rows={rows} />
    </main>
  );
}
