"use client";

import { useState } from "react";
import ClusterTable, { type ClusterRow } from "./ClusterTable";
import HistoryTable, { type HistoryRow } from "./HistoryTable";

type Tab = "clusters" | "history";

export default function DashboardTabs({
  clusterRows,
  historyRows,
}: {
  clusterRows: ClusterRow[];
  historyRows: HistoryRow[];
}) {
  const [tab, setTab] = useState<Tab>("clusters");

  return (
    <div className="flex w-full flex-col gap-4">
      <div role="tablist" aria-label="Dashboard view" className="flex w-fit items-center gap-1 rounded-lg border border-line bg-panel p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "clusters"}
          onClick={() => setTab("clusters")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "clusters" ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-panel-hover"
          }`}
        >
          Clusters <span className={tab === "clusters" ? "text-brand-ink/70" : "text-ink-faint"}>{clusterRows.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "history" ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-panel-hover"
          }`}
        >
          History <span className={tab === "history" ? "text-brand-ink/70" : "text-ink-faint"}>{historyRows.length}</span>
        </button>
      </div>

      {tab === "clusters" ? <ClusterTable rows={clusterRows} /> : <HistoryTable rows={historyRows} />}
    </div>
  );
}
