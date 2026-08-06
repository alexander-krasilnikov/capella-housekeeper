## ADDED Requirements

### Requirement: Organizations, sync interval, and retention are read from live settings
The system SHALL read the configured organizations, sync interval, and retention period from current settings at the start of each sync cycle, rather than from fixed values captured once at process start.

#### Scenario: Organization added via settings takes effect without restart
- **WHEN** an operator adds a new organization in settings after the process has started
- **THEN** that organization is polled starting from the next sync cycle, without restarting the process

#### Scenario: Sync interval change takes effect on the next cycle
- **WHEN** an operator changes the sync interval in settings
- **THEN** the next cycle is scheduled using the new interval

### Requirement: Sync tolerates zero configured organizations
The system SHALL run a sync cycle that polls nothing, without error, when zero organizations are configured, rather than failing to start.

#### Scenario: Fresh install with no organizations configured
- **WHEN** the dashboard starts with zero organizations configured
- **THEN** the sync cycle completes without error and the cluster table shows its existing empty state
