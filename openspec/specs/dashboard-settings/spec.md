# dashboard-settings Specification

## Purpose
Persists and exposes app-level configuration values - starting with the age-status thresholds - that an operator can view and edit from the dashboard itself, without requiring a redeploy or environment-variable change.
## Requirements
### Requirement: Settings persist across restarts
The system SHALL persist configurable settings to local storage so they survive application restarts, seeding default values automatically the first time no settings exist.

#### Scenario: First run uses defaults
- **WHEN** the dashboard starts and no settings have been persisted yet
- **THEN** it persists a default set of threshold values and uses them

#### Scenario: Settings survive a restart
- **WHEN** an operator changes a setting and the application is later restarted
- **THEN** the changed value is still in effect after restart

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit all runtime-configurable values, including but not limited to the `newDays`, `staleDays`, `forgottenDays`, and `inactivityGraceDays` threshold values used by age-status computation.

#### Scenario: Editing a threshold
- **WHEN** an operator changes a threshold value on the settings page and saves
- **THEN** the new value is persisted and used for subsequent age-status computation

### Requirement: Threshold values are validated before saving
The system SHALL require `newDays`, `staleDays`, `forgottenDays`, and `inactivityGraceDays` to be positive integers, SHALL require `newDays < staleDays < forgottenDays`, and SHALL reject any update that violates these constraints, leaving the previously saved values in effect.

#### Scenario: Rejecting invalid ordering
- **WHEN** an operator attempts to save a `staleDays` value greater than or equal to `forgottenDays`
- **THEN** the update is rejected and the previously saved thresholds remain in effect

#### Scenario: Rejecting a non-positive value
- **WHEN** an operator attempts to save a threshold value of zero or negative
- **THEN** the update is rejected and the previously saved thresholds remain in effect

### Requirement: Capella organizations configurable in settings
The system SHALL let an operator view, add, and remove Capella organizations (each with an organization ID, an optional display name, and an API key) from the settings page, and SHALL persist the resulting list for use by cluster sync.

#### Scenario: Adding an organization
- **WHEN** an operator adds an organization with an organization ID and API key and saves
- **THEN** the organization is persisted and available to cluster sync on its next cycle

#### Scenario: Removing an organization
- **WHEN** an operator removes a previously configured organization and saves
- **THEN** that organization is no longer polled by cluster sync on its next cycle

#### Scenario: API key is not shown in plain text by default
- **WHEN** the settings page displays a configured organization
- **THEN** its API key is masked, with an explicit action required to reveal it

### Requirement: Capella API base URL configurable in settings
The system SHALL let an operator view and edit the Capella Management API base URL from the settings page, defaulting to the standard Capella API host when unset.

#### Scenario: Overriding the API base URL
- **WHEN** an operator sets a different API base URL and saves
- **THEN** cluster sync uses that URL for subsequent requests

### Requirement: Sync interval configurable in settings
The system SHALL let an operator view and edit the cluster-sync polling interval, in whole hours, from the settings page, defaulting to 1 hour.

#### Scenario: Changing the sync interval
- **WHEN** an operator changes the sync interval and saves
- **THEN** cluster sync uses the new interval starting from its next scheduled cycle

### Requirement: Retention period configurable in settings
The system SHALL let an operator view and edit the tombstone/history retention period, in whole days, from the settings page, defaulting to 7 days.

#### Scenario: Changing the retention period
- **WHEN** an operator changes the retention period and saves
- **THEN** subsequent purge cycles use the new retention period

### Requirement: Dashboard credentials configurable in settings
The system SHALL provide a settings-page form where an operator can view the current dashboard username and submit a new username and/or password.

#### Scenario: Credential form available
- **WHEN** an operator opens the settings page
- **THEN** a form is present for viewing the current username and submitting a new username and/or password

### Requirement: Session secret is managed automatically, never manually edited
The system SHALL generate the session-signing secret automatically the first time none is persisted, SHALL persist it for reuse across restarts, and SHALL NOT provide any settings-page control that displays or accepts its raw value - only an action to regenerate it.

#### Scenario: First run generates a session secret
- **WHEN** the dashboard starts and no session secret has been persisted yet
- **THEN** it generates and persists one automatically, without operator input

#### Scenario: Regenerating invalidates existing sessions
- **WHEN** an operator uses the settings page's action to regenerate the session secret
- **THEN** a new secret is generated and persisted, and all existing sessions (including the operator's own) are invalidated

#### Scenario: Raw secret is never displayed
- **WHEN** the settings page renders
- **THEN** the session secret's value is never shown in any field, editable or read-only

### Requirement: Slack notification settings configurable in settings
The system SHALL let an operator view and edit a Slack bot token and a Slack app-level token, and SHALL let an operator view and edit, per age-status tier except "New", whether transitions into that tier notify, offer a turn-off consent ask, and offer a delete consent ask. The system SHALL NOT provide any notification configuration for the "New" tier.

#### Scenario: Configuring a tier's notification behavior
- **WHEN** an operator enables notification and both consent asks for the "Forgotten" tier and saves
- **THEN** subsequent transitions into "Forgotten" send a notification offering both asks

#### Scenario: No configuration exists for "New"
- **WHEN** an operator views the per-tier notification settings
- **THEN** only "Established", "Stale", and "Forgotten" are configurable, and "New" is not present

#### Scenario: Slack tokens stored
- **WHEN** an operator sets a Slack bot token and app-level token and saves
- **THEN** both are persisted, the bot token is used for subsequent notification deliveries, and the app-level token is used to receive consent decisions

### Requirement: Consent reminder and expiry periods configurable in settings
The system SHALL let an operator view and edit the maximum number of reminder re-sends and the expiry period, in whole days, applied to pending consent requests, and SHALL reject a non-positive value for either, leaving the previously saved values in effect.

#### Scenario: Changing the reminder count
- **WHEN** an operator changes the maximum reminder count to a positive integer and saves
- **THEN** subsequent consent requests use the new maximum

#### Scenario: Changing the expiry period
- **WHEN** an operator changes the expiry period to a positive integer number of days and saves
- **THEN** subsequently created consent requests expire according to the new period

#### Scenario: Rejecting a non-positive value
- **WHEN** an operator attempts to save a reminder count or expiry period of zero or negative
- **THEN** the update is rejected and the previously saved values remain in effect

### Requirement: Slack tokens are not shown in plain text by default
The system SHALL mask the configured Slack bot token and app-level token when the settings page displays them, requiring an explicit action to reveal each - consistent with how Capella API keys are handled.

#### Scenario: Viewing settings with tokens configured
- **WHEN** the settings page renders and a Slack bot token and/or app-level token is configured
- **THEN** its value is masked, with an explicit action required to reveal it

