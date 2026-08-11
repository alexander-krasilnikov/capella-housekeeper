## Context

See `proposal.md` - Why for the motivation (238 near-duplicate snapshots for one cluster; history writes only ever happen from `sync.ts`, on sync's cadence, never at the moment a Slack decision or manual action actually occurs).

Relevant existing code:
- `src/lib/store.ts` - `appendHistory`, `purgeExpiredHistory`, `withConsentDefaults` (the existing pattern for defaulting fields absent on old on-disk records).
- `src/lib/sync.ts` - builds one `ClusterSnapshot` per cluster unconditionally every cycle (line ~311), then a single batched `appendHistory(snapshots)` call at the end. It already re-reads the live store a second time (`freshExisting`, line ~349) right before its final writes, specifically to avoid clobbering a consent change a Slack click or reconciliation made *during* the cycle's long run of awaited API calls - the same race this design has to account for when deciding what to compare against.
- `src/lib/manualActions.ts`, `src/lib/slackBot.ts`, `src/lib/notifications.ts`, `src/lib/reconciliation.ts` - each mutates a cluster record via `upsertClusters` directly, with no history write at all today.

## Goals / Non-Goals

**Goals:**
- One shared change-comparison rule, used by every mutation site, so "did this really change" is answered the same way everywhere.
- History entries written at the moment a mutation happens, with an accurate timestamp, from wherever it happens.
- Two read surfaces over the same underlying store: a per-cluster timeline and a cross-cluster lifecycle audit log.

**Non-Goals:**
- Backfilling or collapsing the near-duplicate entries already on disk - they age out via the existing retention purge on their own schedule; this change only stops new duplicates from being written.
- Changing retention policy, the consent/notification workflow itself, or adding a public/external API over history.
- A generic diff-rendering library - a small field-list diff between two `ClusterRecord`s is enough for both UI surfaces.

## Decisions

### Comparison baseline: the pre-mutation live record, not a scan of history
Each mutation site already reads the current live record (from `clusters.json`) immediately before writing its change - `manualActions.ts` and `reconciliation.ts` already do this for clobber-avoidance, and `sync.ts` holds `existingById`/`freshExisting` for the same reason. The gating comparison reuses that same pre-mutation record as the "last known state" baseline, rather than re-reading `history.json` and scanning for the most recent entry per cluster.

This is safe under one invariant this change establishes and must preserve: a cluster's compared fields in `clusters.json` and in its most recent `history.json` entry are always identical between writes, because nothing changes a compared field without also appending a history entry for it. Given that invariant, "differs from the live record" and "differs from the last history entry" are the same check - and the live record is already in memory at every call site, at no extra read cost, while `history.json` only grows.

**Alternative considered:** re-read `history.json` and find the latest entry per `clusterId` at each mutation. Rejected - `history.json` is unbounded within the retention window and this would mean an O(n) scan (or an index to maintain) on every single mutation, for a value already available for free.

### A single shared comparator, keyed on a fixed field list
One function (`store.ts`) takes two `ClusterRecord`s and returns whether they differ on: `config`, `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, `consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`. It ignores `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, `lastActivitySource` entirely. `config` and `actualCost` are objects, so the comparison hashes or deep-equals them rather than using `===` - reusing the same approach `sync.ts` already uses for its config `fingerprint()`.

Note this means a cluster's deletion (`deletedAt: null → timestamp`) is just a normal pass of this same gate - no special-casing is needed to guarantee the final "deletion snapshot" behavior the `cluster-sync` spec already requires; it falls out of the general rule for free.

### sync.ts must gate against `freshExisting`, not `existingById`
`sync.ts` takes a real re-read of the store (`freshExisting`) right before its final writes specifically because a Slack click or reconciliation outcome can land mid-cycle, after `existingById` was captured but before this cycle finishes. If the gating comparison used `existingById` (the stale, top-of-cycle snapshot) as its baseline, a cluster whose consent state changed out-of-band during the cycle would look "changed" to sync's own gate - and sync would append a second, duplicate history entry for a change that `slackBot.ts`/`reconciliation.ts` already recorded, with the correct timestamp, at the moment it actually happened.

So: the gating comparison inside `sync.ts`'s final batched `appendHistory` call must run against `freshExisting`, matching the same reasoning the surrounding code already applies to its live-record writes. This is the one subtlety in an otherwise mechanical change - the other four call sites don't have this problem, since each of them is itself the only writer for its own mutation, with no concurrent cycle in flight.

### Trigger tag on every entry
`ClusterSnapshot` gains a `trigger` field: `"sync" | "manual-turn-off" | "manual-delete" | "slack-decision" | "manual-consent-request" | "reconciliation"`. Set once, by whichever call site performs the gated append. Used only for narration in the audit log UI (e.g. "via Slack" vs. "reconciliation performed") - it does not affect whether an entry is included in the audit log (see below).

**Correction found during implementation:** the automatic reminder/expiry logic in `notifications.ts` (`applyConsentNotifications`) never calls `upsertClusters` itself - it only mutates in-memory records that `sync.ts` commits once, at cycle end, alongside everything else that cycle changed. So its effects are already covered by sync's own `"sync"`-tagged gate (consistent with the note below - a sync cycle can itself be what triggers a genuine lifecycle event). The one write inside `notifications.ts` that actually happens out-of-band, independent of any cycle, is `sendManualConsentRequest` (the manual "send consent request" button) - that's the real call site needing its own tag, renamed `"manual-consent-request"` for accuracy rather than the originally-planned `"reminder-expiry"`, which no code path would ever have produced.

Entries written before this change lack the field. `readHistory()` defaults a missing `trigger` to `"sync"`, the same pattern `withConsentDefaults` already uses for old `ClusterRecord`s - accurate, since sync was the only writer before this change existed.

### Audit-log inclusion is a diff check, not a trigger check
Whether an entry shows up in the lifecycle audit log depends on whether its diff from the previous entry for that cluster touches a consent/lifecycle field (`consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`) - independent of its `trigger` tag. A sync cycle can itself be what triggers a genuine lifecycle event (e.g. `applyConsentNotifications` moving a cluster into "pending" the moment it crosses into the Stale tier) - that belongs in the audit log even though its trigger is `"sync"`. The trigger tag answers "how did this happen" for narration; the diff answers "does this belong in the audit log."

### UI surfaces
- **Per-cluster timeline**: a "History" action in the row-detail panel's Cluster group, opening a modal that lists this cluster's entries (server-fetched, filtered by `clusterId`) oldest-to-newest with the field-level diff from the previous entry.
- **Lifecycle audit log**: revised after initial implementation, based on direct feedback - rather than a standalone `/history` route, it's a "History" tab alongside "Clusters" on the dashboard itself (`DashboardTabs.tsx`), rendered as a sortable/searchable grid (`HistoryTable.tsx`, TanStack table, same visual language as `ClusterTable.tsx`) instead of a plain list. Columns: Cluster, Org, Project, Event, Trigger, When. Every cluster's lifecycle-relevant entries (per the diff check above) appear together, newest-first, each row's Event column a short sentence using the `trigger` tag to phrase it. Deleted clusters' entries are included the same as any other's, since they're read from `history.json` directly rather than joined against the live `clusters.json` table.

**Fields shared across surfaces, kept in `historyFields.ts` not `historyView.ts`:** `TRIGGER_LABEL`, `describeAuditEntry`, and the `AuditLogEntry` type have no `node:fs` dependency and live in `historyFields.ts` specifically so a Client Component (`ClusterHistoryButton.tsx`) can import them directly. `historyView.ts` (which does depend on `node:fs` via `readHistory`) re-exports them for server-side callers' convenience. Getting this wrong - importing anything from `historyView.ts` into a Client Component - breaks the production build outright (Turbopack: "the chunking context does not support external modules (request: node:fs)"), since it pulls the fs-backed code into the browser bundle graph.

## Risks / Trade-offs

- **[Risk]** Getting the sync-cycle gating baseline wrong (`existingById` instead of `freshExisting`) silently reintroduces duplicate entries for exactly the mid-cycle-race case this change is meant to fix. → Mitigation: covered by an explicit scenario in the `cluster-sync` delta spec and should get a dedicated test exercising a consent change landing mid-cycle.
- **[Risk]** `history.json` still contains hundreds of pre-existing near-duplicate entries from before this change ships. → Mitigation: none needed beyond existing retention purge; they age out on their own within the configured retention window (default 7 days), and this is explicitly a non-goal to backfill.
- **[Trade-off]** Comparing against the live record (rather than scanning history) means the gating logic is only as correct as the invariant it depends on (compared fields in `clusters.json` and the last history entry always match). If any future code path ever writes a compared field via `upsertClusters` without going through the shared gated-append helper, that invariant breaks silently - a future change touching cluster-record mutation should route through the shared helper rather than calling `upsertClusters` directly for a compared field.

## Migration Plan

1. Add `trigger` to `ClusterSnapshot` in `src/types.ts`; default missing values to `"sync"` in `readHistory()`.
2. Add the shared comparator + gated-append helper to `store.ts`.
3. Update `sync.ts`: filter the batched `snapshots` array against the comparator (baseline: `freshExisting`) before the final `appendHistory` call.
4. Update `manualActions.ts`, `slackBot.ts`, `notifications.ts`, `reconciliation.ts` to call the same gated-append helper at their existing mutation points, each with its own `trigger` value.
5. Build the per-cluster timeline modal and wire it into the row-detail panel.
6. Build the `/history` lifecycle audit log route.

No data migration is needed for entries already on disk - they're read with the defaulted `trigger` and included in the timeline/audit log like any other entry, subject to the same retention purge as before.
