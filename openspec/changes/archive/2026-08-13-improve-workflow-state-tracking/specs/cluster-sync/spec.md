## MODIFIED Requirements

### Requirement: Cluster record persistence
The system SHALL persist a snapshot of each known cluster's state to local storage, as one flat collection tagged with organization and project identifiers, and SHALL append a historical snapshot entry for a cluster only when its compared fields differ from that cluster's most recently *recorded* history entry - not from whatever the live record happens to hold at the moment of comparison, which another process (a manual action, a Slack decision, the reconciliation loop) can have changed and then changed back since that history entry was written.

The fields compared for this purpose are: `config` (resource shape only - cloud provider, region, Couchbase version, node count, and node spec - see the separate `status` field below), `status` (the cluster's operational state, tracked independently of resource shape so a pure status transition is not folded into a configuration change), `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, `consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`, `snoozeCount`, `consentStatusChangedAt`, and `workflowNote`. `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, and `lastActivitySource` are excluded from the comparison and SHALL NOT, by themselves, trigger a new history entry.

#### Scenario: New cluster discovered
- **WHEN** a cluster appears in a Capella API response that is not yet in the local store
- **THEN** the system creates a new record for it tagged with its organization and project IDs, and appends its first history entry

#### Scenario: Existing cluster updated
- **WHEN** a previously known cluster's compared fields (configuration, status, actual cost, deletion status, derived owner, or any consent/lifecycle field) differ from its most recently recorded history entry
- **THEN** the system updates its stored record and appends a new historical snapshot entry

#### Scenario: Existing cluster unchanged
- **WHEN** a previously known cluster's compared fields are identical to its most recently recorded history entry, even though `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, or `lastActivitySource` differ
- **THEN** the system updates its stored record but does not append a new history entry

#### Scenario: A concurrent write elsewhere does not cause a spurious entry
- **WHEN** another process updates a cluster's live record between two sync cycles, and this sync cycle's freshly-derived state matches what that process already recorded as the cluster's most recent history entry
- **THEN** no additional history entry is appended for this cycle, even though the cluster's live record differed momentarily from what this sync cycle started with
