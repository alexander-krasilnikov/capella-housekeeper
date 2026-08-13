## ADDED Requirements

### Requirement: Operational status badge reflects Capella's own state semantics
The system SHALL classify each cluster's raw Capella operational-status value into one of a fixed set of buckets - active, transitioning, off, or unrecognized - using the value itself, not the formatted display label, and SHALL give each bucket its own distinct color; the transitioning bucket SHALL additionally be shown with an animated indicator distinguishing it from every static bucket.

#### Scenario: A transitioning state and its corresponding terminal state are shown in different colors
- **WHEN** one cluster's operational status is Capella's in-progress state for turning off and another cluster's operational status is Capella's confirmed turned-off state
- **THEN** the two clusters' status badges are shown in different colors

#### Scenario: A transitioning state is visually distinguished as in-progress
- **WHEN** a cluster's operational status is any of Capella's in-progress states (e.g. turning off, turning on, deploying, scaling, destroying)
- **THEN** its status badge shows an animated indicator, distinct from the static indicator used for active or off states

#### Scenario: An unrecognized status value does not silently borrow another bucket's color
- **WHEN** a cluster's raw operational-status value does not match any known active, transitioning, or off state
- **THEN** its status badge is shown in a distinct neutral/unrecognized color rather than defaulting to the active or off color

## MODIFIED Requirements

### Requirement: Unified action column and result messaging

The system SHALL display a single "Action" column, positioned as the rightmost column in the main table, containing the Ask (manual consent request), Turn off, Delete, and History controls together for each cluster row - plus, when the manual cluster turn-on developer-options toggle (see dashboard-settings) is enabled, a Turn on control alongside them - plus any result or error message produced by any of those controls, plus a badge stating the outcome (performed, skipped, or failed) of the most recent reconciliation-loop action taken on that cluster, when one exists. Each button's own result message SHALL NOT appear in place of that button; the Ask control, every action's result message, and the reconciliation-action-outcome badge SHALL NOT appear in the Consent column; the Turn off, Turn on, Delete, and History controls SHALL NOT appear in the row-detail panel; all controls, the shared result message, and the outcome badge are shown only in the Action column (or, when that column is hidden, in the row-detail panel's "Workflow" group alongside it, per the hidden-column-data requirement above).

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

#### Scenario: Consent column no longer hosts a control, message, or outcome badge

- **WHEN** a cluster row is rendered
- **THEN** the Consent column shows only the consent status badge, with no Ask control, no Ask-result message, and no reconciliation-action-outcome badge in it

#### Scenario: Ask result appears with the Action controls, not the Consent badge

- **WHEN** a user clicks Ask and a result or error message is produced
- **THEN** that message appears in the Action column's cell, below its row of buttons, not under the Consent badge

#### Scenario: Row-detail panel no longer hosts action controls

- **WHEN** a cluster row is expanded
- **THEN** the detail panel shows no Ask, Turn off, Turn on, Delete, or History control while the Action column is visible

#### Scenario: Reconciliation outcome shown as its own badge, not folded into the Consent badge

- **WHEN** the reconciliation loop has performed, skipped, or failed an approved turn-off or delete for a cluster
- **THEN** the Action column shows an outcome badge stating which of those three happened, and the Consent column's badge continues to describe only the consent decision (e.g. "Approved: Turn off"), without restating that outcome

#### Scenario: No outcome badge before any reconciled action has occurred

- **WHEN** a cluster has no consent decision yet acted on by the reconciliation loop
- **THEN** the Action column shows no outcome badge for it

### Requirement: Default column visibility favors a lean view
The system SHALL show, before a user has customized column visibility, only the cluster name, owner, last activity, operational status, age status, consent, and Action columns - leaving organization, project, creation date, age, configuration summary, and actual cost hidden until explicitly shown.

#### Scenario: First-time or reset visitor sees the lean default
- **WHEN** a user views the table with no previously saved column configuration
- **THEN** only the cluster name, owner, last activity, status, age status, consent, and Action columns are visible, in that left-to-right order

#### Scenario: A saved configuration overrides the default
- **WHEN** a user has previously customized and saved column visibility
- **THEN** the table shows that saved configuration instead of the default on later visits
