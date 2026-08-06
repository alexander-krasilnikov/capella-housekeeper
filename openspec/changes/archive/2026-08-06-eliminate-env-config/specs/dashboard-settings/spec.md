## MODIFIED Requirements

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit all runtime-configurable values, including but not limited to the `newDays`, `staleDays`, `forgottenDays`, and `inactivityGraceDays` threshold values used by age-status computation.

#### Scenario: Editing a threshold
- **WHEN** an operator changes a threshold value on the settings page and saves
- **THEN** the new value is persisted and used for subsequent age-status computation

## ADDED Requirements

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
