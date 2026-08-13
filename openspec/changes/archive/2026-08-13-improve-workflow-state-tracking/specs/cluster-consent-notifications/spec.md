## MODIFIED Requirements

### Requirement: Expiry with auto-turn-off enabled results in an automatic turn-off decision
The system SHALL, when a tier's auto-turn-off-on-inaction is enabled and that tier's ask-to-turn-off option is enabled and the cluster's current operational state is not already turned off, record an approved-turnoff decision - instead of marking the request expired with no action - the moment a pending request reaches that tier's configured expiry period with no owner response. The system SHALL notify the cluster's owner that the turn-off was triggered automatically due to no response, and SHALL persist, on the cluster record, an explanation of why the decision was made automatically, for display in the dashboard and audit log.

#### Scenario: Request expires with auto-turn-off eligible
- **WHEN** a pending request for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled reaches its configured expiry period with no decision, and the cluster is currently running
- **THEN** an approved-turnoff decision is recorded for the cluster, its owner is notified that it happened automatically because there was no response, and the cluster record persists an explanation stating that no response was received within the configured window

#### Scenario: Expiry with ask-to-turn-off disabled for the tier
- **WHEN** a pending request expires with auto-turn-off-on-inaction enabled but that tier's ask-to-turn-off option disabled
- **THEN** the request is marked expired with no action taken, exactly as it would be without this capability

#### Scenario: Expiry when the cluster is already turned off
- **WHEN** a pending request expires with auto-turn-off eligible but the cluster's current operational state is already turned off
- **THEN** the request is marked expired with no action taken, since there is nothing left to turn off, and no automatic-turn-off notification is sent

### Requirement: Exhausting the snooze cap triggers the same automatic outcome as expiry
The system SHALL maintain, per cluster, a count of snooze decisions recorded that persists across a snoozed cycle resuming (per "A snoozed request resumes after its snooze period, even without a tier change") and resets only when the cluster's age-status tier changes. When a tier's auto-turn-off-on-inaction is enabled, the system SHALL refuse a snooze attempt that would exceed that tier's configured maximum snoozes at the moment of the attempt - without recording a new snooze or opening the snooze dialog - and SHALL instead apply the same automatic-turnoff decision and owner notification described for expiry, subject to the same ask-to-turn-off and already-off conditions, persisting on the cluster record an explanation that the maximum snooze count was reached.

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
- **WHEN** a cluster's age-status tier changes
- **THEN** its snooze count resets to zero along with the rest of its consent cycle

## ADDED Requirements

### Requirement: Consent status change is timestamped independent of cycle-start timing
The system SHALL record, on the cluster record, when its consent status most recently changed, updated on every consent-status transition (including entering or resuming a snooze, an approval, an expiry, or a reset to no active cycle). This timestamp SHALL be tracked independently of the pending-cycle-start timestamp that governs reminder and expiry timing, and SHALL NOT alter that timing.

#### Scenario: Consent status changes
- **WHEN** a cluster's consent status transitions to a new value for any reason (owner decision, automatic decision, tier-change reset, or snooze resume)
- **THEN** the cluster record's consent-status-changed timestamp is updated to the moment of that transition

#### Scenario: Reminder and expiry timing is unaffected
- **WHEN** a reminder is sent or an expiry check runs for a pending request
- **THEN** that timing continues to be computed from the existing pending-cycle-start timestamp, unaffected by the consent-status-changed timestamp
