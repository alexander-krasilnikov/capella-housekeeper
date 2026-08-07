## ADDED Requirements

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
