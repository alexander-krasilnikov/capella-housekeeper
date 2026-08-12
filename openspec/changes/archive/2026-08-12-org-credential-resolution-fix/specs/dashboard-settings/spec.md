## MODIFIED Requirements

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
