## REMOVED Requirements

### Requirement: Per-tier notification configuration, excluding "New"
**Reason**: "New" is replaced by "In Use" throughout the collapse-age-status-tiers change - superseded by the equivalent requirement below, scoped to "In Use" instead.
**Migration**: No action needed; the ADDED requirement below covers the retained behavior under the new tier name.

## ADDED Requirements

### Requirement: Per-tier notification configuration, excluding "In Use"
The system SHALL allow each age-status tier except "In Use" (that is: Stale and Forgotten) to be independently configured with a notify toggle, an ask-to-turn-off toggle, and an ask-to-delete toggle. The system SHALL NOT offer any notification configuration for "In Use", and SHALL NOT send a notification for a cluster while it is classified "In Use" regardless of any other setting.

#### Scenario: Tier configured to notify with both asks
- **WHEN** an operator enables notify, ask-to-turn-off, and ask-to-delete for the "Forgotten" tier
- **THEN** a cluster transitioning into "Forgotten" triggers a notification offering both turn-off and delete consent options

#### Scenario: Tier configured to notify without any ask
- **WHEN** an operator enables notify but leaves ask-to-turn-off and ask-to-delete disabled for a tier
- **THEN** a cluster transitioning into that tier triggers a notification with no turn-off or delete option (a snooze option is still offered - see below)

#### Scenario: In Use is never notification-eligible
- **WHEN** a cluster's age status is "In Use"
- **THEN** no notification is sent for it, and no per-tier configuration exists for "In Use" in settings

## MODIFIED Requirements

### Requirement: The notification states the consequence of no response
Every consent notification SHALL state what happens if the owner does not respond: the configured maximum number of reminders, the configured expiry period, and that no action is taken automatically once the request expires. For a cluster in the "Forgotten" tier, the notification SHALL additionally state that the cluster has already exceeded the configured Forgotten grace period.

#### Scenario: Standard no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Stale" tier
- **THEN** the notification states the reminder count, the expiry period, and that expiry results in no automatic action

#### Scenario: Forgotten-tier no-response notice
- **WHEN** a consent notification is sent for a cluster in the "Forgotten" tier
- **THEN** the notification additionally states that the cluster has already exceeded the configured Forgotten grace period
