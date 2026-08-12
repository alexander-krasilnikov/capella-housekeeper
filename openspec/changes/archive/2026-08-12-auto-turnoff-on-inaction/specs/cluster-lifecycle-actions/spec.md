## ADDED Requirements

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
