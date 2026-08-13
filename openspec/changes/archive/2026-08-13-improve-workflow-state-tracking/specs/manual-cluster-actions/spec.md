## ADDED Requirements

### Requirement: Manual turn-off and turn-on clear any active consent cycle
The system SHALL clear a cluster's active consent cycle (pending, snoozed, approved-turnoff, approved-delete, or expired) back to no active cycle whenever a manual turn-off or manual turn-on is performed against that cluster, in addition to superseding its live pending consent message per the requirement above. This applies regardless of which consent status the cycle was in at the time.

#### Scenario: Manual turn-off with a pending or snoozed request
- **WHEN** an operator manually turns off a cluster that has a pending or snoozed consent request
- **THEN** the request's live message is superseded and the cluster's consent cycle resets to no active cycle, so no further reminder is sent for it

#### Scenario: Manual turn-off with an approved-but-not-yet-actioned decision
- **WHEN** an operator manually turns off a cluster that already has an approved-turnoff or approved-delete decision awaiting reconciliation
- **THEN** the cluster's consent cycle resets to no active cycle, and the reconciliation loop no longer has an approved decision to act on for that cluster

#### Scenario: Manual turn-on clears the cycle
- **WHEN** the manual turn-on toggle is enabled and an operator manually turns on a cluster with any active consent cycle
- **THEN** the cluster's consent cycle resets to no active cycle
