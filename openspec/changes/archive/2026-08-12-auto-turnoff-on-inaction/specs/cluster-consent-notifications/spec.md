## ADDED Requirements

### Requirement: Auto-turn-off-on-inaction is configurable per tier
The system SHALL allow each notification-eligible tier (Stale, Forgotten) to independently enable "auto turn off on inaction," and, only when enabled, to configure a maximum number of snoozes for that tier. When disabled (the default), a request expiring or an owner snoozing repeatedly SHALL behave exactly as if this capability did not exist - no automatic action of any kind.

#### Scenario: Operator enables auto-turn-off for a tier
- **WHEN** an operator enables auto-turn-off-on-inaction and sets a maximum snooze count for the "Forgotten" tier
- **THEN** subsequent requests for clusters in that tier are subject to automatic turn-off per the requirements below

#### Scenario: Auto-turn-off left disabled
- **WHEN** a tier's auto-turn-off-on-inaction is disabled
- **THEN** requests for clusters in that tier expire or snooze without limit exactly as before this capability existed

### Requirement: Expiry with auto-turn-off enabled results in an automatic turn-off decision
The system SHALL, when a tier's auto-turn-off-on-inaction is enabled and that tier's ask-to-turn-off option is enabled and the cluster's current operational state is not already turned off, record an approved-turnoff decision - instead of marking the request expired with no action - the moment a pending request reaches that tier's configured expiry period with no owner response. The system SHALL notify the cluster's owner that the turn-off was triggered automatically due to no response.

#### Scenario: Request expires with auto-turn-off eligible
- **WHEN** a pending request for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled reaches its configured expiry period with no decision, and the cluster is currently running
- **THEN** an approved-turnoff decision is recorded for the cluster and its owner is notified that it happened automatically because there was no response

#### Scenario: Expiry with ask-to-turn-off disabled for the tier
- **WHEN** a pending request expires with auto-turn-off-on-inaction enabled but that tier's ask-to-turn-off option disabled
- **THEN** the request is marked expired with no action taken, exactly as it would be without this capability

#### Scenario: Expiry when the cluster is already turned off
- **WHEN** a pending request expires with auto-turn-off eligible but the cluster's current operational state is already turned off
- **THEN** the request is marked expired with no action taken, since there is nothing left to turn off, and no automatic-turn-off notification is sent

### Requirement: Exhausting the snooze cap triggers the same automatic outcome as expiry
The system SHALL maintain, per cluster, a count of snooze decisions recorded that persists across a snoozed cycle resuming (per "A snoozed request resumes after its snooze period, even without a tier change") and resets only when the cluster's age-status tier changes. When a tier's auto-turn-off-on-inaction is enabled, the system SHALL refuse a snooze attempt that would exceed that tier's configured maximum snoozes at the moment of the attempt - without recording a new snooze or opening the snooze dialog - and SHALL instead apply the same automatic-turnoff decision and owner notification described for expiry, subject to the same ask-to-turn-off and already-off conditions.

#### Scenario: Owner attempts to snooze at the cap
- **WHEN** an owner attempts to snooze a cluster whose tier has auto-turn-off-on-inaction enabled and whose snooze count already equals that tier's configured maximum
- **THEN** the attempt is refused, no snooze is recorded, and an approved-turnoff decision is recorded and the owner notified instead, subject to the ask-to-turn-off and already-off conditions

#### Scenario: Owner snoozes below the cap
- **WHEN** an owner snoozes a cluster whose snooze count is below that tier's configured maximum
- **THEN** the snooze is recorded as normal and the count increments by one

#### Scenario: Snooze count survives a resumed cycle
- **WHEN** a cluster's snooze period elapses, its request resumes per the existing resume behavior, and the owner goes on to snooze again
- **THEN** the snooze count carries over from before the resumption rather than resetting, so the configured maximum is still enforced across the resumption

#### Scenario: Snooze count resets on tier transition
- **WHEN** a cluster's age-status tier changes
- **THEN** its snooze count resets to zero along with the rest of its consent cycle

### Requirement: Snooze confirmation states remaining snooze allowance
When a cluster's tier has auto-turn-off-on-inaction enabled, the system SHALL state, in the confirmation shown after a successful snooze, how many further snoozes remain before an automatic turn-off.

#### Scenario: Snooze confirmation with allowance remaining
- **WHEN** an owner successfully snoozes a cluster in a tier with auto-turn-off-on-inaction enabled and a configured maximum of 3, having snoozed once before
- **THEN** the confirmation states that 1 snooze remains

## MODIFIED Requirements

### Requirement: Per-tier notification configuration, excluding "In Use"
The system SHALL allow each age-status tier except "In Use" (that is: Stale and Forgotten) to be independently configured with a notify toggle, an ask-to-turn-off toggle, an ask-to-delete toggle, an auto-turn-off-on-inaction toggle, and - only meaningful while that toggle is on - a maximum snooze count. The system SHALL NOT offer any notification configuration for "In Use", and SHALL NOT automatically send a notification, nor apply auto-turn-off-on-inaction, for a cluster while it is classified "In Use" regardless of any other setting. This automatic exclusion does not apply to a manually-triggered request - see "Manual consent requests are always available" below.

#### Scenario: Tier configured to notify with both asks
- **WHEN** an operator enables notify, ask-to-turn-off, and ask-to-delete for the "Forgotten" tier
- **THEN** a cluster transitioning into "Forgotten" triggers a notification offering both turn-off and delete consent options

#### Scenario: Tier configured to notify without any ask
- **WHEN** an operator enables notify but leaves ask-to-turn-off and ask-to-delete disabled for a tier
- **THEN** a cluster transitioning into that tier triggers a notification with no turn-off or delete option (a snooze option is still offered - see below)

#### Scenario: In Use is never automatically notification-eligible
- **WHEN** a cluster's age status is "In Use"
- **THEN** no automatic notification is sent for it, no per-tier configuration exists for "In Use" in settings, and auto-turn-off-on-inaction never applies to it

#### Scenario: Auto-turn-off-on-inaction and its snooze cap are configured together
- **WHEN** an operator enables auto-turn-off-on-inaction for a tier
- **THEN** that tier also exposes a configurable maximum snooze count, defaulting to 3

### Requirement: The notification states the consequence of no response
Every consent notification SHALL state what happens if the owner does not respond: the configured maximum number of reminders, the configured expiry period, and the real configured consequence of expiry for that tier - either that the cluster will be turned off automatically (when auto-turn-off-on-inaction and ask-to-turn-off are both enabled for that tier and the cluster is currently running), or that no action is taken automatically (otherwise). When auto-turn-off-on-inaction is enabled for the tier, the notification SHALL additionally state the configured maximum number of snoozes. For a cluster in the "Forgotten" tier, the notification SHALL additionally state that the cluster has already exceeded the configured Forgotten grace period.

#### Scenario: Standard no-response notice, auto-turn-off disabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction disabled
- **THEN** the notification states the reminder count, the expiry period, and that expiry results in no automatic action

#### Scenario: No-response notice with auto-turn-off enabled
- **WHEN** a consent notification is sent for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled, for a cluster that is currently running
- **THEN** the notification states the reminder count, the expiry period, that the cluster will be turned off automatically if there is no response, and the configured maximum number of snoozes

#### Scenario: Forgotten-tier no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Forgotten" tier
- **THEN** the notification additionally states that the cluster has already exceeded the configured Forgotten grace period
