# cluster-lifecycle-actions Specification

## Purpose
Carries out a cluster turn-off or deletion once its owner has consented, re-verifying immediately beforehand that the cluster still warrants the action, and records what happened.
## Requirements
### Requirement: Reconciliation loop acts on approved consent
The system SHALL periodically scan for clusters with an approved-turnoff or approved-delete consent outcome that has not yet been acted on, independently of the cluster-sync polling cycle.

#### Scenario: Approved cluster is picked up
- **WHEN** a cluster has an approved-turnoff or approved-delete outcome that has not been actioned
- **THEN** the reconciliation loop selects it for action on its next pass

### Requirement: Re-verify before acting
The system SHALL re-confirm, immediately before performing a turn-off or delete action, that the cluster's age status still matches the tier that triggered the original notification, and SHALL skip the action without treating it as a failure if it no longer does.

#### Scenario: Cluster still flagged at action time
- **WHEN** a cluster's age status at the moment of reconciliation still matches the tier that triggered its approved consent
- **THEN** the system performs the approved action against Capella

#### Scenario: Cluster recovered before action
- **WHEN** a cluster's age status no longer matches the tier that triggered its approved consent (e.g. renewed activity was observed since approval)
- **THEN** the system does not perform the action and does not treat this as a failure

### Requirement: Action outcome is recorded
The system SHALL record whether an approved action was performed, skipped by re-verification, or failed, and SHALL NOT re-attempt an action already performed or skipped for the same consent cycle. For a skipped or failed outcome, the system SHALL persist, on the cluster record, an explanation of why - the re-verification result for a skip, or the underlying error for a failure - for display in the dashboard and audit log.

#### Scenario: Action performed
- **WHEN** a turn-off or delete action is successfully performed against Capella
- **THEN** the cluster's consent record reflects that the action was completed and is not attempted again for that cycle

#### Scenario: Action skipped after recovery
- **WHEN** re-verification finds a cluster's age status no longer matches the tier that triggered its approved consent
- **THEN** the outcome is recorded as skipped and the cluster record persists an explanation that the cluster no longer warranted the action by the time of re-verification

#### Scenario: Action fails
- **WHEN** a turn-off or delete call to Capella fails
- **THEN** the failure is recorded, the reconciliation loop may retry it on a later pass, and the cluster record persists the underlying error as the explanation, replaced by a fresh explanation if a later retry also fails

### Requirement: Owner is notified once an approved action resolves
The system SHALL notify the cluster's derived owner via Slack once the reconciliation loop resolves an approved-turnoff or approved-delete decision for that cluster, stating whether the action was performed, skipped (the cluster no longer warranted it by the time of re-verification), or failed (and will be retried on a later pass). This applies uniformly regardless of whether the original decision was recorded from an owner's Slack click or automatically by the system on inaction, and is independent of - and in addition to - the manual-cluster-actions capability's own, separate, immediate dashboard actions, which this requirement does not cover.

#### Scenario: Action performed
- **WHEN** the reconciliation loop successfully performs an approved turn-off or delete
- **THEN** the cluster's owner is notified that the action was completed

#### Scenario: Action skipped after recovery
- **WHEN** the reconciliation loop skips an approved action because the cluster's tier no longer matches the tier that triggered the decision
- **THEN** the cluster's owner is notified that no action was taken because the cluster no longer warranted it

#### Scenario: Action fails
- **WHEN** a turn-off or delete call to Capella fails during reconciliation
- **THEN** the cluster's owner is notified that the attempt failed and will be retried

#### Scenario: No live Slack message to update
- **WHEN** an approved action resolves for a cluster with no live Slack message on record (for example, the message was already superseded by other activity)
- **THEN** the system does not send a duplicate or out-of-context notification for it

### Requirement: Reconciled actions use the credential that discovered the cluster
When more than one configured organization entry shares an organization ID (see dashboard-settings' "Capella organizations configurable in settings"), the system SHALL perform a reconciled turn-off or delete using the specific entry whose API key actually saw that cluster during the most recent sync, not an arbitrary entry that merely shares its organization ID.

#### Scenario: Cluster's org has more than one configured entry
- **WHEN** the reconciliation loop performs an approved action for a cluster whose organization has multiple configured entries (distinct project-scoped API keys)
- **THEN** the action is performed using the entry that actually has access to that cluster's project, not a different entry that happens to share the same organization ID

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

