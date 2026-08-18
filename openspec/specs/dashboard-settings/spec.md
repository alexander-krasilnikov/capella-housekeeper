# dashboard-settings Specification

## Purpose
Persists and exposes app-level configuration values - starting with the recency thresholds - that an operator can view and edit from the dashboard itself, without requiring a redeploy or environment-variable change.
## Requirements
### Requirement: Settings persist across restarts
The system SHALL persist configurable settings to local storage so they survive application restarts, seeding default values automatically the first time no settings exist. Once a settings file exists, the system SHALL NOT overwrite it with default values in response to a validation failure - it MAY fill in fields that are entirely absent (e.g. after an upgrade that added new fields), but SHALL leave any already-present field untouched and instead fail loudly if that field's value cannot be validated.

#### Scenario: First run uses defaults
- **WHEN** the dashboard starts and no settings have been persisted yet
- **THEN** it persists a default set of threshold values and uses them

#### Scenario: Settings survive a restart
- **WHEN** an operator changes a setting and the application is later restarted
- **THEN** the changed value is still in effect after restart

#### Scenario: A present field failing validation never triggers a silent reset
- **WHEN** a settings file already exists and a field it actually contains fails validation (and isn't something a migration can repair)
- **THEN** the system does not overwrite the file with default values, and instead surfaces the failure

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit all runtime-configurable values, including but not limited to the `activityGraceHours` and `forgottenHours` threshold values used by recency computation.

#### Scenario: Editing a threshold
- **WHEN** an operator changes a threshold value on the settings page and saves
- **THEN** the new value is persisted and used for subsequent recency computation

### Requirement: Threshold values are validated before saving
The system SHALL require `activityGraceHours` and `forgottenHours` to be positive integers, SHALL require `activityGraceHours < forgottenHours`, and SHALL reject any update that violates these constraints, leaving the previously saved values in effect.

#### Scenario: Rejecting invalid ordering
- **WHEN** an operator attempts to save an `activityGraceHours` value greater than or equal to `forgottenHours`
- **THEN** the update is rejected and the previously saved thresholds remain in effect

#### Scenario: Rejecting a non-positive value
- **WHEN** an operator attempts to save a threshold value of zero or negative
- **THEN** the update is rejected and the previously saved thresholds remain in effect

### Requirement: Capella organizations configurable in settings
The system SHALL let an operator view, add, and remove Capella organizations (each with an organization ID and an API key) from the settings page, and SHALL persist the resulting list for use by cluster sync. Multiple entries MAY share the same organization ID - a Capella API key can be scoped to a single project rather than the whole organization, so more than one entry is sometimes needed to cover every project in one org - and each entry SHALL carry its own stable identity independent of its organization ID, so it remains distinguishable from any other entry sharing that ID.

#### Scenario: Adding an organization
- **WHEN** an operator adds an organization with an organization ID and API key and saves
- **THEN** the organization is persisted and available to cluster sync on its next cycle

#### Scenario: Removing an organization
- **WHEN** an operator removes a previously configured organization and saves
- **THEN** that organization is no longer polled by cluster sync on its next cycle

#### Scenario: API key is not shown in plain text by default
- **WHEN** the settings page displays a configured organization
- **THEN** its API key is masked, with an explicit action required to reveal it

#### Scenario: Two entries share an organization ID
- **WHEN** an operator configures two entries with the same organization ID but different API keys (e.g. two project-scoped keys against one org)
- **THEN** both are persisted as distinct entries, each remaining independently identifiable regardless of their shared organization ID

### Requirement: Organization name is shown read-only, resolved from the Capella API
The system SHALL display each configured organization's name as a read-only value resolved from the Capella API, rather than an operator-editable field. The system SHALL look up this name whenever a row's organization ID and API key are both present, independent of whether the row has been saved yet.

#### Scenario: Name resolves once ID and API key are entered
- **WHEN** an operator enters an organization ID and API key for a new or existing row
- **THEN** the settings page displays that organization's real name once the lookup succeeds, without the operator typing it

#### Scenario: No editable name field is offered
- **WHEN** the settings page displays the organizations list
- **THEN** no control lets the operator directly type or override an organization's name

#### Scenario: Lookup fails
- **WHEN** the organization ID and API key don't resolve to a valid organization
- **THEN** the name is shown as unresolved rather than blocking the rest of the form

### Requirement: Capella API base URL is fixed, not exposed in settings
The system SHALL use a fixed Capella Management API base URL, defaulting to the standard Capella API host, and SHALL NOT provide a settings-page control to view or edit it.

#### Scenario: No API base URL control on the settings page
- **WHEN** an operator views the settings page
- **THEN** no control for the Capella API base URL is shown

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

### Requirement: Slack credentials configurable independently of notification preferences
The system SHALL provide a settings-page form, separate from the per-tier notification preferences form, where an operator can view and edit the Slack bot token and Slack app-level token, and SHALL let an operator test the tokens currently in that form (saved or not) against Slack. Saving this form SHALL NOT read, write, or otherwise affect per-tier notification preferences, consent reminder/expiry settings, or snooze day options.

#### Scenario: Slack credentials form is separate from notification preferences
- **WHEN** an operator opens the settings page
- **THEN** the Slack bot token and app-level token fields, and the control to test them, appear in a section distinct from the per-tier notification preferences

#### Scenario: Saving Slack credentials leaves notification preferences untouched
- **WHEN** an operator updates a Slack token and saves the Slack credentials form
- **THEN** the previously persisted per-tier notification preferences, consent reminder/expiry settings, and snooze day options remain exactly as they were before the save

### Requirement: A blank Slack token field on save preserves the existing token
The system SHALL treat a blank Slack bot token or app-level token field, submitted from the Slack credentials form, as "leave the currently persisted token unchanged" rather than "clear the token" - a page loaded before a token was configured, or before it was last changed, SHALL NOT be able to erase that token by saving without having deliberately entered a new value.

#### Scenario: Submitting a stale or blank field does not erase a configured token
- **WHEN** an operator saves the Slack credentials form while the bot token or app-level token field is blank, and a token is currently persisted
- **THEN** the currently persisted token is left unchanged

#### Scenario: Submitting a non-blank value updates the token
- **WHEN** an operator types a new value into the bot token or app-level token field and saves
- **THEN** the newly typed value replaces whatever was previously persisted for that token

### Requirement: Project visibility is shown read-only, resolved from the Capella API
The system SHALL display, for each configured organization row, a summary of which project(s) that row's API key can see, resolved live from the Capella API rather than typed by the operator. The system SHALL look up this summary whenever a row's organization ID and API key are both present, independent of whether the row has been saved yet, using the same lookup timing as the organization name.

#### Scenario: Key scoped to a single project
- **WHEN** an organization row's API key can see exactly one project
- **THEN** the settings page displays that project's real name

#### Scenario: Key scoped to the whole organization
- **WHEN** an organization row's API key can see more than one project
- **THEN** the settings page displays "All projects" rather than an arbitrary single project name

#### Scenario: No editable project field is offered
- **WHEN** the settings page displays the organizations list
- **THEN** no control lets the operator directly type or override the project summary

#### Scenario: Lookup fails
- **WHEN** the organization ID and API key don't resolve to any visible project
- **THEN** the project summary is shown as unresolved rather than blocking the rest of the form

### Requirement: Developer options section for temporary/test-period settings
The system SHALL provide a "Developer options" section on the settings page, separate from the other settings sections, for settings intended only for use during the current test period rather than as permanent operational configuration.

#### Scenario: Developer options section present
- **WHEN** an operator opens the settings page
- **THEN** a "Developer options" section is available alongside the other settings sections

### Requirement: Manual cluster turn-on toggle, disabled by default
The system SHALL let an operator enable or disable, from the Developer options section, whether a manual "Turn on" control is offered for clusters elsewhere in the dashboard, and SHALL default this setting to disabled when no value has been persisted (first run, or an existing settings file that predates this setting).

#### Scenario: Toggle defaults to disabled
- **WHEN** the dashboard starts and no settings have been persisted yet, or an existing settings file has no value for this setting
- **THEN** the manual turn-on toggle is off

#### Scenario: Enabling the toggle
- **WHEN** an operator enables the manual turn-on toggle and saves
- **THEN** a "Turn on" control becomes available for clusters, per the manual-cluster-actions and cluster-dashboard-ui capabilities

#### Scenario: Disabling the toggle
- **WHEN** an operator disables the manual turn-on toggle and saves
- **THEN** the "Turn on" control is no longer available for any cluster

