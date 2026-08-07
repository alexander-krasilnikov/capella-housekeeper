## Purpose

Carries out a cluster turn-off or deletion once its owner has consented, re-verifying immediately beforehand that the cluster still warrants the action, and records what happened.

## ADDED Requirements

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
The system SHALL record whether an approved action was performed, skipped by re-verification, or failed, and SHALL NOT re-attempt an action already performed or skipped for the same consent cycle.

#### Scenario: Action performed
- **WHEN** a turn-off or delete action is successfully performed against Capella
- **THEN** the cluster's consent record reflects that the action was completed and is not attempted again for that cycle

#### Scenario: Action fails
- **WHEN** a turn-off or delete call to Capella fails
- **THEN** the failure is recorded and the reconciliation loop may retry it on a later pass
