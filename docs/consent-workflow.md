# The consent workflow

This is the part of Capella Housekeeper that can stop or delete a cluster.
Read it before enabling any of it.

Nothing here is on by default. A fresh installation notifies nobody and acts
on nothing, and stays that way until someone turns a setting on.

## Recency: how a cluster becomes a candidate

Every cluster is continuously placed in one of three tiers. This is a
different axis from the cluster's operational status in Capella - a cluster
can be `Old` and still running, still billing.

```
                    Is there recent evidence of use?
                                 │
                ┌────────────────┴────────────────┐
               yes                                no
                │                                  │
             ┌──────┐               How old is the cluster itself?
             │Fresh │                              │
             └──────┘               ┌──────────────┴──────────────┐
          never notified       younger than                    older
                               forgottenHours                     │
                                    │                             │
                                ┌───────┐                     ┌─────┐
                                │Aging  │                     │ Old │
                                └───────┘                     └─────┘
```

Two settings decide this, both under **Settings** → **Recency thresholds**:

| Setting | Default | Meaning |
|---|---|---|
| `activityGraceHours` | 24 | How recent the last known activity must be to hold a cluster at `Fresh` |
| `forgottenHours` | 72 | How old a cluster with no recent activity must be to escalate from `Aging` to `Old` |

<!-- default: activityGraceHours = 24 -->
<!-- default: forgottenHours = 72 -->

Two details are worth internalising, because they explain most surprising
tier placements:

- **`Aging` and `Old` are separated by the cluster's age since creation**, not
  by how long ago it was last used. Once a cluster loses `Fresh`, what
  distinguishes the two lower tiers is how long the cluster has existed.
- **A cluster whose activity cannot be observed at all is tiered purely on
  age.** Unknown activity is ignored rather than treated as evidence of use,
  so an unobservable cluster is not held at `Fresh` by its own opacity.

`Fresh` is never eligible for automatic notification - there is nothing to ask
about a cluster with evidence of active use - so it has no tier settings at
all, rather than settings defaulted to off.

## What triggers a message

**A notification fires when a cluster changes tier, not on every sync.** A
cluster sitting at `Old` for a month generates one ask, not one per sync
cycle. The transition itself is the event.

When a cluster changes tier, any consent cycle already in flight is abandoned
- its live Slack message is edited to say it is no longer current - and the
slate is wiped: reminder count, prior decision, snooze count, all reset. Then,
if the new tier is configured to notify, a fresh ask goes out.

Per tier (`Aging` and `Old` each configured separately, under **Settings** →
**Slack notifications**):

| Setting | Default | Effect |
|---|---|---|
| `notify` | off | Whether entering this tier sends anything at all |
| `askTurnOff` | off | Offer the owner a **Turn off** button |
| `askDelete` | off | Offer the owner a **Delete** button |
| `autoTurnOffOnInaction` | off | **Turn the cluster off even without an answer.** See below |
| `maxSnoozes` | 3 | Snoozes allowed before auto turn-off fires early |

<!-- default: maxSnoozes = 3 -->

## What the owner receives

A direct message naming the cluster, its organization and project, its current
operational state, its tier, and what is known about its last activity. Below
that, a plain-language line per available option, and a statement of what
happens if they do nothing.

The buttons are **Turn off**, **Delete**, and **Snooze** - whichever asks the
tier is configured for, plus Snooze always. There is no "decline" button:
declining is expressed by snoozing, which requires a reason and therefore
leaves a record, rather than by silence.

- **Turn off** and **Delete** open a confirmation dialog first. A single
  mis-click cannot destroy anything.
- **Snooze** opens a modal asking for a duration (chosen from
  `snoozeDayOptions`, default 1, 2, or 3 days) <!-- default: snoozeDayOptions = 1,2,3 --> and **a reason, which is
  required**. The reason appears in the dashboard against that cluster, so
  whoever reviews it later sees why it was deferred.

