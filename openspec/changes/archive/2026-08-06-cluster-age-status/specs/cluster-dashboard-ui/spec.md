## MODIFIED Requirements

### Requirement: Table columns
The system SHALL display, for each cluster row, the organization, project, cluster name, creation date, last-activity timestamp, owner, a compact configuration summary, age, actual cost, operational status, and age status.

#### Scenario: Row displays all required fields
- **WHEN** a cluster row is rendered
- **THEN** it shows organization, project, name, creation date, last activity, owner, configuration summary, age, actual cost, operational status, and age status

## ADDED Requirements

### Requirement: Age status shown independently of operational status
The system SHALL display each cluster's age status in a badge/column separate from its operational status badge/column, and SHALL NOT merge, replace, or override either status's display based on the value of the other.

#### Scenario: Active and Forgotten shown together
- **WHEN** a cluster is operationally active and its age status is "Forgotten"
- **THEN** the row shows both an active operational-status badge and a "Forgotten" age-status badge, side by side

### Requirement: Age-status filter
The system SHALL provide a dropdown filter, separate from the free-text search field, that restricts the table to rows matching a selected age-status tier.

#### Scenario: Filtering to Forgotten clusters
- **WHEN** an operator selects "Forgotten" in the age-status filter
- **THEN** only clusters whose age status is "Forgotten" are shown

#### Scenario: Clearing the filter
- **WHEN** an operator clears the age-status filter
- **THEN** clusters of all age-status tiers are shown again, subject to any other active filters
