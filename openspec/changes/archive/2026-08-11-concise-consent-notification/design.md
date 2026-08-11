## Context

See proposal.md for motivation. Relevant current-state constraints:

- `src/lib/slack.ts` already carries two versions of the turn-off/delete explanation: `ACTION_EXPLANATIONS` (full paragraph, used today in the message body) and `ACTION_CONFIRM_SUMMARY` (one-line, used only in the Block Kit `confirm` dialog on the destructive buttons). Snooze has only one version (`ACTION_EXPLANATIONS.snooze`) and no confirm dialog - clicking it opens a modal instead (see `buildSnoozeModalView`).
- `buildConsentMessage` builds both `blocks` (rendered message) and a flat `text` string (fallback for notification previews/screen readers) from the same set of lines; today `text` is a full concatenation of every body line.
- The no-response paragraph (`describeNoResponseConsequence`) already branches on tier (Forgotten gets an extra sentence) - this shape stays, only the wording shrinks.

## Goals / Non-Goals

**Goals:**
- One short summary string per offered action in the message body; for turn-off/delete, the body no longer repeats what the confirmation dialog already says.
- No-response notice is a single sentence, plus one short clause for Forgotten, instead of two full sentences.
- `text` fallback identifies the request (heading, cluster, org/project, tier) without concatenating the full body.

**Non-Goals:**
- No change to the consent lifecycle, state machine, persisted fields, or reminder/expiry timing (`notifications.ts` is untouched).
- No change to button mechanics or the confirmation-dialog requirement itself - only which prose lives where.
- No change to the snooze modal.

## Decisions

### Turn-off/delete keep exactly one long-form string each, and it moves to the confirm dialog only
Rather than maintaining a body string and a dialog string that say almost the same thing, `ACTION_EXPLANATIONS` for `turnoff`/`delete` is dropped and `ACTION_CONFIRM_SUMMARY` becomes each action's only string, used both for the confirm dialog (as today) and, in equally short form, for the message-body line. This is simpler than introducing a third "medium" string, and matches what the confirm dialog already treats as sufficient for the actual decision point.

Considered: keeping a separate short body summary distinct from the confirm summary. Rejected - the two would drift out of sync for no real benefit, since both are meant to say "what does this button do" in one line.

### Snooze keeps its own short line, since it has no confirm dialog to defer to
Snooze's explanation is already the shortest of the three and has nowhere else to move detail to (its "confirmation" is the modal's required-justification field, not a Block Kit confirm dialog). It gets a tightened one-liner in the body, not a removal.

### No-response consolidation is a template change, not a new data path
`describeNoResponseConsequence` keeps its existing tier-based branch; only the sentence templates change (two sentences → one sentence + one short clause for Forgotten). The required content elements from the spec (reminder count, expiry period, "no automatic action", Forgotten grace-period note) are all still present.

### `text` fallback is built independently of the block lines, not derived from them
Today `text` is assembled by concatenating the same variables used in the blocks. Since the blocks now deliberately omit detail that's no longer needed in a preview context, `text` is built as its own short string (heading + cluster + org/project + tier) rather than continuing to track whatever the blocks happen to contain.

## Risks / Trade-offs

- **[Risk] The turn-off caveat ("Data API charges may still accrue while off") and delete caveat ("cannot be undone unless a snapshot was separately retained") disappear from the message body entirely, and only ever surface in the confirm dialog at the moment of clicking.** An owner who reads the body and declines/ignores without ever opening the confirm dialog never sees either caveat. → Mitigation: this is an accepted trade-off, not an oversight - the same information is already absent from today's confirm-dialog short forms, so this change doesn't reduce total information available at the point where a decision is actually recorded, it removes an upfront duplicate. A follow-up could reintroduce either caveat into the confirm dialog text specifically if that's found to matter in practice.
- **[Risk] A shorter body gives an owner less to go on before clicking anything, which could increase mis-click-adjacent confusion.** → Mitigation: the confirmation dialog remains the actual safety gate (per the existing "Destructive asks require an explicit confirmation gesture" requirement) and is unchanged by this proposal - only the upfront, non-gating explanation shrinks.

## Migration Plan

Pure copy/logic change confined to `src/lib/slack.ts` (`ACTION_EXPLANATIONS`, `ACTION_CONFIRM_SUMMARY`, `describeNoResponseConsequence`, `buildConsentMessage`'s `text` construction). No persisted data shape changes, no settings changes, nothing to backfill. Rollback is reverting the file.
