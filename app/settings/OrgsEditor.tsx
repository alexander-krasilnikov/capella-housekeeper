"use client";

import { useState } from "react";
import { saveOrgsAction } from "../actions";
import type { OrgConfig } from "@/types";

interface Row {
  key: string;
  orgId: string;
  orgName: string;
  apiKey: string;
  revealed: boolean;
}

function toRows(orgs: OrgConfig[]): Row[] {
  return orgs.map((o, i) => ({
    key: `existing-${i}`,
    orgId: o.orgId,
    orgName: o.orgName ?? "",
    apiKey: o.apiKey,
    revealed: false,
  }));
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export default function OrgsEditor({ initialOrgs }: { initialOrgs: OrgConfig[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initialOrgs));

  function updateRow(key: string, field: "orgId" | "orgName" | "apiKey", value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function toggleReveal(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, revealed: !r.revealed } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: `new-${prev.length}-${crypto.randomUUID()}`, orgId: "", orgName: "", apiKey: "", revealed: true },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  return (
    <form
      action={saveOrgsAction}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No organizations configured yet - add one below.
        </p>
      )}

      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-end sm:gap-3"
        >
          <label className="flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Organization ID
            <input
              name="orgId"
              value={row.orgId}
              onChange={(e) => updateRow(row.key, "orgId", e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="org-id"
            />
          </label>
          <label className="flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Display name (optional)
            <input
              name="orgName"
              value={row.orgName}
              onChange={(e) => updateRow(row.key, "orgName", e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="Prod"
            />
          </label>
          <label className="flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            API key
            <div className="mt-1 flex gap-1.5">
              <input
                name="apiKey"
                type={row.revealed ? "text" : "password"}
                value={row.apiKey}
                onChange={(e) => updateRow(row.key, "apiKey", e.target.value)}
                className={inputClass}
                placeholder="API key"
              />
              <button
                type="button"
                onClick={() => toggleReveal(row.key)}
                className="shrink-0 rounded-lg border border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {row.revealed ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Add organization
        </button>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
        >
          Save organizations
        </button>
      </div>
    </form>
  );
}
