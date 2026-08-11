## MODIFIED Requirements

### Requirement: Cluster record persistence
The system SHALL persist a snapshot of each known cluster's state to a local JSON file store, as one flat collection tagged with organization and project identifiers, and SHALL append a historical snapshot entry for a cluster only when its compared fields differ from that cluster's most recently recorded history entry.

The fields compared for this purpose are: `config`, `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, `consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, and `consentCycleStartedAt`. `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, and `lastActivitySource` are excluded from the comparison and SHALL NOT, by themselves, trigger a new history entry.

#### Scenario: New cluster discovered
- **WHEN** a cluster appears in a Capella API response that is not yet in the local store
- **THEN** the system creates a new record for it tagged with its organization and project IDs, and appends its first history entry

#### Scenario: Existing cluster's compared fields changed
- **WHEN** a previously known cluster's compared fields (configuration, actual cost, deletion status, derived owner, or any consent/lifecycle field) differ from its most recently recorded history entry
- **THEN** the system updates its stored record and appends a new historical snapshot entry

#### Scenario: Existing cluster unchanged
- **WHEN** a previously known cluster's compared fields are identical to its most recently recorded history entry, even though `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, or `lastActivitySource` differ
- **THEN** the system updates its stored record but does not append a new history entry

## ADDED Requirements

### Requirement: History entries are written at the moment a mutation occurs, not only during sync
The system SHALL append a change-gated history entry, tagged with the action that triggered it, at the moment any of the following mutates a cluster's compared fields outside of a sync cycle, rather than waiting for the next sync cycle to notice the change indirectly: a manual turn-off, a manual delete, a Slack consent decision, a manually-sent consent request, or a reconciliation-loop outcome.

#### Scenario: Slack consent decision recorded immediately
- **WHEN** an owner responds to a Slack consent request (approves turn-off or delete, snoozes, or the request expires unanswered)
- **THEN** a history entry reflecting the new consent state is appended at that moment, timestamped with when the decision was recorded rather than the next sync cycle's time

#### Scenario: Reconciliation outcome recorded immediately
- **WHEN** the reconciliation loop performs, skips, or fails an approved turn-off or delete action
- **THEN** a history entry reflecting that outcome is appended at that moment

#### Scenario: Manual turn-off or delete recorded immediately
- **WHEN** an operator manually turns off or deletes a cluster from the dashboard
- **THEN** a history entry reflecting the resulting state is appended at that moment, independent of the next sync cycle

#### Scenario: Manually-sent consent request recorded immediately
- **WHEN** an operator manually (re-)sends a consent request for a cluster
- **THEN** a history entry reflecting the new consent state is appended at that moment, independent of the next sync cycle
