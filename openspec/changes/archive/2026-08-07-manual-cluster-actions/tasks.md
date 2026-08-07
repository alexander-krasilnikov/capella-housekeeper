## 1. Backend: manual action module

- [x] 1.1 Export `supersedeLiveMessage` from `src/lib/notifications.ts` (currently module-private).
- [x] 1.2 Export `isAlreadyOff` usage confirmed available from `src/lib/slack.ts` (already exported) - no change needed, just import it where used.
- [x] 1.3 Create `src/lib/manualActions.ts` with `manualTurnOff(clusterId)`: read cluster fresh, resolve its org from settings, call `supersedeLiveMessage` if a live consent message exists, call `turnOffCluster`, re-read fresh and upsert `config.status = "turnedOff"` only, return `{ ok, message }`. Catch `CapellaApiError` and return `ok: false` with its message instead of throwing.
- [x] 1.4 Add `manualDelete(clusterId)` to the same module, same shape, calling `deleteCluster` and upserting `deletedAt = <now>` only on success.
- [x] 1.5 Add `manualTurnOffAction`/`manualDeleteAction` server actions to `app/actions.ts` (`"use server"`), each calling into `manualActions.ts` and `revalidatePath("/")` on success, matching `sendConsentRequestAction`'s shape.

## 2. Frontend: turn-off control

- [x] 2.1 Create `app/components/ManualTurnOffButton.tsx`: `useTransition` + inline-result pattern from `SendConsentRequestButton.tsx`, but clicking the initial button flips local state to an inline "Turn off this cluster? [Confirm] [Cancel]" prompt; only Confirm calls `manualTurnOffAction`.
- [x] 2.2 Render it in the "Cluster" detail group of `ClusterTable.tsx`, only when `!isAlreadyOff(row.original's raw status)` and the cluster isn't deleted.

## 3. Frontend: delete control

- [x] 3.1 Create `app/components/ManualDeleteButton.tsx`: button opens a minimal overlay (backdrop + centered panel, dismissible via backdrop click or Escape) with a text input; submit stays disabled until the typed value strictly equals the cluster's name; submit calls `manualDeleteAction` via `useTransition`, shows inline success/error result, closes the overlay on success.
- [x] 3.2 Render it in the "Cluster" detail group of `ClusterTable.tsx`, only when the cluster isn't already deleted.

## 4. Verification

- [ ] 4.1 Manually verify: turning off a cluster with no active consent cycle succeeds and the row's status badge updates to "Turned Off" without a page reload.
- [ ] 4.2 Manually verify: turning off/deleting a cluster that has a live pending Slack consent message supersedes that message (check the Slack message updates to a superseded state).
- [ ] 4.3 Manually verify: the turn-off control is absent once a cluster is already turned off; both controls are absent once a cluster is marked deleted.
- [ ] 4.4 Manually verify: the delete confirmation cannot be submitted until the typed text exactly matches the cluster name, and canceling either confirmation leaves the cluster untouched.
- [ ] 4.5 Manually verify: a simulated Capella failure (e.g. temporarily wrong API key) surfaces an inline error and leaves the row's displayed state unchanged.
- [x] 4.6 Run `openspec validate manual-cluster-actions --strict` and fix any reported issues.
