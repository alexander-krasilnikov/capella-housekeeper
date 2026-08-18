## MODIFIED Requirements

### Requirement: Table columns
The system SHALL display, for each cluster row, the organization, project, cluster name, creation date, last-activity timestamp, owner, a compact configuration summary, age, actual cost, operational status, and recency.

#### Scenario: Row displays all required fields
- **WHEN** a cluster row is rendered
- **THEN** it shows organization, project, name, creation date, last activity, owner, configuration summary, age, actual cost, operational status, and recency

### Requirement: Age status shown independently of operational status
The system SHALL display each cluster's recency in a badge/column separate from its operational status badge/column, and SHALL NOT merge, replace, or override either status's display based on the value of the other.

#### Scenario: Active and Forgotten shown together
- **WHEN** a cluster is operationally active and its recency is "Old"
- **THEN** the row shows both an active operational-status badge and an "Old" recency badge, side by side

### Requirement: Age-status filter
The system SHALL provide a row of quick-filter buttons - one for "All" plus one per recency tier - separate from the free-text search field, that restrict the table to rows matching the selected tier, and SHALL display, on each button, the count of clusters that would match if it were selected (computed against whatever the free-text search field already narrows the table down to).

#### Scenario: Filtering to Forgotten clusters
- **WHEN** an operator selects the "Old" quick-filter button
- **THEN** only clusters whose recency is "Old" are shown

#### Scenario: Clearing the filter
- **WHEN** an operator selects the "All" quick-filter button
- **THEN** clusters of all recency tiers are shown again, subject to any other active filters

#### Scenario: Counts reflect the active search, not the age-status filter itself
- **WHEN** a search term is entered that narrows the table to a subset of clusters
- **THEN** each quick-filter button's count reflects only that narrowed subset, broken down by tier

#### Scenario: Exactly one button is active at a time
- **WHEN** the quick-filter buttons are rendered
- **THEN** exactly one of them (the selected tier, or "All") is visually distinguished as active

### Requirement: Default column visibility favors a lean view
The system SHALL show, before a user has customized column visibility, only the cluster name, owner, last activity, operational status, recency, consent, and Action columns - leaving organization, project, creation date, age, configuration summary, and actual cost hidden until explicitly shown.

#### Scenario: First-time or reset visitor sees the lean default
- **WHEN** a user views the table with no previously saved column configuration
- **THEN** only the cluster name, owner, last activity, status, recency, consent, and Action columns are visible, in that left-to-right order

#### Scenario: A saved configuration overrides the default
- **WHEN** a user has previously customized and saved column visibility
- **THEN** the table shows that saved configuration instead of the default on later visits
