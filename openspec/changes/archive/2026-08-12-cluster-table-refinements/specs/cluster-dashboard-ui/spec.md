## MODIFIED Requirements

### Requirement: Row detail expansion, including hidden columns' data
The system SHALL let a user expand an individual cluster row to reveal additional detail not shown in the main columns (at minimum: cluster ID, organization ID, project ID, and Couchbase version), and SHALL also show the value of any column currently hidden from the table so hiding a column never makes its data inaccessible.

#### Scenario: Expanding a cluster row
- **WHEN** a user expands a cluster row
- **THEN** a detail panel appears beneath it showing the cluster's additional identifying and configuration information

#### Scenario: Hidden column's value shown in the detail panel
- **WHEN** a column is hidden from the table and a user expands a cluster row
- **THEN** that column's value for this cluster appears in the detail panel

## REMOVED Requirements

### Requirement: Unified action column

The system SHALL display a single "Action" column, positioned as the rightmost column in the main table, containing the Ask (manual consent request), Turn off, and Delete controls together for each cluster row. The Ask control SHALL NOT appear in the Consent column, and the Turn off and Delete controls SHALL NOT appear in the row-detail panel; all three are shown only in the Action column.

#### Scenario: Action column shows all three controls

- **WHEN** a cluster row is rendered
- **THEN** its Ask, Turn off, and Delete controls all appear together in the rightmost "Action" column

#### Scenario: Consent column no longer hosts a control

- **WHEN** a cluster row is rendered
- **THEN** the Consent column shows only the consent status badge, with no Ask control in it

#### Scenario: Row-detail panel no longer hosts action controls

- **WHEN** a cluster row is expanded
- **THEN** the detail panel shows no Turn off or Delete control while the Action column is visible

**Reason**: Superseded by "Unified action column and result messaging" - the History control and the Ask result message both join the Action column, which the three-control version didn't cover.
**Migration**: No user-facing migration; see the added requirement below for current behavior.

## ADDED Requirements

### Requirement: Unified action column and result messaging

The system SHALL display a single "Action" column, positioned as the rightmost column in the main table, containing the Ask (manual consent request), Turn off, Delete, and History controls together for each cluster row, plus any result or error message produced by the Ask control. The Ask control and its result message SHALL NOT appear in the Consent column, and the Turn off, Delete, and History controls SHALL NOT appear in the row-detail panel; all four controls and the Ask result message are shown only in the Action column (or, when that column is hidden, in the row-detail panel's "Workflow" group alongside it, per the hidden-column-data requirement above).

#### Scenario: Action column shows all four controls

- **WHEN** a cluster row is rendered
- **THEN** its Ask, Turn off, Delete, and History controls all appear together in the rightmost "Action" column

#### Scenario: Consent column no longer hosts a control or message

- **WHEN** a cluster row is rendered
- **THEN** the Consent column shows only the consent status badge, with no Ask control and no Ask-result message in it

#### Scenario: Ask result appears with the Action controls, not the Consent badge

- **WHEN** a user clicks Ask and a result or error message is produced
- **THEN** that message appears in the Action column's cell, below its row of buttons, not under the Consent badge

#### Scenario: Row-detail panel no longer hosts action controls

- **WHEN** a cluster row is expanded
- **THEN** the detail panel shows no Ask, Turn off, Delete, or History control while the Action column is visible

### Requirement: Default column visibility favors a lean view
The system SHALL show, before a user has customized column visibility, only the cluster name, owner, last activity, operational status, age status, and consent columns - leaving organization, project, creation date, age, configuration summary, actual cost, and the Action column hidden until explicitly shown.

#### Scenario: First-time or reset visitor sees the lean default
- **WHEN** a user views the table with no previously saved column configuration
- **THEN** only the cluster name, owner, last activity, status, age status, and consent columns are visible, in that left-to-right order

#### Scenario: A saved configuration overrides the default
- **WHEN** a user has previously customized and saved column visibility
- **THEN** the table shows that saved configuration instead of the default on later visits
