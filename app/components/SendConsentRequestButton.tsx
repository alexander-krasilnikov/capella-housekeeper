"use client";

import { useState, useTransition } from "react";
import { sendConsentRequestAction } from "../actions";

/** Simple "send" dart/paper-plane shape - no icon library in this project, so a minimal hand-drawn path rather than pulling one in for a single glyph. */
function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 10l14.5-7-4.5 7 4.5 7L2 10z" />
    </svg>
  );
}

export default function SendConsentRequestButton({ clusterId }: { clusterId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <span className="inline-flex items-start gap-1.5">
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
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 p-1 text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
      >
        <SendIcon className={`h-3.5 w-3.5 ${pending ? "animate-pulse" : ""}`} />
      </button>
      {result && (
        <span
          className={`break-words text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
        >
          {result.message}
        </span>
      )}
    </span>
  );
}
