## MODIFIED Requirements

### Requirement: Slack notification settings configurable in settings, excluding "In Use"
The system SHALL let an operator view and edit, per age-status tier except "In Use", whether transitions into that tier notify, offer a turn-off consent ask, and offer a delete consent ask. The system SHALL NOT provide any notification configuration for the "In Use" tier. Saving these per-tier notification preferences SHALL NOT read, write, or otherwise affect the configured Slack bot token or app-level token.

#### Scenario: Configuring a tier's notification behavior
- **WHEN** an operator enables notification and both consent asks for the "Forgotten" tier and saves
- **THEN** subsequent transitions into "Forgotten" send a notification offering both asks

#### Scenario: No configuration exists for "In Use"
- **WHEN** an operator views the per-tier notification settings
- **THEN** only "Stale" and "Forgotten" are configurable, and "In Use" is not present

#### Scenario: Saving notification preferences leaves Slack tokens untouched
- **WHEN** an operator changes a per-tier notification preference and saves, regardless of what is currently persisted or displayed for the Slack bot token or app-level token
- **THEN** the previously persisted Slack bot token and app-level token remain exactly as they were before the save

## ADDED Requirements

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
