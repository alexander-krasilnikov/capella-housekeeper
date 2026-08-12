## ADDED Requirements

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
