## MODIFIED Requirements

### Requirement: Per-cluster history timeline
The system SHALL let a user view, from a cluster's row-detail panel, a data grid of that cluster's recorded history entries in most-recent-first order, each showing what changed relative to the entry immediately before it in time (diffed chronologically, independent of display order).

#### Scenario: Viewing a cluster's timeline
- **WHEN** a user expands a cluster's row detail and opens its history
- **THEN** the system displays that cluster's history entries as a grid with the most recent entry first, each row annotated with which fields changed since the previous entry

#### Scenario: Cluster with only one recorded entry
- **WHEN** a cluster has exactly one history entry (no recorded change since it was first observed)
- **THEN** the timeline displays that single entry without indicating any change occurred
