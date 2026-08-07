## Context

`turnOffCluster()`/`deleteCluster()` (`src/lib/capellaClient.ts`) already exist and are exercised today only by `runReconciliationPass()` (`src/lib/reconciliation.ts`), gated on `ClusterRecord.consentStatus` being `approved-turnoff`/`approved-delete`. That path re-reads the record fresh immediately before writing back a single field (`applyActionOutcome`), specifically to avoid clobbering a concurrent sync or Slack-driven write during the up-to-120s Capella call - the same hazard applies here.

Two details matter for "reflected without a manual refresh" (proposal): `config.status` and `deletedAt` are today only ever set by `src/lib/sync.ts`, on its own poll cycle (`syncIntervalHours`, default 1 hour). Calling `turnOffCluster`/`deleteCluster` alone would leave the dashboard showing stale state for up to an hour. `formatStatusLabel`/`isAlreadyOff` (`src/lib/configSummary.ts`, `src/lib/slack.ts`) already work off the raw Capella string `"turnedOff"` (camelCase `currentState`), so that's the exact value to write locally.

`supersedeLiveMessage` (`src/lib/notifications.ts`) already does the "cancel a live Slack message" work and is used by the three existing callers that end a consent cycle early - it's currently module-private.

See proposal.md for motivation; see specs/manual-cluster-actions/spec.md for behavior requirements.

## Goals / Non-Goals

**Goals:**
- Manual turn-off/delete take effect against Capella immediately, and the dashboard reflects the new state on the same page without a manual refresh, without waiting for the next sync cycle.
- Reuse the existing "re-read fresh, write narrowly" concurrency discipline from `reconciliation.ts` rather than introducing a new pattern.
- Keep the consent/reconciliation state machine (`consentStatus`, `actionOutcome`, `consentTierAtDecision`) completely untouched by this path.

**Non-Goals:**
- Turning a cluster back on (out of scope per proposal).
- Any change to the automatic, tier-triggered consent flow or its Slack UX.
- A general-purpose modal/dialog system - the delete confirmation is a one-off, minimal component, not a reusable primitive.

## Decisions

**New module `src/lib/manualActions.ts`, mirroring `sendManualConsentRequest`'s shape.**
Two functions, `manualTurnOff(clusterId)` and `manualDelete(clusterId)`, each: read the record fresh, call `supersedeLiveMessage` if a live consent message exists (extracted from `notifications.ts` and exported, since it's the exact "end this cycle early" logic already used for the newer-reminder/expiry/tier-change cases), call the corresponding `capellaClient` function, then re-read fresh again and upsert just the field(s) this action owns (`config.status = "turnedOff"` for turn-off; `deletedAt = <now>` for delete) - not the whole in-memory record, for the same clobber-avoidance reason `applyActionOutcome` does it. `app/actions.ts` gets two thin `"use server"` wrappers (`manualTurnOffAction`, `manualDeleteAction`) calling into it and `revalidatePath("/")`, matching `sendConsentRequestAction`'s existing shape exactly.

*Alternative considered*: set `consentStatus`/`actionOutcome` and let `runReconciliationPass` perform the actual call. Rejected - those fields specifically model the owner-consent lifecycle (reminders, expiry, tier-recheck); reusing them for an admin override blurs a distinction the schema currently keeps clean, and adds up to a 5-minute delay for something explicitly meant to be immediate.

**Visibility rule reuses `isAlreadyOff` (`src/lib/slack.ts`), exported already.**
The turn-off control's hidden/shown condition is exactly `!isAlreadyOff(cluster.config.status)`, the same predicate that already suppresses the redundant Slack turn-off ask - no new logic to write or keep in sync with it. The delete control's condition is simply `!deletedAt`, matching how `SendConsentRequestButton` is already gated in `ClusterTable.tsx`.

**Two new client components, placed in the "Cluster" detail group of `ClusterTable.tsx`.**
- `ManualTurnOffButton`: same `useTransition` + inline-result shape as `SendConsentRequestButton`, but the click doesn't fire the action directly - it flips local state to render "Turn off this cluster? [Confirm] [Cancel]" inline, and only the Confirm click calls the server action.
- `ManualDeleteButton`: opens a small fixed-position overlay (no library - a `<div>` backdrop + centered panel, dismissible via backdrop click or Escape) containing a text input; the submit button stays `disabled` until the typed value strictly equals `clusterName`. This is the first modal-like UI in the codebase; kept intentionally minimal rather than reaching for a dialog library, consistent with the project's zero-extra-dependency UI so far (Tailwind + hand-rolled SVGs only).

*Alternative considered*: `window.confirm()` for turn-off, or for both. Rejected per exploration - it can't express the type-the-name friction delete needs, and reads as out of place next to the app's own styled controls.

**Failure handling matches `RefreshResult`/`ManualConsentResult`.**
Both new server actions return `{ ok: boolean; message: string }`; a `CapellaApiError` (including on the write itself, e.g. 422 deletion-protection) is caught and surfaced as `ok: false` with its message, leaving the stored record untouched - no optimistic local update happens until Capella's call actually succeeds.

## Risks / Trade-offs

- **Writing `config.status`/`deletedAt` locally right after a successful call, ahead of the next real sync** → the next sync cycle re-reads Capella and overwrites it anyway (`upsertClusters` semantics already tolerate this), so this is a harmless, temporary optimistic write, not a second source of truth.
- **A manual action leaves `consentStatus`/`actionOutcome` exactly as they were** (e.g. a cluster manually deleted while `consentStatus` was `"pending"`, before the message is superseded) → superseding the live message is the mitigation the proposal already calls for; the stale `consentStatus` value itself is harmless since `applyConsentNotifications`'s tier-transition reset (`cluster-consent-notifications` spec) will clear it on the next tier change, and nothing reads `consentStatus` to gate anything post-deletion.
- **No permission gating, same as every existing dashboard action** - called out explicitly in the spec rather than silently assumed, since delete is a step up in blast radius from anything the dashboard does unilaterally today.
