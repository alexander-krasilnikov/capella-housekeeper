## ADDED Requirements

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
- **THEN** the detail panel shows no Turn off or Delete control
