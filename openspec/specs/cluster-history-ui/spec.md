# cluster-history-ui Specification

## Purpose
Gives operators visibility into how a cluster's state has changed over time, and a single chronological record of consent/lifecycle actions taken across all clusters - including clusters no longer present in Capella.
## Requirements
### Requirement: Per-cluster history timeline
The system SHALL let a user view, from a cluster's row-detail panel, a data grid of that cluster's recorded history entries in most-recent-first order, each showing what changed relative to the entry immediately before it in time (diffed chronologically, independent of display order).

#### Scenario: Viewing a cluster's timeline
- **WHEN** a user expands a cluster's row detail and opens its history
- **THEN** the system displays that cluster's history entries as a grid with the most recent entry first, each row annotated with which fields changed since the previous entry

#### Scenario: Cluster with only one recorded entry
- **WHEN** a cluster has exactly one history entry (no recorded change since it was first observed)
- **THEN** the timeline displays that single entry without indicating any change occurred

### Requirement: Cross-cluster lifecycle audit log
The system SHALL provide a view, separate from the per-cluster timeline, listing history entries triggered by a consent or lifecycle action - not routine configuration or cost drift - across all clusters, in reverse-chronological order, each described in plain language identifying the cluster, the action taken, and when it happened. Whether an entry counts as a lifecycle action SHALL be determined once, at the moment the entry is recorded, using the classification rules in effect at that time; it SHALL NOT be re-evaluated afterward using rules that changed later.

#### Scenario: Viewing the audit log
- **WHEN** a user opens the lifecycle audit log
- **THEN** entries from all clusters appear together, most recent first, each identifying the cluster name, the action taken, and when it occurred

#### Scenario: Routine sync-detected changes excluded
- **WHEN** a history entry's only differences from the previous one are in configuration or cost fields, with no consent/lifecycle field involved
- **THEN** that entry does not appear in the lifecycle audit log

#### Scenario: Classification rules changing later does not reclassify existing entries
- **WHEN** the set of fields that counts as a consent/lifecycle field is changed after a history entry was already recorded
- **THEN** that entry's presence or absence in the lifecycle audit log continues to reflect the rules in effect when it was recorded, not the current rules

### Requirement: Deleted clusters remain visible in history views
The system SHALL keep a deleted cluster's history entries visible in both the lifecycle audit log and its own per-cluster timeline, even though the cluster no longer appears in the live dashboard table.

#### Scenario: Viewing a deleted cluster's audit trail
- **WHEN** a cluster has been deleted, manually or sync-detected, and no longer appears in the live table
- **THEN** its lifecycle audit log entries remain visible, and its history timeline remains reachable from the audit log

### Requirement: History views respect retention
The system SHALL only display history entries that have not yet been purged under the configured retention period; it SHALL NOT imply that history exists beyond what retention currently keeps.

#### Scenario: Entry aged past retention
- **WHEN** a history entry is older than the configured retention period and has been purged
- **THEN** it no longer appears in either the per-cluster timeline or the lifecycle audit log

