"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOrgNameAction, saveOrgsAction } from "../actions";
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

/**
 * Inline-editable grid cell styling: transparent/borderless at rest so the
 * cell reads as plain text, same as the read-only Name cell next to it -
 * hovering or focusing it is what reveals it's actually an editable field,
 * rather than every cell showing permanent input chrome like a stacked form.
 */
const gridInputClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition hover:border-line hover:bg-canvas focus:border-brand focus:bg-canvas focus:ring-2 focus:ring-brand/30";

const DEBOUNCE_MS = 500;

/**
 * The organization's name isn't something an operator types - it's fetched
 * live from the Capella API once an org ID and API key are both present
 * (the same lookup sync.ts does on every cycle; see its `getOrganization`
 * call), and is otherwise not knowable up front. `initialName` (from
 * settings' cached fallback) renders immediately so there's no flash of
 * "loading" for an org that's already configured, while a fresh lookup
 * runs in the background to catch a name change on Capella's side. A
 * hidden input re-submits whatever name is currently resolved, so saving
 * the form keeps that fallback cache up to date without the operator ever
 * editing it directly.
 */
function OrgNameCell({ orgId, apiKey, initialName }: { orgId: string; apiKey: string; initialName: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ok" | "error"; name: string; error?: string }>(
    () => ({ status: initialName ? "ok" : "idle", name: initialName }),
  );
  const requestId = useRef(0);
  // True only for the very first effect run (component mount) - lets that
  // run silently re-verify an already-known-good cached name in the
  // background (no loading flash, and a transient failure doesn't blank
  // out a name that was working a moment ago). Any later run means the
  // operator actually edited orgId/apiKey, so it always shows a fresh
  // loading/error state instead - a changed credential's old name is stale,
  // not a safe fallback.
  const didMountRef = useRef(false);

  useEffect(() => {
    const trimmedOrgId = orgId.trim();
    const trimmedApiKey = apiKey.trim();
    const isInitialMount = !didMountRef.current;
    didMountRef.current = true;

    if (!trimmedOrgId || !trimmedApiKey) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }

    const thisRequest = ++requestId.current;
    if (!isInitialMount) setState((s) => ({ ...s, status: "loading" }));
    const timer = setTimeout(() => {
      fetchOrgNameAction(trimmedOrgId, trimmedApiKey).then((r) => {
        // A newer keystroke may have started another request since this one
        // fired - ignore a stale response so it can't clobber a fresher result.
        if (thisRequest !== requestId.current) return;
        if (r.ok) {
          setState({ status: "ok", name: r.name });
        } else if (isInitialMount) {
          setState((s) => (s.status === "ok" ? s : { status: "error", name: "", error: r.error }));
        } else {
          setState({ status: "error", name: "", error: r.error });
        }
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [orgId, apiKey]);

  return (
    <span className="flex items-center px-2 py-1.5">
      <input type="hidden" name="orgName" value={state.name} />
      {state.status === "idle" && <span className="text-sm text-ink-faint">—</span>}
      {state.status === "loading" && <span className="text-sm text-ink-faint">Looking up…</span>}
      {state.status === "ok" && <span className="text-sm font-medium text-ink">{state.name}</span>}
      {state.status === "error" && (
        <span className="text-sm text-amber-600 dark:text-amber-400" title={state.error}>
          Couldn&rsquo;t verify
        </span>
      )}
    </span>
  );
}

export default function OrgsEditor({ initialOrgs }: { initialOrgs: OrgConfig[] }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initialOrgs));

  function updateRow(key: string, field: "orgId" | "apiKey", value: string) {
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
    <form action={saveOrgsAction} className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No organizations configured yet - add one below.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-hover text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Organization ID</th>
                <th className="px-3 py-2">API key</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="group border-t border-line align-top transition hover:bg-panel-hover">
                  <td className="px-1">
                    <OrgNameCell orgId={row.orgId} apiKey={row.apiKey} initialName={row.orgName} />
                  </td>
                  <td className="px-1">
                    <input
                      name="orgId"
                      value={row.orgId}
                      onChange={(e) => updateRow(row.key, "orgId", e.target.value)}
                      className={gridInputClass}
                      placeholder="org-id"
                    />
                  </td>
                  <td className="px-1">
                    <div className="flex items-center gap-1">
                      <input
                        name="apiKey"
                        type={row.revealed ? "text" : "password"}
                        value={row.apiKey}
                        onChange={(e) => updateRow(row.key, "apiKey", e.target.value)}
                        className={gridInputClass}
                        placeholder="API key"
                      />
                      <button
                        type="button"
                        onClick={() => toggleReveal(row.key)}
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-faint transition hover:bg-canvas hover:text-ink"
                      >
                        {row.revealed ? "Hide" : "Show"}
                      </button>
                    </div>
                  </td>
                  <td className="px-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-rose-600 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 focus:opacity-100 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:bg-panel-hover"
        >
          + Add organization
        </button>
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover active:bg-brand-active"
        >
          Save organizations
        </button>
      </div>
    </form>
  );
}
