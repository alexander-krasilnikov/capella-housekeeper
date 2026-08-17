## Context

See proposal.md — Why. All three defects were found by tests written in the `harden-test-suite` change, which recorded each one next to the code it concerned rather than fixing it. The relevant existing structure:

- `capellaClient.ts` already exports `classifyClusterStatus`, which buckets Capella's `CurrentState` enum into `active` / `transitioning` / `off` / `unknown`, and `TRANSITIONAL_STATUS`, the exact in-progress values manual and reconciled actions write. `classifyClusterStatus` was introduced precisely to replace label-regex matching for the status badge; `isAlreadyOff` in `slack.ts` was left on the old approach.
- `slack.ts` imports `formatStatusLabel` from `configSummary.ts` for display purposes, and previously used that same humanized label as the input to a behavioral decision.
- `getBillingUsage` derived its two date bounds by different means: the end from `toISOString()` (UTC), the start from `getFullYear()`/`getMonth()` (local).

## Goals / Non-Goals

**Goals:**

- Draw the already-off decision from the same classification the dashboard uses, so the two can't diverge again.
- Make the billing window independent of the host timezone.
- Make the confirm-text limit structurally guaranteed rather than a margin that happens to hold.

**Non-Goals:**

- **No rework of `classifyClusterStatus`'s buckets.** Its treatment of `turningOffFailed` as `unknown` is deliberate — Capella's failure states are not force-fit into `active`/`off`. This change consumes that classification, it doesn't change it.
- **No migration of `formatStatusLabel` off label-based logic elsewhere.** It remains the display formatter, which is what it is for. Only the one behavioral use of it is replaced.
- **No backfill or reconciliation of previously mis-suppressed clusters.** Affected clusters self-heal on the next sync cycle; see the risk below.

## Decisions

### 1. `isAlreadyOff` = the `off` bucket, plus `turningOff` explicitly

```
classifyClusterStatus(status) === "off"  ||  status === TRANSITIONAL_STATUS.turningOff
```

The `off` bucket alone would be too narrow: `turningOff` classifies as `transitioning`, and asking an owner to turn off a cluster that is already turning off is pure noise. Naming that one transitional state explicitly, via the existing exported constant, keeps the intent legible — "off, or on its way off" — without duplicating Capella's state list into `slack.ts`.

**Alternative considered — a local `ALREADY_OFF_STATES` set in `slack.ts`:** rejected. It would re-introduce exactly the duplication that let `isAlreadyOff` drift from the badge classification in the first place.

**Alternative considered — widening the `off` bucket in `classifyClusterStatus` to include `turningOff`:** rejected. That bucket drives the status badge, where distinguishing "Turning Off" from "Turned Off" is the whole point of the earlier fix, and there is a regression test asserting it.

`destroying` deliberately remains not-already-off. A cluster being deleted is a rare and short-lived state, and treating it as off would be a second special case earning nothing.

### 2. Anchor both billing bounds in UTC

`new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))` for the start, leaving the existing `now.toISOString()` end unchanged. Both bounds now come from the same clock, which is the actual defect — the previous code was not simply "using local time", it was using local and UTC for the two ends of one range.

**Alternative considered — construct the string directly (`${y}-${m}-01`):** equivalent in result, but building a `Date` and formatting it the same way the end bound is formatted keeps the two lines visibly parallel, so a future edit to one is more likely to prompt the same edit to the other.

### 3. Trim the name, not the explanation

The 300-character budget is split between a fixed explanation and a caller-supplied name. The explanation is what makes a destructive confirmation meaningful, so the name absorbs the trimming, with a trailing ellipsis so a truncated name doesn't read as the cluster's real name. Computing the room from the actual prefix length means the guarantee holds automatically if a summary's wording changes.

## Risks / Trade-offs

- **Previously-silent clusters start generating owner DMs.** Any cluster sitting in `turningOffFailed` has been exempt from notifications; after this it is asked about again on the next sync cycle, and becomes eligible for auto-turn-off where configured. That is the fix working, but it can arrive as a small burst of messages rather than a trickle. → No mitigation applied deliberately: suppressing it would mean keeping the bug for the clusters that most need attention.

- **Reported month-to-date cost changes for installs ahead of UTC.** Figures will step down slightly on the next sync, because the previous month's final day is no longer folded in. → The new figure is the correct one; the previous one was inflated. Worth knowing before someone reads it as a billing anomaly.

- **`slack.ts` now imports from `capellaClient.ts`.** → No cycle: `capellaClient` imports only `rateLimiter` and types, neither of which reaches `slack`. Verified by the type check and the full suite.

- **An ellipsis is a multi-byte character.** → It is a single JavaScript string unit, and the limit Slack enforces is on the string, so the arithmetic holds. Covered by a test asserting the cap across name lengths from 0 to 10,000.

## Migration Plan

No migration. All three are in-process behavior changes taking effect on the next sync cycle after deployment; nothing persisted needs rewriting.

**Rollback:** revert the change. Persisted records written in the interim (a `workflowNote` from an auto-turn-off that the old code would have suppressed, or a slightly different `actualCost`) remain valid and are overwritten by subsequent cycles.
