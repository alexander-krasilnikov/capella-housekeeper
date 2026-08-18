## MODIFIED Requirements

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit all runtime-configurable values, including but not limited to the `activityGraceHours` and `forgottenHours` threshold values used by recency computation.

#### Scenario: Editing a threshold
- **WHEN** an operator changes a threshold value on the settings page and saves
- **THEN** the new value is persisted and used for subsequent recency computation

### Requirement: Slack notification settings configurable in settings, excluding "In Use"
The system SHALL let an operator view and edit, per recency tier except "Fresh", whether transitions into that tier notify, offer a turn-off consent ask, and offer a delete consent ask. The system SHALL NOT provide any notification configuration for the "Fresh" tier. Saving these per-tier notification preferences SHALL NOT read, write, or otherwise affect the configured Slack bot token or app-level token.

#### Scenario: Configuring a tier's notification behavior
- **WHEN** an operator enables notification and both consent asks for the "Old" tier and saves
- **THEN** subsequent transitions into "Old" send a notification offering both asks

#### Scenario: No configuration exists for "In Use"
- **WHEN** an operator views the per-tier notification settings
- **THEN** only "Aging" and "Old" are configurable, and "Fresh" is not present

#### Scenario: Saving notification preferences leaves Slack tokens untouched
- **WHEN** an operator changes a per-tier notification preference and saves, regardless of what is currently persisted or displayed for the Slack bot token or app-level token
- **THEN** the previously persisted Slack bot token and app-level token remain exactly as they were before the save
