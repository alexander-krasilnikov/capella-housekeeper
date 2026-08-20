# cluster-consent-notifications Specification

## Purpose
Detects recency tier transitions worth acting on, asks the cluster's derived owner for consent to turn off or delete it via a Slack direct message, and tracks that consent - including a snooze option - through its pending, reminder, expiry, and decision lifecycle.
## Requirements
### Requirement: Notification fires on tier transition, not on every sync
The system SHALL send a notification only when a cluster's computed recency changes to a tier configured to notify, compared to the tier last observed for that cluster - not on every sync cycle a cluster spends within that tier.

#### Scenario: Repeated sync cycles in the same tier
- **WHEN** a cluster remains in "Old" across multiple consecutive sync cycles with no tier change
- **THEN** no additional notification is sent for those cycles

#### Scenario: Transition into a watched tier
- **WHEN** a cluster's recency changes from "Aging" to "Old" and "Old" is configured to notify
- **THEN** a notification is sent

### Requirement: Notification recipient is the cluster's derived owner
The system SHALL resolve the Slack recipient for a cluster's notification from its derived owner, and SHALL skip the notification entirely, with no fallback recipient, if the derived owner is absent or is not in email form.

#### Scenario: Owner resolves to an email
- **WHEN** a cluster's derived owner is an email address
- **THEN** the system looks up the corresponding Slack user and sends the notification as a direct message

#### Scenario: Owner is not email-shaped
- **WHEN** a cluster's derived owner is a raw identifier rather than an email address
- **THEN** no notification is sent for that cluster's transition

#### Scenario: Owner is absent
- **WHEN** a cluster has no derived owner
- **THEN** no notification is sent for that cluster's transition

### Requirement: Consent capture via real Slack interaction over a self-initiated connection
The system SHALL capture consent decisions through genuine Slack button interactions delivered over a connection this system itself initiates outward to Slack, and SHALL NOT expose any publicly-reachable inbound endpoint for Slack to call into.

#### Scenario: Consent buttons identify the request unambiguously
- **WHEN** a consent notification is sent
- **THEN** each offered option is represented by a distinct button encoding the specific cluster and action, meaningful only for that request

#### Scenario: No inbound endpoint is exposed
- **WHEN** the system is deployed and running
- **THEN** receiving a consent decision does not require any inbound HTTP endpoint reachable by Slack's infrastructure

### Requirement: Turn-off is not offered when the cluster is already off
The system SHALL omit the turn-off option from a consent notification when the cluster's current operational state (independent of its recency tier) indicates that turning it off would be redundant - either because it is already off, or because a turn-off is already in progress - even if the tier is configured to ask for turn-off.

A state indicating that a previous turn-off attempt *failed* SHALL NOT be treated as already off. Such a cluster is still running and still incurring cost, so it remains eligible to be asked about and eligible for any automatic action its tier is configured for. This distinction SHALL be drawn from the same classification of Capella's own operational states that the dashboard's status badge uses, rather than from the wording of a status's display label.

#### Scenario: Cluster already turned off
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state is already "turned off"
- **THEN** the notification does not include a turn-off option

#### Scenario: Turn-off already in progress
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state indicates a turn-off is already underway
- **THEN** the notification does not include a turn-off option, since the action being asked for is already happening

#### Scenario: A previous turn-off failed
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state indicates a previous turn-off attempt failed
- **THEN** the notification does include a turn-off option, because the cluster is still running

#### Scenario: Cluster running
- **WHEN** a tier configured to ask for turn-off is entered by a cluster that is currently running
- **THEN** the notification includes a turn-off option

### Requirement: Destructive asks require an explicit confirmation gesture
The system SHALL require an additional explicit confirmation gesture, distinct from the initial button click, before recording a turn-off or delete decision.

#### Scenario: Mis-click on a destructive ask
- **WHEN** an owner clicks turn-off or delete but does not complete the follow-up confirmation gesture
- **THEN** no consent decision is recorded and the request remains pending

