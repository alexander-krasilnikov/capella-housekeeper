## ADDED Requirements

### Requirement: Reconciled actions record Capella's own in-progress status immediately
Immediately after the reconciliation loop's turn-off or delete call to Capella succeeds, the system SHALL record, as the cluster's operational status, the in-progress status value Capella itself reports for a cluster transitioning in that direction, rather than leaving the cluster's previously recorded operational status unchanged until the next independent sync cycle.

#### Scenario: Reconciled turn-off updates the operational status immediately
- **WHEN** the reconciliation loop performs an approved turn-off against Capella
- **THEN** the cluster's recorded operational status becomes Capella's in-progress "turning off" state at the moment the action succeeds, not whatever status was recorded before the action

#### Scenario: Reconciled delete updates the operational status immediately
- **WHEN** the reconciliation loop performs an approved delete against Capella
- **THEN** the cluster's recorded operational status becomes Capella's in-progress "destroying" state at the moment the action succeeds, until a later sync cycle observes the cluster is gone

#### Scenario: A skipped or failed reconciliation pass leaves the operational status untouched
- **WHEN** the reconciliation loop skips an action after re-verification or a Capella call fails
- **THEN** the cluster's recorded operational status is not changed by that pass
