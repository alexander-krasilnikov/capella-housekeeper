# cluster-dashboard-ui Specification

## Purpose
Gives operators a single unified view of every Capella cluster across all organizations and projects, so they can find, filter, and sort clusters without navigating per-org or per-project screens.
## Requirements
### Requirement: Unified cross-org cluster table
The system SHALL display all known clusters from all configured organizations and projects together in a single table, rather than partitioned by organization or project.

#### Scenario: Clusters from multiple organizations shown together
- **WHEN** clusters exist in more than one configured organization
- **THEN** the table displays rows from all of those organizations together in one list

### Requirement: Table columns
The system SHALL display, for each cluster row, the organization, project, cluster name, creation date, last-activity timestamp, owner, a compact configuration summary, age, actual cost, operational status, and recency.

#### Scenario: Row displays all required fields
- **WHEN** a cluster row is rendered
- **THEN** it shows organization, project, name, creation date, last activity, owner, configuration summary, age, actual cost, operational status, and recency

### Requirement: Date and time values respect the viewer's browser locale
The system SHALL format every displayed date/time value (creation date, last activity, actual-cost as-of date, last-synced timestamp) using the viewing browser's own locale and regional conventions - date component order, separators, and 12-hour/24-hour clock - rather than a fixed format, SHALL display the year as two digits, and SHALL NOT include seconds.

#### Scenario: Date order and clock convention follow the browser's locale
- **WHEN** the dashboard is viewed in browsers configured for different regions
- **THEN** the displayed date component order, separators, and use of a 12-hour or 24-hour clock differ to match each browser's own locale

#### Scenario: Year is two digits and seconds are omitted
- **WHEN** any date/time value is displayed
- **THEN** the year appears as two digits (e.g. "26" rather than "2026") and the time is shown without seconds

### Requirement: Owner is read-only
The system SHALL display each cluster's owner as read-only text; it SHALL NOT provide an inline control to edit or override it.

#### Scenario: No edit control shown
- **WHEN** a cluster row is rendered
- **THEN** the owner column shows only the owner's value, with no edit affordance

### Requirement: No horizontal scrolling; cell content wraps
The system SHALL fit the table within the viewport width without a horizontal scrollbar at viewport widths of 640px and above, wrapping cell content onto multiple lines where needed rather than truncating or overflowing.

#### Scenario: Long cell content wraps instead of overflowing
- **WHEN** a cell's content (e.g. an owner's email address or a cost figure with a date) is wider than its column
- **THEN** the content wraps onto additional lines within that cell instead of causing the table to scroll horizontally

#### Scenario: Narrower viewport uses tighter spacing to preserve wrapping
- **WHEN** the viewport is narrower than 1024px
- **THEN** the table reduces its font size and cell padding so words continue to wrap at natural boundaries rather than breaking mid-word

### Requirement: Compact configuration summary
The system SHALL summarize each cluster's configuration as a single human-readable string combining node count, per-node compute specification, cloud provider, and region, rather than one column per raw configuration field.

#### Scenario: Multi-node cluster summarized
- **WHEN** a cluster has 3 nodes of 4 vCPU / 16 GB in AWS us-east-1
- **THEN** the configuration summary displays as "3× 4vCPU/16GB, aws/us-east-1"

### Requirement: Single search field across all columns
The system SHALL provide one search field, outside the table, that filters rows by matching the entered text against the value of any displayed column - not a separate filter control per column.

#### Scenario: Search matches organization
- **WHEN** a user enters an organization's name in the search field
- **THEN** only clusters belonging to that organization are shown

#### Scenario: Search matches owner
- **WHEN** a user enters an owner's name or email in the search field
- **THEN** only clusters attributed to that owner are shown

#### Scenario: Search matches any column
- **WHEN** a user enters text that matches a cluster's configuration summary, status, or any other displayed column
- **THEN** that cluster is shown, regardless of which column the match was found in

### Requirement: Sorting on every column
The system SHALL allow the table to be sorted, ascending or descending, by any displayed column.

#### Scenario: Sort by age
- **WHEN** a user sorts the table by age descending
- **THEN** the oldest clusters are listed first

### Requirement: Column visibility and ordering
The system SHALL let a user show or hide individual columns and change their left-to-right order.

#### Scenario: Hiding a column
- **WHEN** a user hides a column
- **THEN** that column no longer appears in the table until re-enabled

#### Scenario: Reordering a column
- **WHEN** a user moves a column earlier or later in the order
- **THEN** the table's columns are rendered in the new order

### Requirement: Row detail expansion, including hidden columns' data
The system SHALL let a user expand an individual cluster row to reveal additional detail not shown in the main columns (at minimum: cluster ID, organization ID, project ID, and Couchbase version), and SHALL also show the value of any column currently hidden from the table so hiding a column never makes its data inaccessible.

#### Scenario: Expanding a cluster row
- **WHEN** a user expands a cluster row
- **THEN** a detail panel appears beneath it showing the cluster's additional identifying and configuration information

#### Scenario: Hidden column's value shown in the detail panel
- **WHEN** a column is hidden from the table and a user expands a cluster row
- **THEN** that column's value for this cluster appears in the detail panel

### Requirement: Table configuration persists across sessions
The system SHALL remember a user's column visibility, column order, sort order, and page size preference across page reloads and future visits, without requiring the user to reconfigure the table each time.

#### Scenario: Reloading the page preserves configuration
- **WHEN** a user hides a column, reorders columns, changes the sort column, or changes the page size, then reloads the page
- **THEN** the table reflects the same column visibility, order, sort, and page size as before the reload

### Requirement: Row pagination
The system SHALL paginate the table with a user-selectable page size, showing controls to move between pages and the total row count.

#### Scenario: Navigating to the next page
- **WHEN** a user advances to the next page
- **THEN** the table shows the next set of rows and the current page indicator updates accordingly

#### Scenario: Changing page size
- **WHEN** a user selects a different rows-per-page value
- **THEN** the table re-paginates using the new page size

### Requirement: Age status shown independently of operational status
The system SHALL display each cluster's recency in a badge/column separate from its operational status badge/column, and SHALL NOT merge, replace, or override either status's display based on the value of the other.

#### Scenario: Active and Forgotten shown together
- **WHEN** a cluster is operationally active and its recency is "Old"
- **THEN** the row shows both an active operational-status badge and an "Old" recency badge, side by side

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

### Requirement: Table matches full container width
The system SHALL size the table to the full width of its available container at every viewport width, relying on the container's own padding (not a proportional inset) to keep the table from hugging the container's edges.

#### Scenario: Table fills its container at any viewport width
- **WHEN** the dashboard is viewed at any viewport width
- **THEN** the table occupies the full width of its container, with spacing from the container's edges coming from the container's own padding rather than the table itself being narrower than its container

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
The system SHALL show, before a user has customized column visibility, only the cluster name, owner, last activity, operational status, recency, consent, and Action columns - leaving organization, project, creation date, age, configuration summary, and actual cost hidden until explicitly shown.

#### Scenario: First-time or reset visitor sees the lean default
- **WHEN** a user views the table with no previously saved column configuration
- **THEN** only the cluster name, owner, last activity, status, recency, consent, and Action columns are visible, in that left-to-right order

#### Scenario: A saved configuration overrides the default
- **WHEN** a user has previously customized and saved column visibility
- **THEN** the table shows that saved configuration instead of the default on later visits

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

