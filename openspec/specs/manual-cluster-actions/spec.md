# manual-cluster-actions Specification

## Purpose
Lets a dashboard operator directly and immediately turn off or delete a cluster, independent of the owner-consent workflow, with confirmation friction scaled to how risky each action is.
## Requirements
### Requirement: Manual turn-off acts immediately, independent of owner consent
The system SHALL let an operator turn off a cluster directly from the dashboard, performing the same underlying turn-off operation used elsewhere against Capella, without requiring, waiting on, or being blocked by the absence of any owner-consent decision for that cluster.

#### Scenario: Operator turns off a cluster with no consent cycle in progress
- **WHEN** an operator triggers a manual turn-off for a cluster that has no active consent request
- **THEN** the cluster is turned off immediately

#### Scenario: Operator turns off a cluster with a pending consent request
- **WHEN** an operator triggers a manual turn-off for a cluster that has a pending owner-consent request
- **THEN** the turn-off proceeds without waiting for or requiring the owner's decision

### Requirement: Manual delete acts immediately, independent of owner consent
The system SHALL let an operator delete a cluster directly from the dashboard, performing the same underlying delete operation used elsewhere against Capella, without requiring, waiting on, or being blocked by the absence of any owner-consent decision for that cluster.

#### Scenario: Operator deletes a cluster with no consent cycle in progress
- **WHEN** an operator triggers a manual delete for a cluster that has no active consent request
- **THEN** the cluster is deleted immediately

### Requirement: Turn-off requires a confirmation step via modal dialog
The system SHALL require an explicit confirmation step, presented in a modal dialog distinct from the initial control activation, before performing a manual turn-off, and SHALL leave the cluster unchanged if that confirmation is not completed.

#### Scenario: Operator confirms turn-off
- **WHEN** an operator activates the turn-off control and then confirms in the resulting modal dialog
- **THEN** the cluster is turned off

#### Scenario: Operator backs out of turn-off
- **WHEN** an operator activates the turn-off control and then cancels or dismisses the modal dialog instead of confirming
- **THEN** no turn-off is performed and the cluster's state is unchanged

### Requirement: Delete requires typing the cluster's exact name to confirm
The system SHALL require an operator to type a cluster's exact name into a confirmation control before a manual delete can be submitted, and SHALL NOT allow the delete to be submitted while the typed text does not match.

#### Scenario: Typed name does not match
- **WHEN** an operator opens the delete confirmation for a cluster and types text that does not exactly match the cluster's name
- **THEN** the delete cannot be submitted

#### Scenario: Typed name matches
- **WHEN** an operator types the cluster's exact name into the delete confirmation and submits
- **THEN** the cluster is deleted

### Requirement: Manual controls reflect current cluster state
The system SHALL show the turn-off control disabled, rather than omitting it, for a cluster whose current operational state already indicates it is turned off, and SHALL omit both the turn-off and delete controls for a cluster that has already been deleted.

#### Scenario: Cluster already turned off
- **WHEN** a cluster's current operational state is already turned off
- **THEN** the manual turn-off control is shown but disabled, with an indication of why it is unavailable

#### Scenario: Cluster already deleted
- **WHEN** a cluster has already been deleted
- **THEN** neither the manual turn-off nor the manual delete control is shown for it

### Requirement: Manual action supersedes a live pending consent message
The system SHALL supersede a cluster's live pending owner-consent Slack message, if one exists, when a manual turn-off or delete is performed against that cluster, so the owner is not left able to act on a request about a cluster that has already been turned off or deleted.

#### Scenario: Manual turn-off with a live pending request
- **WHEN** an operator manually turns off a cluster that has a live pending consent message
- **THEN** that message is superseded and no longer accepts a decision

### Requirement: Manual action result is surfaced without a manual page refresh
The system SHALL show the operator a clear success or failure result for a manual turn-off or delete immediately after it completes, and SHALL reflect the cluster's updated state in the dashboard without requiring the operator to manually refresh the page.

#### Scenario: Manual action succeeds
- **WHEN** a manual turn-off or delete completes successfully
- **THEN** the operator sees a success result and the dashboard reflects the cluster's new state without a manual refresh

#### Scenario: Manual action fails
- **WHEN** a manual turn-off or delete call fails
- **THEN** the operator sees an error result and the cluster's displayed state remains unchanged

### Requirement: No control to reactivate a manually turned-off cluster
The system SHALL NOT provide any control, as part of this capability, to turn a cluster back on.

#### Scenario: Cluster manually turned off
- **WHEN** a cluster has been manually turned off
- **THEN** no control to turn it back on is shown

### Requirement: No additional authorization beyond the existing dashboard session
The system SHALL NOT require any authorization for manual turn-off or delete beyond the operator's existing authenticated dashboard session.

#### Scenario: Any authenticated operator can act
- **WHEN** an operator is authenticated to the dashboard
- **THEN** they can use the manual turn-off and delete controls without any further permission check

