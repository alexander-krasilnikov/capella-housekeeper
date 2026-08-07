## REMOVED Requirements

### Requirement: Slack notification settings configurable in settings
**Reason**: "New" is replaced by "In Use" throughout the collapse-age-status-tiers change - superseded by the equivalent requirement below, scoped to "In Use" instead.
**Migration**: No action needed; the ADDED requirement below covers the retained behavior under the new tier name.

## ADDED Requirements

### Requirement: Slack notification settings configurable in settings, excluding "In Use"
The system SHALL let an operator view and edit a Slack bot token and a Slack app-level token, and SHALL let an operator view and edit, per age-status tier except "In Use", whether transitions into that tier notify, offer a turn-off consent ask, and offer a delete consent ask. The system SHALL NOT provide any notification configuration for the "In Use" tier.

#### Scenario: Configuring a tier's notification behavior
- **WHEN** an operator enables notification and both consent asks for the "Forgotten" tier and saves
- **THEN** subsequent transitions into "Forgotten" send a notification offering both asks

#### Scenario: No configuration exists for "In Use"
- **WHEN** an operator views the per-tier notification settings
- **THEN** only "Stale" and "Forgotten" are configurable, and "In Use" is not present

#### Scenario: Slack tokens stored
- **WHEN** an operator sets a Slack bot token and app-level token and saves
- **THEN** both are persisted, the bot token is used for subsequent notification deliveries, and the app-level token is used to receive consent decisions

## MODIFIED Requirements

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit all runtime-configurable values, including but not limited to the `activityGraceHours` and `forgottenHours` threshold values used by age-status computation.

#### Scenario: Editing a threshold
- **WHEN** an operator changes a threshold value on the settings page and saves
- **THEN** the new value is persisted and used for subsequent age-status computation

### Requirement: Threshold values are validated before saving
The system SHALL require `activityGraceHours` and `forgottenHours` to be positive integers, SHALL require `activityGraceHours < forgottenHours`, and SHALL reject any update that violates these constraints, leaving the previously saved values in effect.

#### Scenario: Rejecting invalid ordering
- **WHEN** an operator attempts to save an `activityGraceHours` value greater than or equal to `forgottenHours`
- **THEN** the update is rejected and the previously saved thresholds remain in effect

#### Scenario: Rejecting a non-positive value
- **WHEN** an operator attempts to save a threshold value of zero or negative
- **THEN** the update is rejected and the previously saved thresholds remain in effect
