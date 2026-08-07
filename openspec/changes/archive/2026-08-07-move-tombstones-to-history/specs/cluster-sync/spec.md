## REMOVED Requirements

### Requirement: Deleted cluster tombstoning
**Reason**: Tombstoning a deleted cluster in the live store caused it to keep appearing in the dashboard - including with a stale, potentially contradictory age status computed from its last-known activity before deletion. Replaced by writing one final snapshot to history and removing the record from the live store immediately.
**Migration**: Any cluster already tombstoned (non-null `deletedAt`) in the live store at upgrade time is removed on the next sync cycle, after a final history snapshot is written for it if one hasn't already been captured.

### Requirement: History and tombstone retention
**Reason**: Replaced by "Deletion writes a final history snapshot, not a live tombstone" and "History retention is independent of deletion" below - retention now governs only how long a snapshot stays in history, since a deleted cluster is never visible in the live store to begin with.
**Migration**: No action needed; the requirements below cover the retained behavior (history aging out after the configured period) without a live-store tombstone to also purge.

## ADDED Requirements

### Requirement: Deletion writes a final history snapshot, not a live tombstone
The system SHALL, when a previously known cluster is no longer present in the Capella API response for its organization/project, write one history snapshot capturing its last known state stamped with the time of removal, and SHALL remove the cluster's record from the live store in the same operation rather than marking it deleted in place.

#### Scenario: Cluster removed from Capella
- **WHEN** a previously known cluster is no longer present in the Capella API response for its organization/project
- **THEN** a final history snapshot is recorded for it and its record is removed from the live store

#### Scenario: Manual deletion behaves the same as sync-detected deletion
- **WHEN** an operator manually deletes a cluster from the dashboard and the Capella delete call succeeds
- **THEN** a final history snapshot is recorded for it and its record is removed from the live store, identically to a deletion sync later discovers on its own

### Requirement: History retention is independent of deletion
The system SHALL purge a history snapshot once it is older than the configured retention period (defaulting to 7 days), regardless of whether the cluster it belongs to is still present in the live store.

#### Scenario: A deleted cluster's final snapshot ages out
- **WHEN** a cluster's final history snapshot has been recorded for longer than the configured retention period
- **THEN** that snapshot is permanently removed from history

#### Scenario: An active cluster's older snapshots age out the same way
- **WHEN** a cluster still present in the live store has history snapshots older than the configured retention period
- **THEN** those snapshots are permanently removed from history while the cluster's live record is unaffected