#### Scenario: Owner confirms a destructive decision
- **WHEN** the owner clicks turn-off or delete and completes the follow-up confirmation gesture
- **THEN** the corresponding decision (approve turn-off or approve delete) is recorded for that cluster

### Requirement: Snooze delays a request and requires a justification
The system SHALL offer a snooze option on every consent notification it sends, independent of the tier's turn-off/delete configuration, letting the owner choose a delay from an operator-configured list of durations (in days) - see "Snooze duration options are configurable" below. The system SHALL require a non-empty justification before recording a snooze decision, and SHALL persist that justification for display in the dashboard.

#### Scenario: Owner snoozes with a justification
- **WHEN** the owner chooses a snooze duration and provides a justification
- **THEN** the snooze decision is recorded with the chosen duration and the justification is persisted and visible in the dashboard

#### Scenario: Owner attempts to snooze without a justification
- **WHEN** the owner attempts to submit a snooze without providing a justification
- **THEN** the snooze is not recorded and the request remains pending

### Requirement: Snooze duration options are configurable
The system SHALL let an operator configure the list of snooze durations (in days) offered to owners, as a non-empty set of distinct positive whole numbers, from the settings page. The system SHALL default to offering 1, 2, and 3 days when unset.

#### Scenario: Operator changes the offered durations
- **WHEN** an operator sets the snooze duration options to a different list of days and saves
- **THEN** subsequent snooze prompts offer exactly that list of durations

#### Scenario: Operator submits an invalid list
- **WHEN** an operator submits a snooze duration list that is empty or contains no valid positive whole numbers
- **THEN** the update is rejected and the previously configured durations remain in effect

### Requirement: A snoozed request resumes after its snooze period, even without a tier change
The system SHALL re-send a fresh consent request once a snoozed cluster's snooze period ends, if the cluster's current tier is still configured to notify, even though the recency tier itself has not changed since the snooze was granted.

#### Scenario: Snooze ends with the tier unchanged and still configured to notify
- **WHEN** a cluster's snooze period elapses and its current tier is still configured to notify
- **THEN** a fresh consent request is sent and the consent cycle resets to pending

#### Scenario: Snooze ends but the tier is no longer configured to notify
- **WHEN** a cluster's snooze period elapses and its current tier's notify setting has since been turned off
- **THEN** no new request is sent and the cluster's consent state resets to no active cycle

### Requirement: Consent lifecycle - reminders and expiry
The system SHALL track each pending consent request's age, SHALL resend the notification as a reminder up to a configured maximum number of times while the request remains pending, and SHALL mark the request expired once a configured expiry period elapses without a decision.

#### Scenario: Reminder sent while pending
- **WHEN** a consent request has received no decision and has been resent fewer times than the configured reminder maximum
- **THEN** the system resends the notification as a reminder

#### Scenario: Request expires
- **WHEN** a consent request has received no decision and the configured expiry period has elapsed
- **THEN** the request is marked expired and no further reminders are sent for it

### Requirement: The notification states the consequence of no response
Every consent notification SHALL state what happens if the owner does not respond: the configured maximum number of reminders, the configured expiry period, and the real configured consequence of expiry for that tier - either that the cluster will be turned off automatically (when auto-turn-off-on-inaction and ask-to-turn-off are both enabled for that tier and the cluster is currently running), or that no action is taken automatically (otherwise). When auto-turn-off-on-inaction is enabled for the tier, the notification SHALL additionally state the configured maximum number of snoozes. For a cluster in the "Old" tier, the notification SHALL additionally state that the cluster has already exceeded the configured Old grace period.

#### Scenario: Standard no-response notice, auto-turn-off disabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction disabled
- **THEN** the notification states the reminder count, the expiry period, and that expiry results in no automatic action

#### Scenario: No-response notice with auto-turn-off enabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled, for a cluster that is currently running
- **THEN** the notification states the reminder count, the expiry period, that the cluster will be turned off automatically if there is no response, and the configured maximum number of snoozes

