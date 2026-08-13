## ADDED Requirements

### Requirement: Manual actions record Capella's own in-progress status, not an assumed terminal one
Immediately after a manual turn-off or turn-on call to Capella succeeds, the system SHALL record, as the cluster's operational status, the in-progress status value Capella itself reports for a cluster transitioning in that direction, rather than assuming and recording the direction's terminal status before Capella has confirmed the transition is complete.

#### Scenario: Manual turn-off records the in-progress state, not the terminal one
- **WHEN** an operator confirms a manual turn-off and the Capella call succeeds
- **THEN** the cluster's recorded operational status becomes Capella's in-progress "turning off" state, not its confirmed "turned off" state

#### Scenario: Manual turn-on records the in-progress state, not the terminal one
- **WHEN** the manual turn-on toggle is enabled, an operator confirms a manual turn-on, and the Capella call succeeds
- **THEN** the cluster's recorded operational status becomes Capella's in-progress "turning on" state, not its confirmed active state

#### Scenario: A later sync confirms the terminal status
- **WHEN** a cluster sync cycle runs after a manual turn-off or turn-on has recorded an in-progress status
- **THEN** the cluster's recorded operational status is updated to whatever status Capella currently reports, which may still be in-progress or may by then be the confirmed terminal state
