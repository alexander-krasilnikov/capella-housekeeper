const DAY_MS = 24 * 60 * 60 * 1000;

export function ageDaysBetween(createdAtMs: number, now: number): number {
  return Math.floor((now - createdAtMs) / DAY_MS);
}

export function formatAge(createdAtMs: number, now: number): string {
  const days = ageDaysBetween(createdAtMs, now);
  if (days < 1) return "< 1 day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function formatUsd(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
