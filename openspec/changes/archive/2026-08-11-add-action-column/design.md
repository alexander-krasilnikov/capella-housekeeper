## Context

`ClusterTable.tsx` renders a TanStack Table v8 grid client-side. `ClusterRow` (built in `page.tsx` from each `ClusterRecord`) already carries `statusIsOff`, computed via `isAlreadyOff(config.status)` from `src/lib/slack.ts`. Owner-eligibility for the Ask control has no client-side equivalent today - `isEmailLike` (in `src/lib/notifications.ts`) is currently only called server-side, inside the `sendManualConsentRequest` action, after the button is already clicked. There is no menu/dropdown/popover component in the codebase (per proposal.md's Impact section) - not needed here since Option A (three inline buttons, no menu) was chosen. `ManualDeleteButton.tsx` already has the hand-rolled modal pattern (fixed overlay, `role="dialog"`, `aria-modal`, manual Escape-key listener) this change reuses for Turn off.

## Goals / Non-Goals

**Goals:**
- Move Ask/Turn off/Delete into one rightmost "Action" column, unconditionally rendering all three per row.
- Make Turn off's confirmation a modal (no more in-place row-height reflow).
- Make both Turn off (already-off) and Ask (ineligible owner) disabled-with-explanation instead of omitted-or-silently-failing.
- Keep every server action (`manualTurnOffAction`, `manualDeleteAction`, `sendConsentRequestAction`) and their underlying `src/lib` implementations untouched - this is a presentation-layer change.

**Non-Goals:**
- No menu/kebab/popover component - three buttons stay inline and unconditional per row (decided during exploration, see proposal).
- No change to Delete's existing type-to-confirm modal.
- No change to what happens once an action *succeeds or fails* (result surfacing, revalidation) - only to reachability, confirmation mechanism, and pre-click enablement.
- No change to the "omit both controls once a cluster is deleted" behavior - deleted clusters are already removed from the live store/table entirely, so that scenario doesn't interact with this change.

## Decisions

**Turn off adopts Delete's modal shell, not a new one.** `ManualDeleteButton.tsx`'s overlay/dialog/Escape-listener structure is extracted or duplicated for `ManualTurnOffButton.tsx`, minus the type-the-name input (turn-off keeps a plain confirm/cancel, matching the existing risk-scaled friction: type-to-confirm is reserved for the irreversible delete). Alternative considered: leave Turn off's inline swap as-is and only move its *position* into the Action column. Rejected because an inline confirm swap inside a dense multi-button cell would reflow that cell's siblings on every click, which is worse in a compact column than it was in the spacious detail-panel `dd` it lived in before.

**Turn off's disabled state is a prop, not a conditional render.** `ManualTurnOffButton` gains a `disabled: boolean` (driven by `statusIsOff`, passed down from `ClusterRow`) plus a `title`/tooltip explaining why ("Cluster is already off"). The call site in `ClusterTable.tsx` changes from `{!row.original.statusIsOff && <ManualTurnOffButton .../>}` to always rendering it with `disabled={row.original.statusIsOff}`.

**Ask's eligibility check is computed once, upstream, not duplicated per-render.** `page.tsx` already computes `statusIsOff` per row from server data; the same spot gains an `ownerEligibleForAsk: boolean` field on `ClusterRow`, computed with the existing exported `isEmailLike(record.ownerDerived)` from `src/lib/notifications.ts` (no new eligibility logic - reuses the exact check the server action already enforces, so the disabled state and the server's actual failure condition can never disagree). `SendConsentRequestButton` gains a `disabled` prop driven by that field, with a title explaining why ("No email-shaped owner to notify").

**Column position: rightmost, not reorderable-away from the data columns' semantics.** The Action column is appended after the existing 13 in the `columns` array. It is a normal TanStack column like the others, so it inherits existing hide/reorder/persist behavior for free - no special-casing needed. (Whether it makes sense for an operator to hide the Action column entirely is a UX question already answered by the existing "Column visibility" requirement applying uniformly to all columns; nothing new to decide here.)

**Detail-row Actions field is deleted, not replaced.** The `dd` at `ClusterTable.tsx:718-732` (`Actions` inside the Cluster detail group) is removed outright. Nothing moves into that slot - the Cluster group simply has one fewer field.

## Risks / Trade-offs

- **Wider row.** Adding a fourth "control-bearing" column (after Status/AgeStatus/Consent) makes rows wider. → Mitigated by the existing "no horizontal scroll, cells wrap" requirement in `cluster-dashboard-ui`, which already applies to this new column like any other; if three buttons don't fit at narrow widths they wrap onto a second line within the cell rather than overflowing, consistent with how other cells behave today.
- **Disabled-but-visible Turn off could invite confused clicks** ("why won't this work?") more than an absent control would. → Mitigated by requiring a `title`/tooltip on the disabled state explaining why, per the Decisions section above.
- **Duplicating (or extracting) the modal shell between Delete and Turn off risks drift** if one is updated later without the other. → Out of scope to resolve architecturally in this change (no shared modal component exists yet, and inventing one is more refactor than this proposal calls for); flagged here so a future change can consider extracting a shared confirmation-modal primitive if a third consumer appears.