#### Scenario: Old-tier no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Old" tier
- **THEN** the notification additionally states that the cluster has already exceeded the configured Old grace period

### Requirement: Terminal consent outcomes hold until the next tier transition
The system SHALL leave a cluster's consent outcome (approved-turnoff, approved-delete, or expired) unchanged and SHALL NOT send a new notification for that cluster until its recency transitions to a different tier, at which point the consent cycle resets and a fresh notification may be sent per the tier's configuration. A snoozed outcome instead resets when its own snooze period elapses, per the requirement above, independent of any tier transition.

#### Scenario: Expired outcome holds until a new transition
- **WHEN** a request expires and the cluster's recency has not changed since
- **THEN** no further notification is sent for that cluster

#### Scenario: Recovery resets the cycle
- **WHEN** a cluster with an approved or expired consent outcome transitions to a different recency tier
- **THEN** its consent state resets and a new notification may be sent according to that tier's configuration

### Requirement: Per-tier notification configuration, excluding "Fresh"
The system SHALL allow each recency tier except "Fresh" (that is: Aging and Old) to be independently configured with a notify toggle, an ask-to-turn-off toggle, an ask-to-delete toggle, an auto-turn-off-on-inaction toggle, and - only meaningful while that toggle is on - a maximum snooze count. The system SHALL NOT offer any notification configuration for "Fresh", and SHALL NOT automatically send a notification, nor apply auto-turn-off-on-inaction, for a cluster while it is classified "Fresh" regardless of any other setting. This automatic exclusion does not apply to a manually-triggered request - see "Manual consent requests are always available" below.

#### Scenario: Tier configured to notify with both asks
- **WHEN** an operator enables notify, ask-to-turn-off, and ask-to-delete for the "Old" tier
- **THEN** a cluster transitioning into "Old" triggers a notification offering both turn-off and delete consent options

#### Scenario: Tier configured to notify without any ask
- **WHEN** an operator enables notify but leaves ask-to-turn-off and ask-to-delete disabled for a tier
- **THEN** a cluster transitioning into that tier triggers a notification with no turn-off or delete option (a snooze option is still offered - see below)

#### Scenario: Fresh is never automatically notification-eligible
- **WHEN** a cluster's recency is "Fresh"
- **THEN** no automatic notification is sent for it, no per-tier configuration exists for "Fresh" in settings, and auto-turn-off-on-inaction never applies to it

#### Scenario: Auto-turn-off-on-inaction and its snooze cap are configured together
- **WHEN** an operator enables auto-turn-off-on-inaction for a tier
- **THEN** that tier also exposes a configurable maximum snooze count, defaulting to 3

### Requirement: Auto-turn-off-on-inaction is configurable per tier
The system SHALL allow each notification-eligible tier (Aging, Old) to independently enable "auto turn off on inaction," and, only when enabled, to configure a maximum number of snoozes for that tier. When disabled (the default), a request expiring or an owner snoozing repeatedly SHALL behave exactly as if this capability did not exist - no automatic action of any kind.

#### Scenario: Operator enables auto-turn-off for a tier
- **WHEN** an operator enables auto-turn-off-on-inaction and sets a maximum snooze count for the "Old" tier
- **THEN** subsequent requests for clusters in that tier are subject to automatic turn-off per the requirements below

#### Scenario: Auto-turn-off left disabled
- **WHEN** a tier's auto-turn-off-on-inaction is disabled
- **THEN** requests for clusters in that tier expire or snooze without limit exactly as before this capability existed

### Requirement: Expiry with auto-turn-off enabled results in an automatic turn-off decision
The system SHALL, when a tier's auto-turn-off-on-inaction is enabled and that tier's ask-to-turn-off option is enabled and turning the cluster off would not be redundant (per "Turn-off is not offered when the cluster is already off"), record an approved-turnoff decision - instead of marking the request expired with no action - the moment a pending request reaches that tier's configured expiry period with no owner response. The system SHALL notify the cluster's owner that the turn-off was triggered automatically due to no response, and SHALL persist, on the cluster record, an explanation of why the decision was made automatically, for display in the dashboard and audit log.

