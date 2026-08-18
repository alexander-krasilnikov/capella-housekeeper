## MODIFIED Requirements

### Requirement: Notification fires on tier transition, not on every sync
The system SHALL send a notification only when a cluster's computed recency changes to a tier configured to notify, compared to the tier last observed for that cluster - not on every sync cycle a cluster spends within that tier.

#### Scenario: Repeated sync cycles in the same tier
- **WHEN** a cluster remains in "Old" across multiple consecutive sync cycles with no tier change
- **THEN** no additional notification is sent for those cycles

#### Scenario: Transition into a watched tier
- **WHEN** a cluster's recency changes from "Aging" to "Old" and "Old" is configured to notify
- **THEN** a notification is sent

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

### Requirement: A snoozed request resumes after its snooze period, even without a tier change
The system SHALL re-send a fresh consent request once a snoozed cluster's snooze period ends, if the cluster's current tier is still configured to notify, even though the recency tier itself has not changed since the snooze was granted.

#### Scenario: Snooze ends with the tier unchanged and still configured to notify
- **WHEN** a cluster's snooze period elapses and its current tier is still configured to notify
- **THEN** a fresh consent request is sent and the consent cycle resets to pending

#### Scenario: Snooze ends but the tier is no longer configured to notify
- **WHEN** a cluster's snooze period elapses and its current tier's notify setting has since been turned off
- **THEN** no new request is sent and the cluster's consent state resets to no active cycle

### Requirement: The notification states the consequence of no response
Every consent notification SHALL state what happens if the owner does not respond: the configured maximum number of reminders, the configured expiry period, and the real configured consequence of expiry for that tier - either that the cluster will be turned off automatically (when auto-turn-off-on-inaction and ask-to-turn-off are both enabled for that tier and the cluster is currently running), or that no action is taken automatically (otherwise). When auto-turn-off-on-inaction is enabled for the tier, the notification SHALL additionally state the configured maximum number of snoozes. For a cluster in the "Old" tier, the notification SHALL additionally state that the cluster has already exceeded the configured Old grace period.

#### Scenario: Standard no-response notice, auto-turn-off disabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction disabled
- **THEN** the notification states the reminder count, the expiry period, and that expiry results in no automatic action

#### Scenario: No-response notice with auto-turn-off enabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled, for a cluster that is currently running
- **THEN** the notification states the reminder count, the expiry period, that the cluster will be turned off automatically if there is no response, and the configured maximum number of snoozes

#### Scenario: Forgotten-tier no-response notice
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

### Requirement: Per-tier notification configuration, excluding "In Use"
The system SHALL allow each recency tier except "Fresh" (that is: Aging and Old) to be independently configured with a notify toggle, an ask-to-turn-off toggle, an ask-to-delete toggle, an auto-turn-off-on-inaction toggle, and - only meaningful while that toggle is on - a maximum snooze count. The system SHALL NOT offer any notification configuration for "Fresh", and SHALL NOT automatically send a notification, nor apply auto-turn-off-on-inaction, for a cluster while it is classified "Fresh" regardless of any other setting. This automatic exclusion does not apply to a manually-triggered request - see "Manual consent requests are always available" below.

#### Scenario: Tier configured to notify with both asks
- **WHEN** an operator enables notify, ask-to-turn-off, and ask-to-delete for the "Old" tier
- **THEN** a cluster transitioning into "Old" triggers a notification offering both turn-off and delete consent options

#### Scenario: Tier configured to notify without any ask
- **WHEN** an operator enables notify but leaves ask-to-turn-off and ask-to-delete disabled for a tier
- **THEN** a cluster transitioning into that tier triggers a notification with no turn-off or delete option (a snooze option is still offered - see below)

#### Scenario: In Use is never automatically notification-eligible
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

### Requirement: Manual consent requests are always available
The system SHALL let an operator manually send a consent request for any cluster regardless of its current recency tier, including "Fresh". A manual request for a cluster classified "Fresh" SHALL offer both turn-off and delete consent options, since no per-tier configuration exists for that tier to derive them from. Once sent, a manually-triggered request follows the same pending/reminder/expiry lifecycle as any other, regardless of tier.

#### Scenario: Manually requesting consent for an In Use cluster
- **WHEN** an operator manually triggers a consent request for a cluster currently classified "Fresh"
- **THEN** the request is sent, offering both turn-off and delete options alongside snooze

#### Scenario: A manually-sent In Use request still reaches expiry
- **WHEN** a manually-sent consent request for a cluster classified "Fresh" goes unanswered
- **THEN** it receives reminders and eventually expires on the same schedule as any other pending request
