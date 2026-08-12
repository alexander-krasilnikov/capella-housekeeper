## MODIFIED Requirements

### Requirement: Unified action column and result messaging

The system SHALL display a single "Action" column, positioned as the rightmost column in the main table, containing the Ask (manual consent request), Turn off, Delete, and History controls together for each cluster row - plus, when the manual cluster turn-on developer-options toggle (see dashboard-settings) is enabled, a Turn on control alongside them - plus any result or error message produced by any of those controls. Each button's own result message SHALL NOT appear in place of that button; the Ask control and every action's result message SHALL NOT appear in the Consent column, and the Turn off, Turn on, Delete, and History controls SHALL NOT appear in the row-detail panel; all controls and the shared result message are shown only in the Action column (or, when that column is hidden, in the row-detail panel's "Workflow" group alongside it, per the hidden-column-data requirement above).

#### Scenario: Action column shows all controls

- **WHEN** a cluster row is rendered
- **THEN** its Ask, Turn off, Delete, and History controls all appear together in the rightmost "Action" column, along with a Turn on control if the developer-options toggle is enabled

#### Scenario: Turn-on control appears when the developer-options toggle is enabled

- **WHEN** the manual cluster turn-on developer-options toggle is enabled and a cluster row is rendered
- **THEN** a Turn on control appears in the Action column alongside the other controls

#### Scenario: Turn-on control absent when the developer-options toggle is disabled

- **WHEN** the manual cluster turn-on developer-options toggle is disabled (the default) and a cluster row is rendered
- **THEN** no Turn on control appears anywhere in the row

#### Scenario: A button's result message appears below the row of buttons, not in place of the button

- **WHEN** a Turn off, Turn on, or Delete action completes (successfully or not)
- **THEN** the button that triggered it remains in place, and the result or error message appears below the whole row of buttons rather than replacing that button

#### Scenario: Consent column no longer hosts a control or message

- **WHEN** a cluster row is rendered
- **THEN** the Consent column shows only the consent status badge, with no Ask control and no Ask-result message in it

#### Scenario: Ask result appears with the Action controls, not the Consent badge

- **WHEN** a user clicks Ask and a result or error message is produced
- **THEN** that message appears in the Action column's cell, below its row of buttons, not under the Consent badge

#### Scenario: Row-detail panel no longer hosts action controls

- **WHEN** a cluster row is expanded
- **THEN** the detail panel shows no Ask, Turn off, Turn on, Delete, or History control while the Action column is visible
