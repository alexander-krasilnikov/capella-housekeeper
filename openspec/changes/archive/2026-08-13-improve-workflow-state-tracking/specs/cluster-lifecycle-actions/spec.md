## MODIFIED Requirements

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
