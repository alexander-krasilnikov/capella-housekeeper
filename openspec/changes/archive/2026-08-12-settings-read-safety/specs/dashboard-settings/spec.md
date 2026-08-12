## MODIFIED Requirements

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
