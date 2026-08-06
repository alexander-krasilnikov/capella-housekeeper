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
The system SHALL display, for each cluster row, the organization, project, cluster name, creation date, last-activity timestamp, owner, a compact configuration summary, age, actual cost, and operational status.

#### Scenario: Row displays all required fields
- **WHEN** a cluster row is rendered
- **THEN** it shows organization, project, name, creation date, last activity, owner, configuration summary, age, actual cost, and status

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

### Requirement: Table width matches its container proportionally
The system SHALL size the table to 90% of its available container width on screens 640px and wider, and to the full container width below that, so it neither hugs the container's edges on spacious layouts nor wastes space on constrained ones.

#### Scenario: Table centered with margin on a wide screen
- **WHEN** the dashboard is viewed on a screen 640px or wider
- **THEN** the table occupies 90% of its container's width, centered

#### Scenario: Table uses full width on a narrow screen
- **WHEN** the dashboard is viewed on a screen narrower than 640px
- **THEN** the table occupies the full width of its container

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

### Requirement: Deleted clusters remain visible during retention
The system SHALL display tombstoned (deleted) clusters in the table, visibly marked as deleted, until their retention period elapses.

#### Scenario: Recently deleted cluster still shown
- **WHEN** a cluster was deleted from Capella less than the configured retention period ago
- **THEN** it still appears in the table marked as deleted

### Requirement: Row grouping with aggregation
The system SHALL allow rows to be grouped by organization, project, or owner, collapsing each group to a single row showing the member count and summed actual cost, expandable to reveal its member clusters.

#### Scenario: Grouping by organization
- **WHEN** a user selects grouping by organization
- **THEN** the table shows one collapsed row per organization, each showing its cluster count and summed costs

#### Scenario: Expanding a group
- **WHEN** a user expands a group row
- **THEN** the individual clusters belonging to that group are shown beneath it

### Requirement: Column visibility and ordering
The system SHALL let a user show or hide individual columns and change their left-to-right order.

#### Scenario: Hiding a column
- **WHEN** a user hides a column
- **THEN** that column no longer appears in the table until re-enabled

#### Scenario: Reordering a column
- **WHEN** a user moves a column earlier or later in the order
- **THEN** the table's columns are rendered in the new order

### Requirement: Row detail expansion, including hidden columns' data
The system SHALL let a user expand an individual cluster row to reveal additional detail not shown in the main columns (at minimum: cluster ID, organization ID, project ID, Couchbase version, and storage configuration), and SHALL also show the value of any column currently hidden from the table so hiding a column never makes its data inaccessible.

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