If the owner's email cannot be resolved to a Slack account, that cluster is
skipped silently - see
[the failure modes](slack-setup.md#failure-modes-worth-knowing-about).

## The lifecycle, end to end

```
      tier transition
            │
            ▼
      ┌───────────┐   reminders, evenly spaced across the expiry window
      │  pending  │───────────────────────────────────────────┐
      └───────────┘                                          │
        │    │    │                                          ▼
        │    │    └──── Snooze ──▶ ┌─────────┐        (window elapses)
        │    │                     │ snoozed │              │
        │    │                     └─────────┘              │
        │    │                          │                   │
        │    │            snooze ends: asked again,          │
        │    │            from scratch, same tier            │
        │    │                          │                   │
        │    │                          ▼                   ▼
        │    │                 snooze cap reached?    autoTurnOffOnInaction?
        │    │                          │                   │
        │    │                     ┌────┴────┐         ┌────┴────┐
        │    │                    yes        no        yes       no
        │    │                     │          │         │         │
        │    │                     ▼          ▼         ▼         ▼
        │    │            ╔════════════════════════════════╗  ┌─────────┐
        │    └─ Delete ─▶ ║  approved-turnoff / -delete    ║  │ expired │
        │                 ╚════════════════════════════════╝  └─────────┘
        └────── Turn off ────────▶     │                       nothing done
                                       ▼
                            reconciliation re-verifies,
                              then acts on Capella
                                       │
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                   performed        skipped         failed
                                (recovered      (retried next
                                 in time)           pass)

        ║ double border ║ = a cluster is about to be stopped or destroyed
```

The two paths into that box that do **not** involve the owner pressing a
button are the ones to understand before enabling anything.

## The setting that acts without an answer

`autoTurnOffOnInaction`, off by default, per tier. Switching it on means:

> **A cluster can be turned off because its owner said nothing.**

Specifically, it fires in two situations:

1. **The request expires unanswered.** The owner never clicked anything, the
   window ran out, and the cluster is turned off as though they had approved
   it.
2. **The owner runs out of snoozes.** On the snooze attempt after
   `maxSnoozes` is reached, the snooze is refused and the turn-off happens
   immediately - not at the end of a further delay. The owner is told this in
   Slack when it happens.

With it off, an expired request simply ends: the cluster is marked `expired`,
the message says so, and nothing is done to the cluster.

It only ever turns clusters **off**, never deletes them, no matter how the
tier's asks are configured - deletion always requires a human pressing
Delete. It also requires that tier's `askTurnOff` to be on (it is the
inaction branch of a question actually asked), and it skips clusters already
off or already turning off.

Snooze counting deliberately survives a snooze ending: the allowance is per
tier, not per snooze. Three snoozes at `Old` means three in total while the
cluster stays `Old`, not three every time a snooze lapses. A genuine tier
change resets it, because that is a new question.

## Timing

| Setting | Default | Meaning |
|---|---|---|
| `consentExpiryDays` | 7 | How long a pending request stands before expiring |
| `consentReminderMax` | 2 | How many reminders are re-sent within that window |

<!-- default: consentExpiryDays = 7 -->
<!-- default: consentReminderMax = 2 -->

Reminders are spread evenly across the window rather than clustered at the
end: the interval is the expiry window divided by one more than the reminder
count. With the defaults, an unanswered request is nudged at roughly day 2.3
and day 4.7, and expires at day 7. Each reminder supersedes the previous
message rather than stacking, so the owner's DM history holds one live ask,
not four.

## After an approval

Approval records a decision; it does not act immediately. A separate
reconciliation loop runs **every 5 minutes** (deliberately not configurable,
and much shorter than the sync interval) and carries out approved decisions.

Immediately before acting, it re-checks that the cluster is still in the tier
it was in when consent was given. If it has since moved - somebody started
using it in the gap between approval and execution - the action is **skipped**
rather than performed, and the reason is recorded against the cluster.

Each pass ends in one of three outcomes, all visible in the dashboard and the
lifecycle history:

- **performed** - Capella accepted the call. The cluster's status is recorded
  as Capella's own in-progress state, not an assumed final one, since
  acceptance is not completion.
- **skipped** - re-verification found the cluster no longer warranted the
  action. Terminal for this cycle; the recorded note says why.
- **failed** - Capella rejected or errored. The error text is recorded, and
  the action is retried on a later pass rather than abandoned.

The owner's original message is edited in place with the outcome, so the
thread where they approved is where they learn what happened.

## Manual actions, outside all of this

An operator can act directly from a cluster's row, with no owner involvement
and no consent cycle - see the `manual-cluster-actions` spec for the full
contract. Confirmation friction is scaled to consequence:

| Action | Friction |
|---|---|
| **Turn off** | Confirmation dialog |
| **Delete** | Confirmation dialog **and** typing the cluster's name exactly |
| **Turn on** | Confirmation dialog. Hidden unless the developer option is enabled |

You can also send a consent request by hand to any cluster, including a
`Fresh` one. A manual send ignores the tier's `notify` toggle - clicking the
button is itself the decision to ask - and for a cluster with no notifiable
tier it offers both turn-off and delete, leaving the choice with the operator.

The "Turn on" control is a developer option, off by default, intended for
testing. The server refuses the call while it is off, so hiding the button is
not the only thing standing between a stray request and a running cluster.

## A conservative way to start

Enable in this order, pausing at each step until you have seen real messages:

1. `notify` on for `Old` only, with neither `askTurnOff` nor `askDelete`. Ask
   nothing, and see who gets contacted and whether the owners resolved are the
   right people.
2. Add `askTurnOff`. Owners can now consent to a stop; nothing happens without
   a click.
3. Add `askDelete` if you want it, and only then consider
   `autoTurnOffOnInaction` - the only setting on this page that acts on
   silence.

Leaving step 3 undone forever is a legitimate configuration, and the
`Aging` tier can stay silent indefinitely while `Old` does the work.
