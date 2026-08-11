"use client";

import { useTransition } from "react";
import { sendConsentRequestAction } from "../actions";

export default function SendConsentRequestButton({
  clusterId,
  disabled = false,
  onResult,
}: {
  clusterId: string;
  disabled?: boolean;
  /** Result is reported upward - the Ask button lives in the Action column, but its result message displays under the Consent badge instead, so the caller owns that state. */
  onResult: (result: { ok: boolean; message: string } | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending || disabled}
      title={disabled ? "No email-shaped owner to notify" : "Send consent request"}
      aria-label="Send consent request"
      onClick={(e) => {
        e.stopPropagation();
        onResult(null);
        startTransition(async () => {
          onResult(await sendConsentRequestAction(clusterId));
        });
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
    >
      {pending ? "Asking…" : "Ask"}
    </button>
  );
}