#### Scenario: Request expires with auto-turn-off eligible
- **WHEN** a pending request for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled reaches its configured expiry period with no decision, and the cluster is currently running
- **THEN** an approved-turnoff decision is recorded for the cluster, its owner is notified that it happened automatically because there was no response, and the cluster record persists an explanation stating that no response was received within the configured window

#### Scenario: Expiry with ask-to-turn-off disabled for the tier
- **WHEN** a pending request expires with auto-turn-off-on-inaction enabled but that tier's ask-to-turn-off option disabled
- **THEN** the request is marked expired with no action taken, exactly as it would be without this capability

#### Scenario: Expiry when the cluster is already turned off
- **WHEN** a pending request expires with auto-turn-off eligible but the cluster's current operational state is already turned off
- **THEN** the request is marked expired with no action taken, since there is nothing left to turn off, and no automatic-turn-off notification is sent

#### Scenario: Expiry after a previous turn-off failed
- **WHEN** a pending request expires with auto-turn-off eligible for a cluster whose previous turn-off attempt failed
- **THEN** an automatic turn-off decision is recorded, because the cluster is still running and the earlier failure must not exempt it permanently

### Requirement: Exhausting the snooze cap triggers the same automatic outcome as expiry
The system SHALL maintain, per cluster, a count of snooze decisions recorded that persists across a snoozed cycle resuming (per "A snoozed request resumes after its snooze period, even without a tier change") and resets only when the cluster's recency tier changes. When a tier's auto-turn-off-on-inaction is enabled, the system SHALL refuse a snooze attempt that would exceed that tier's configured maximum snoozes at the moment of the attempt - without recording a new snooze or opening the snooze dialog - and SHALL instead apply the same automatic-turnoff decision and owner notification described for expiry, subject to the same ask-to-turn-off and already-off conditions, persisting on the cluster record an explanation that the maximum snooze count was reached.

#### Scenario: Owner attempts to snooze at the cap
- **WHEN** an owner attempts to snooze a cluster whose tier has auto-turn-off-on-inaction enabled and whose snooze count already equals that tier's configured maximum
- **THEN** the attempt is refused, no snooze is recorded, an approved-turnoff decision is recorded and the owner notified instead (subject to the ask-to-turn-off and already-off conditions), and the cluster record persists an explanation stating the configured maximum snooze count was reached

#### Scenario: Owner snoozes below the cap
- **WHEN** an owner snoozes a cluster whose snooze count is below that tier's configured maximum
- **THEN** the snooze is recorded as normal and the count increments by one

#### Scenario: Snooze count survives a resumed cycle
- **WHEN** a cluster's snooze period elapses, its request resumes per the existing resume behavior, and the owner goes on to snooze again
- **THEN** the snooze count carries over from before the resumption rather than resetting, so the configured maximum is still enforced across the resumption

#### Scenario: Snooze count resets on tier transition
- **WHEN** a cluster's recency tier changes
- **THEN** its snooze count resets to zero along with the rest of its consent cycle

### Requirement: Snooze confirmation states remaining snooze allowance
When a cluster's tier has auto-turn-off-on-inaction enabled, the system SHALL state, in the confirmation shown after a successful snooze, how many further snoozes remain before an automatic turn-off.

#### Scenario: Snooze confirmation with allowance remaining
- **WHEN** an owner successfully snoozes a cluster in a tier with auto-turn-off-on-inaction enabled and a configured maximum of 3, having snoozed once before
- **THEN** the confirmation states that 1 snooze remains

### Requirement: Manual consent requests are always available
The system SHALL let an operator manually send a consent request for any cluster regardless of its current recency tier, including "Fresh". A manual request for a cluster classified "Fresh" SHALL offer both turn-off and delete consent options, since no per-tier configuration exists for that tier to derive them from. Once sent, a manually-triggered request follows the same pending/reminder/expiry lifecycle as any other, regardless of tier.

