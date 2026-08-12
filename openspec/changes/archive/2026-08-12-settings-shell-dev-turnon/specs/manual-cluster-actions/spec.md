## MODIFIED Requirements

### Requirement: No control to reactivate a manually turned-off cluster
The system SHALL NOT provide any control to turn a cluster back on unless the "manual cluster turn-on" developer-options toggle (see dashboard-settings) is enabled; when that toggle is enabled, the system SHALL provide a manual turn-on control, subject to the other requirements in this capability.

#### Scenario: Toggle disabled (default)
- **WHEN** the manual turn-on developer-options toggle is disabled
- **THEN** no control to turn a cluster back on is shown for any cluster

#### Scenario: Toggle enabled
- **WHEN** the manual turn-on developer-options toggle is enabled
- **THEN** a manual turn-on control is available for clusters, subject to each cluster's own current state

### Requirement: Manual controls reflect current cluster state
The system SHALL show the turn-off control disabled, rather than omitting it, for a cluster whose current operational state already indicates it is turned off; SHALL show the turn-on control (when available per the developer-options toggle) disabled, rather than omitted, for a cluster whose current operational state is not turned off; and SHALL omit the turn-off, delete, and turn-on controls for a cluster that has already been deleted.

#### Scenario: Cluster already turned off
- **WHEN** a cluster's current operational state is already turned off
- **THEN** the manual turn-off control is shown but disabled, with an indication of why it is unavailable, and the manual turn-on control (when available) is shown and enabled

#### Scenario: Cluster currently on
- **WHEN** a cluster's current operational state is not turned off and the manual turn-on toggle is enabled
- **THEN** the manual turn-on control is shown but disabled, with an indication of why it is unavailable

#### Scenario: Cluster already deleted
- **WHEN** a cluster has already been deleted
- **THEN** neither the manual turn-off, delete, nor turn-on control is shown for it, even when the turn-on toggle is enabled

### Requirement: Manual action supersedes a live pending consent message
The system SHALL supersede a cluster's live pending owner-consent Slack message, if one exists, when a manual turn-off, delete, or turn-on is performed against that cluster, so the owner is not left able to act on a request about a cluster whose state has already changed.

#### Scenario: Manual turn-off with a live pending request
- **WHEN** an operator manually turns off a cluster that has a live pending consent message
- **THEN** that message is superseded and no longer accepts a decision

#### Scenario: Manual turn-on with a live pending request
- **WHEN** an operator manually turns on a cluster that has a live pending consent message
- **THEN** that message is superseded and no longer accepts a decision

### Requirement: Manual action result is surfaced without a manual page refresh
The system SHALL show the operator a clear success or failure result for a manual turn-off, delete, or turn-on immediately after it completes, and SHALL reflect the cluster's updated state in the dashboard without requiring the operator to manually refresh the page.

#### Scenario: Manual action succeeds
- **WHEN** a manual turn-off, delete, or turn-on completes successfully
- **THEN** the operator sees a success result and the dashboard reflects the cluster's new state without a manual refresh

#### Scenario: Manual action fails
- **WHEN** a manual turn-off, delete, or turn-on call fails
- **THEN** the operator sees an error result and the cluster's displayed state remains unchanged

### Requirement: No additional authorization beyond the existing dashboard session
The system SHALL NOT require any authorization for manual turn-off, delete, or turn-on beyond the operator's existing authenticated dashboard session.

#### Scenario: Any authenticated operator can act
- **WHEN** an operator is authenticated to the dashboard
- **THEN** they can use the manual turn-off, delete, and (when enabled) turn-on controls without any further permission check

### Requirement: Manual actions use the credential that discovered the cluster
When more than one configured organization entry shares an organization ID (see dashboard-settings' "Capella organizations configurable in settings"), the system SHALL perform a manual turn-off, delete, or turn-on using the specific entry whose API key actually saw that cluster during the most recent sync, not an arbitrary entry that merely shares its organization ID.

#### Scenario: Cluster's org has more than one configured entry
- **WHEN** an operator triggers a manual turn-off, delete, or turn-on for a cluster whose organization has multiple configured entries (distinct project-scoped API keys)
- **THEN** the action is performed using the entry that actually has access to that cluster's project, not a different entry that happens to share the same organization ID

## ADDED Requirements

### Requirement: Manual turn-on acts immediately, independent of owner consent
When the manual turn-on developer-options toggle is enabled, the system SHALL let an operator turn a cluster back on directly from the dashboard, performing the same underlying reactivation operation used against Capella, without requiring, waiting on, or being blocked by the absence of any owner-consent decision for that cluster.

#### Scenario: Operator turns on a cluster with no consent cycle in progress
- **WHEN** the toggle is enabled and an operator triggers a manual turn-on for a cluster that is currently off and has no active consent request
- **THEN** the cluster is turned on immediately

#### Scenario: Operator turns on a cluster with a pending consent request
- **WHEN** the toggle is enabled and an operator triggers a manual turn-on for a cluster that has a pending owner-consent request
- **THEN** the turn-on proceeds without waiting for or requiring the owner's decision

### Requirement: Turn-on requires a confirmation step via modal dialog
The system SHALL require an explicit confirmation step, presented in a modal dialog distinct from the initial control activation, before performing a manual turn-on, and SHALL leave the cluster unchanged if that confirmation is not completed.

#### Scenario: Operator confirms turn-on
- **WHEN** an operator activates the turn-on control and then confirms in the resulting modal dialog
- **THEN** the cluster is turned on

#### Scenario: Operator backs out of turn-on
- **WHEN** an operator activates the turn-on control and then cancels or dismisses the modal dialog instead of confirming
- **THEN** no turn-on is performed and the cluster's state is unchanged
