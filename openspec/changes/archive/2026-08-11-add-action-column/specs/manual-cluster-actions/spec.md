## MODIFIED Requirements

### Requirement: Turn-off requires a confirmation step via modal dialog

The system SHALL require an explicit confirmation step, presented in a modal dialog distinct from the initial control activation, before performing a manual turn-off, and SHALL leave the cluster unchanged if that confirmation is not completed.

#### Scenario: Operator confirms turn-off

- **WHEN** an operator activates the turn-off control and then confirms in the resulting modal dialog
- **THEN** the cluster is turned off

#### Scenario: Operator backs out of turn-off

- **WHEN** an operator activates the turn-off control and then cancels or dismisses the modal dialog instead of confirming
- **THEN** no turn-off is performed and the cluster's state is unchanged

### Requirement: Manual controls reflect current cluster state

The system SHALL show the turn-off control disabled, rather than omitting it, for a cluster whose current operational state already indicates it is turned off, and SHALL omit both the turn-off and delete controls for a cluster that has already been deleted.

#### Scenario: Cluster already turned off

- **WHEN** a cluster's current operational state is already turned off
- **THEN** the manual turn-off control is shown but disabled, with an indication of why it is unavailable

#### Scenario: Cluster already deleted

- **WHEN** a cluster has already been deleted
- **THEN** neither the manual turn-off nor the manual delete control is shown for it
