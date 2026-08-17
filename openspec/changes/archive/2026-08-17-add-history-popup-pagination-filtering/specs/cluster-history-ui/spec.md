## ADDED Requirements

### Requirement: Per-cluster history timeline pagination and filtering
The system SHALL let a user page through a cluster's history timeline in fixed-size pages (with a page-size selector) rather than showing every recorded entry at once, and SHALL let the user filter the timeline with a single search query that matches against any of the entry's displayed fields (date, trigger/event, and changed-field values). Filtering SHALL be applied before pagination, so the displayed page count and "Showing X-Y of Z" footer reflect only the entries that match the current query.

#### Scenario: Timeline with more entries than one page
- **WHEN** a cluster's history timeline has more entries than the selected page size
- **THEN** the grid displays only the current page of entries, with Prev/Next controls and a "Showing X-Y of Z" footer reflecting the total entry count

#### Scenario: Changing the page size
- **WHEN** a user selects a different page size from the page-size control
- **THEN** the grid re-paginates using the new page size, keeping the entry currently at the top of the page visible rather than jumping back to the first page

#### Scenario: Filtering the timeline
- **WHEN** a user enters a search query in the timeline's filter field
- **THEN** the grid displays only entries where the query matches the date, trigger/event, or a changed-field value, and the pagination footer reflects the filtered count

#### Scenario: Filter query changes while viewing a later page
- **WHEN** a user changes or clears the filter query while viewing a page other than the first
- **THEN** the grid returns to the first page of the newly filtered (or unfiltered) result set

#### Scenario: Filter matches no entries
- **WHEN** a user's filter query matches none of the cluster's history entries
- **THEN** the grid displays an empty state instead of any rows, and the pagination footer reflects zero results