#### Scenario: Manually requesting consent for a Fresh cluster
- **WHEN** an operator manually triggers a consent request for a cluster currently classified "Fresh"
- **THEN** the request is sent, offering both turn-off and delete options alongside snooze

#### Scenario: A manually-sent Fresh request still reaches expiry
- **WHEN** a manually-sent consent request for a cluster classified "Fresh" goes unanswered
- **THEN** it receives reminders and eventually expires on the same schedule as any other pending request

### Requirement: Manual consent request control disabled without an eligible owner

The system SHALL disable the manual consent-request (Ask) control for a cluster whose derived owner is absent or not email-shaped, rather than leaving it clickable and only reporting failure after activation.

#### Scenario: Owner is not email-shaped

- **WHEN** a cluster's derived owner is a raw identifier rather than an email address
- **THEN** the manual consent-request control for that cluster is shown disabled

#### Scenario: Owner is absent

- **WHEN** a cluster has no derived owner
- **THEN** the manual consent-request control for that cluster is shown disabled

#### Scenario: Owner is email-shaped

- **WHEN** a cluster's derived owner is an email address
- **THEN** the manual consent-request control for that cluster is enabled

### Requirement: Notification body states only a brief summary of each offered action
The system SHALL state, for each offered action in a consent notification's body, only a one-line summary of what that action does. For turn-off and delete specifically, the system SHALL NOT restate their full explanatory detail in the message body; that full detail SHALL appear only in the confirmation dialog required before the corresponding decision is recorded.

#### Scenario: Message body shows a one-line summary per offered action
- **WHEN** a consent notification is sent
- **THEN** each offered action's line in the message body states only a brief, one-line summary of what that action does

#### Scenario: Full explanation appears only at the confirmation step
- **WHEN** turn off or delete is offered on a consent notification
- **THEN** the full explanatory detail for that action appears in its confirmation dialog and is not duplicated in the message body

### Requirement: Consent status change is timestamped independent of cycle-start timing
The system SHALL record, on the cluster record, when its consent status most recently changed, updated on every consent-status transition (including entering or resuming a snooze, an approval, an expiry, or a reset to no active cycle). This timestamp SHALL be tracked independently of the pending-cycle-start timestamp that governs reminder and expiry timing, and SHALL NOT alter that timing.

#### Scenario: Consent status changes
- **WHEN** a cluster's consent status transitions to a new value for any reason (owner decision, automatic decision, tier-change reset, or snooze resume)
- **THEN** the cluster record's consent-status-changed timestamp is updated to the moment of that transition

#### Scenario: Reminder and expiry timing is unaffected
- **WHEN** a reminder is sent or an expiry check runs for a pending request
- **THEN** that timing continues to be computed from the existing pending-cycle-start timestamp, unaffected by the consent-status-changed timestamp

### Requirement: A notification remains deliverable regardless of cluster name length
Every consent notification SHALL be constructed so that it stays within the messaging platform's payload limits for any cluster name, however long. Where a limit would otherwise be exceeded, the cluster name SHALL be shortened - with a visible indication that it was shortened - in preference to omitting or truncating the explanation of what the action does.

This exists because an over-long payload is rejected wholesale, and that rejection is indistinguishable from the owner being unreachable: the operator sees only that the notification was not delivered, with nothing pointing at the name as the cause.

#### Scenario: Cluster with an unusually long name
- **WHEN** a consent notification is built for a cluster whose name is long enough that including it in full would exceed a payload limit
- **THEN** the notification is still valid and deliverable, the name appears shortened with an indication that it was shortened, and the explanation of each offered action remains complete

#### Scenario: Cluster with an ordinary name
- **WHEN** a consent notification is built for a cluster whose name is short enough to fit
- **THEN** the name appears in full, with no indication of shortening

