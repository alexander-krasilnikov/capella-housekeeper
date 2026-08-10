"use client";

import { useState, useTransition } from "react";
import { refreshAction } from "../actions";

export default function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`text-xs ${result.ok ? "text-ink-muted" : "text-rose-600 dark:text-rose-400"}`}>
          {result.message}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await refreshAction();
            setResult(r);
          });
        }}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover active:bg-brand-active disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
