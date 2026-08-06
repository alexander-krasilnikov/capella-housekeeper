"use client";

import { useState, useTransition } from "react";
import { refreshAction } from "../actions";

export default function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span
          className={`text-xs ${
            result.ok
              ? "text-slate-500 dark:text-slate-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
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
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
