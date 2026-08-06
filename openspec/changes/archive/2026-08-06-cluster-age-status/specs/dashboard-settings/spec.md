## Purpose

Persists and exposes app-level configuration values - starting with the age-status thresholds - that an operator can view and edit from the dashboard itself, without requiring a redeploy or environment-variable change.

## ADDED Requirements

### Requirement: Settings persist across restarts
The system SHALL persist configurable settings to local storage so they survive application restarts, seeding default values automatically the first time no settings exist.

#### Scenario: First run uses defaults
- **WHEN** the dashboard starts and no settings have been persisted yet
- **THEN** it persists a default set of threshold values and uses them

#### Scenario: Settings survive a restart
- **WHEN** an operator changes a setting and the application is later restarted
- **THEN** the changed value is still in effect after restart

### Requirement: Settings page for viewing and editing thresholds
The system SHALL provide a settings page where an operator can view and edit the `newDays`, `staleDays`, `forgottenDays`, and `inactivityGraceDays` threshold values used by age-status computation.

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
