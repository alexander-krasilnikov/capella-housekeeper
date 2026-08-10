"use client";

import { useState, useTransition } from "react";
import { sendConsentRequestAction } from "../actions";

export default function SendConsentRequestButton({ clusterId }: { clusterId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Send consent request"
        aria-label="Send consent request"
        onClick={(e) => {
          e.stopPropagation();
          setResult(null);
          startTransition(async () => {
            const r = await sendConsentRequestAction(clusterId);
            setResult(r);
          });
        }}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
      >
        {pending ? "Asking…" : "Ask"}
      </button>
      {result && (
        // basis-full forces this onto its own line within the cell's
        // flex-wrap row (see ClusterTable.tsx's consent cell), rather than
        // fighting the badge and button for space on the same line.
        <span
          className={`w-full basis-full break-words text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
        >
          {result.message}
        </span>
      )}
    </>
  );
}
