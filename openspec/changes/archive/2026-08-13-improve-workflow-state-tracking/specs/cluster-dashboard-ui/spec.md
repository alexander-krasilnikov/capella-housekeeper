## ADDED Requirements

### Requirement: Grid shows the workflow explanation and time in current consent status
The system SHALL show, as columns in the main cluster grid alongside Consent and Action, the persisted explanation for the current consent status or action outcome, and how long the cluster has been in its current consent status. A cluster with no persisted explanation, or no active consent cycle, SHALL show an empty placeholder for the corresponding column rather than a stale or misleading value. Like other columns, both SHALL be hideable via the column-visibility control, in which case their data appears in the row detail panel's Workflow group instead - same as the existing Consent and Action columns.

#### Scenario: Cluster with a persisted explanation
- **WHEN** an operator views the grid for a cluster whose current consent status or action outcome carries a persisted explanation
- **THEN** the Workflow Note column shows that explanation

#### Scenario: Cluster with no active consent cycle
- **WHEN** an operator views the grid for a cluster with no active consent cycle and no persisted explanation
- **THEN** both the Status Since and Workflow Note columns show an empty placeholder

#### Scenario: Column hidden from the grid
- **WHEN** an operator hides the Status Since or Workflow Note column via the column-visibility control
- **THEN** that data still appears in the row's detail panel, under the Workflow group

### Requirement: Grid shows snooze details as columns
The system SHALL show a cluster's snooze-until date and snooze justification as columns in the main cluster grid, alongside Consent, Status Since, and Workflow Note, rather than only in the row detail panel. A cluster with no active snooze SHALL show an empty placeholder for both. Like other columns, both SHALL be hideable via the column-visibility control, in which case their data appears in the row detail panel's Workflow group instead.

#### Scenario: Cluster currently snoozed
- **WHEN** an operator views the grid for a cluster with an active snooze
- **THEN** the Snooze Until column shows the snooze's end date and the Snooze Reason column shows the justification the owner gave

#### Scenario: Cluster with no active snooze
- **WHEN** an operator views the grid for a cluster with no active snooze
- **THEN** both the Snooze Until and Snooze Reason columns show an empty placeholder

#### Scenario: Column hidden from the grid
- **WHEN** an operator hides the Snooze Until or Snooze Reason column via the column-visibility control
- **THEN** that data still appears in the row's detail panel, under the Workflow group

### Requirement: New workflow columns are hidden by default but remain toggleable
The system SHALL exclude Status Since, Snooze Until, Snooze Reason, and Workflow Note from the default set of visible grid columns, while still listing all four in the column-visibility control so an operator can enable them.

#### Scenario: Default view
- **WHEN** an operator who has not customized column visibility views the grid
- **THEN** Status Since, Snooze Until, Snooze Reason, and Workflow Note are not shown as columns

#### Scenario: Operator enables a hidden-by-default column
- **WHEN** an operator opens the column-visibility control and enables Status Since or Workflow Note
- **THEN** that column appears in the grid

### Requirement: Column-visibility control closes on an outside click
The system SHALL close the open column-visibility control when the operator clicks anywhere outside it, without requiring a second click on its own toggle button.

#### Scenario: Click outside the open panel
- **WHEN** the column-visibility control is open and the operator clicks elsewhere on the page
- **THEN** the control closes
