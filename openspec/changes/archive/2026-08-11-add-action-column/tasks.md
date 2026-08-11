## 1. Row data

- [x] 1.1 In `app/page.tsx`, add `ownerEligibleForAsk: boolean` to `ClusterRow`, computed with `isEmailLike(record.ownerDerived)` from `src/lib/notifications.ts`.

## 2. Turn off: modal confirmation

- [x] 2.1 In `app/components/ManualTurnOffButton.tsx`, replace the inline `[Confirm] [Cancel]` swap with a modal dialog (overlay, `role="dialog"`, `aria-modal`, Escape-to-close), mirroring `ManualDeleteButton.tsx`'s existing modal shell minus its type-the-name input.
- [x] 2.2 Add a `disabled: boolean` prop to `ManualTurnOffButton`; when `true`, render the control disabled with a `title`/tooltip ("Cluster is already off") and prevent the modal from opening.

## 3. Ask: pre-emptive disable

- [x] 3.1 Add a `disabled: boolean` prop to `app/components/SendConsentRequestButton.tsx`; when `true`, render the control disabled with a `title`/tooltip ("No email-shaped owner to notify") and prevent the request from firing.

## 4. Action column

- [x] 4.1 In `app/components/ClusterTable.tsx`, add a new `action` column definition, appended after the existing 13 columns (rightmost), rendering `SendConsentRequestButton`, `ManualTurnOffButton`, and `ManualDeleteButton` together for each row.
- [x] 4.2 Wire `ManualTurnOffButton`'s `disabled` prop to `row.original.statusIsOff` and `SendConsentRequestButton`'s `disabled` prop to `!row.original.ownerEligibleForAsk` at the new column's cell.
- [x] 4.3 Remove `SendConsentRequestButton` from the Consent column's cell, leaving only the `ConsentBadge`.
- [x] 4.4 Remove Turn off / Delete from the row-detail panel's Cluster group `Actions` field.
  - **Deviation from plan**: this change was proposed before the concurrently-developed `cluster-history-log` change landed a `ClusterHistoryButton` into that same `Actions` `dd`, alongside Turn off/Delete. That button is out of scope here, so instead of deleting the field outright (as design.md assumed), it was kept and relabeled `History`, now holding only `ClusterHistoryButton`.

## 5. Verification

- [x] 5.1 Run the app and confirm: every row shows Ask/Turn off/Delete together in the rightmost Action column; the Consent column shows only the badge; the expanded detail panel has no action controls.
- [x] 5.2 Confirm an already-off cluster shows Turn off disabled (not hidden) with an explanatory tooltip, and that Delete still works normally for it.
- [x] 5.3 Confirm a cluster with no email-shaped owner shows Ask disabled with an explanatory tooltip, and that a cluster with an email-shaped owner shows Ask enabled.
- [x] 5.4 Confirm clicking Turn off opens a modal (not an inline swap), and that canceling/dismissing it leaves the cluster unchanged.
- [x] 5.5 Confirm the table still fits within the viewport without horizontal scroll at 640px+ with the new column present (existing wrap behavior applies).

**How this was verified**: the real `data/` directory holds live Capella API keys and a live Slack bot token, and its two real clusters are both already-off with a valid owner email - not enough to exercise every disabled path, and clicking a live Ask/Turn-off/Delete would hit real infrastructure. Verified instead against an isolated copy of the app (synthetic `data/clusters.json` with one running+email-owner cluster and one already-off+non-email-owner cluster, no Slack/Capella credentials) driven headlessly via Playwright. Confirmed via DOM inspection: row 1 (running, email owner) - Ask/Turn off/Delete all enabled, Ask's title is "Send consent request". Row 2 (already off, non-email owner) - Ask disabled with title "No email-shaped owner to notify", Turn off disabled with title "Cluster is already off", Delete still enabled. Turn off's click opened the modal (screenshotted); Cancel closed it with the cluster's status unchanged. Consent column showed only the badge; the expanded detail panel showed Org ID/Project ID/Couchbase Version/Storage/Last Synced/History with no Turn off or Delete. 5.5 confirmed visually in the same screenshots (1400px viewport, no horizontal scroll). Never clicked Confirm on Turn off/Delete or Ask on an eligible row - no real infrastructure was touched, and the real `data/settings.json` was never modified (one attempted edit was correctly blocked by the permission classifier).
