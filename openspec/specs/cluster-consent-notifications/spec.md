# cluster-consent-notifications Specification

## Purpose
Detects age-status tier transitions worth acting on, asks the cluster's derived owner for consent to turn off or delete it via a Slack direct message, and tracks that consent - including a snooze option - through its pending, reminder, expiry, and decision lifecycle.
## Requirements
### Requirement: Notification fires on tier transition, not on every sync
The system SHALL send a notification only when a cluster's computed age status changes to a tier configured to notify, compared to the tier last observed for that cluster - not on every sync cycle a cluster spends within that tier.

#### Scenario: Repeated sync cycles in the same tier
- **WHEN** a cluster remains in "Forgotten" across multiple consecutive sync cycles with no tier change
- **THEN** no additional notification is sent for those cycles

#### Scenario: Transition into a watched tier
- **WHEN** a cluster's age status changes from "Stale" to "Forgotten" and "Forgotten" is configured to notify
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
The system SHALL omit the turn-off option from a consent notification when the cluster's current operational state (independent of its age-status tier) indicates it is already turned off, even if the tier is configured to ask for turn-off.

#### Scenario: Cluster already turned off
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state is already "turned off"
- **THEN** the notification does not include a turn-off option

#### Scenario: Cluster running
- **WHEN** a tier configured to ask for turn-off is entered by a cluster that is currently running
- **THEN** the notification includes the turn-off option

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
The system SHALL re-send a fresh consent request once a snoozed cluster's snooze period ends, if the cluster's current tier is still configured to notify, even though the age-status tier itself has not changed since the snooze was granted.

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
Every consent notification SHALL state what happens if the owner does not respond: the configured maximum number of reminders, the configured expiry period, and that no action is taken automatically once the request expires. For a cluster in the "Forgotten" tier, the notification SHALL additionally state that the cluster has already exceeded the configured Forgotten grace period.

#### Scenario: Standard no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Stale" tier
- **THEN** the notification states the reminder count, the expiry period, and that expiry results in no automatic action

#### Scenario: Forgotten-tier no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Forgotten" tier
- **THEN** the notification additionally states that the cluster has already exceeded the configured Forgotten grace period

### Requirement: Terminal consent outcomes hold until the next tier transition
The system SHALL leave a cluster's consent outcome (approved-turnoff, approved-delete, or expired) unchanged and SHALL NOT send a new notification for that cluster until its age status transitions to a different tier, at which point the consent cycle resets and a fresh notification may be sent per the tier's configuration. A snoozed outcome instead resets when its own snooze period elapses, per the requirement above, independent of any tier transition.

#### Scenario: Expired outcome holds until a new transition
- **WHEN** a request expires and the cluster's age status has not changed since
- **THEN** no further notification is sent for that cluster

#### Scenario: Recovery resets the cycle
- **WHEN** a cluster with an approved or expired consent outcome transitions to a different age-status tier
- **THEN** its consent state resets and a new notification may be sent according to that tier's configuration

### Requirement: Per-tier notification configuration, excluding "In Use"
The system SHALL allow each age-status tier except "In Use" (that is: Stale and Forgotten) to be independently configured with a notify toggle, an ask-to-turn-off toggle, and an ask-to-delete toggle. The system SHALL NOT offer any notification configuration for "In Use", and SHALL NOT automatically send a notification for a cluster while it is classified "In Use" regardless of any other setting. This automatic exclusion does not apply to a manually-triggered request - see "Manual consent requests are always available" below.

#### Scenario: Tier configured to notify with both asks
- **WHEN** an operator enables notify, ask-to-turn-off, and ask-to-delete for the "Forgotten" tier
- **THEN** a cluster transitioning into "Forgotten" triggers a notification offering both turn-off and delete consent options

#### Scenario: Tier configured to notify without any ask
- **WHEN** an operator enables notify but leaves ask-to-turn-off and ask-to-delete disabled for a tier
- **THEN** a cluster transitioning into that tier triggers a notification with no turn-off or delete option (a snooze option is still offered - see below)

#### Scenario: In Use is never automatically notification-eligible
- **WHEN** a cluster's age status is "In Use"
- **THEN** no automatic notification is sent for it, and no per-tier configuration exists for "In Use" in settings

### Requirement: Manual consent requests are always available
The system SHALL let an operator manually send a consent request for any cluster regardless of its current age-status tier, including "In Use". A manual request for a cluster classified "In Use" SHALL offer both turn-off and delete consent options, since no per-tier configuration exists for that tier to derive them from. Once sent, a manually-triggered request follows the same pending/reminder/expiry lifecycle as any other, regardless of tier.

#### Scenario: Manually requesting consent for an In Use cluster
- **WHEN** an operator manually triggers a consent request for a cluster currently classified "In Use"
- **THEN** the request is sent, offering both turn-off and delete options alongside snooze

#### Scenario: A manually-sent In Use request still reaches expiry
- **WHEN** a manually-sent consent request for a cluster classified "In Use" goes unanswered
- **THEN** it receives reminders and eventually expires on the same schedule as any other pending request

### Requirement: Notification body states only a brief summary of each offered action
The system SHALL state, for each offered action in a consent notification's body, only a one-line summary of what that action does. For turn-off and delete specifically, the system SHALL NOT restate their full explanatory detail in the message body; that full detail SHALL appear only in the confirmation dialog required before the corresponding decision is recorded.

#### Scenario: Message body shows a one-line summary per offered action
- **WHEN** a consent notification is sent
- **THEN** each offered action's line in the message body states only a brief, one-line summary of what that action does

#### Scenario: Full explanation appears only at the confirmation step
- **WHEN** turn off or delete is offered on a consent notification
- **THEN** the full explanatory detail for that action appears in its confirmation dialog and is not duplicated in the message body

