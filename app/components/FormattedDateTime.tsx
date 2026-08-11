"use client";

import { useEffect, useState } from "react";

/**
 * Formats a timestamp using the visiting browser's own locale (region,
 * calendar, 12h/24h convention) rather than a hardcoded one - `undefined`
 * as the locale argument means "whatever this runtime's default is",
 * which is the actual browser once this runs client-side. 2-digit year,
 * no seconds, per explicit request.
 */
export function formatDateTime(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}

/**
 * Renders a locale-formatted date/time, correctly - not just quietly.
 * A Client Component's first render also happens on the server (for the
 * initial HTML), where `toLocaleString(undefined, ...)` resolves to the
 * Node server's locale, not the browser's. Suppressing the resulting
 * hydration warning is not enough on its own: React only skips *warning*
 * about that mismatch, it doesn't schedule a re-render to correct it, so
 * without something to trigger one, the server's (wrong) locale would
 * stick permanently. This renders a neutral, locale-independent
 * placeholder for the server render and the first client paint (which
 * therefore match exactly - no mismatch, nothing to suppress), then swaps
 * to the real browser-formatted value once mounted, via a genuine
 * post-mount state update.
 */
export default function FormattedDateTime({ ms }: { ms: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (ms === null) return <>—</>;
  if (!mounted) return <>…</>;
  return <>{formatDateTime(ms)}</>;
}
