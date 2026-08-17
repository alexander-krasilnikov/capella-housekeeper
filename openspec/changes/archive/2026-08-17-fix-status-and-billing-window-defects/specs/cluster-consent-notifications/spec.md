## MODIFIED Requirements

### Requirement: Turn-off is not offered when the cluster is already off
The system SHALL omit the turn-off option from a consent notification when the cluster's current operational state (independent of its age-status tier) indicates that turning it off would be redundant - either because it is already off, or because a turn-off is already in progress - even if the tier is configured to ask for turn-off.

A state indicating that a previous turn-off attempt *failed* SHALL NOT be treated as already off. Such a cluster is still running and still incurring cost, so it remains eligible to be asked about and eligible for any automatic action its tier is configured for. This distinction SHALL be drawn from the same classification of Capella's own operational states that the dashboard's status badge uses, rather than from the wording of a status's display label.

#### Scenario: Cluster already turned off
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state is already "turned off"
- **THEN** the notification does not include a turn-off option

#### Scenario: Turn-off already in progress
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state indicates a turn-off is already underway
- **THEN** the notification does not include a turn-off option, since the action being asked for is already happening

#### Scenario: A previous turn-off failed
- **WHEN** a tier configured to ask for turn-off is entered by a cluster whose current operational state indicates a previous turn-off attempt failed
- **THEN** the notification does include a turn-off option, because the cluster is still running

#### Scenario: Cluster running
- **WHEN** a tier configured to ask for turn-off is entered by a cluster that is currently running
- **THEN** the notification includes a turn-off option

### Requirement: Expiry with auto-turn-off enabled results in an automatic turn-off decision
The system SHALL, when a tier's auto-turn-off-on-inaction is enabled and that tier's ask-to-turn-off option is enabled and turning the cluster off would not be redundant (per "Turn-off is not offered when the cluster is already off"), record an approved-turnoff decision - instead of marking the request expired with no action - the moment a pending request reaches that tier's configured expiry period with no owner response. The system SHALL notify the cluster's owner that the turn-off was triggered automatically due to no response, and SHALL persist, on the cluster record, an explanation of why the decision was made automatically, for display in the dashboard and audit log.

#### Scenario: Request expires with auto-turn-off eligible
- **WHEN** a pending request for a cluster in a tier with auto-turn-off-on-inaction and ask-to-turn-off both enabled reaches its configured expiry period with no decision, and the cluster is currently running
- **THEN** an approved-turnoff decision is recorded for the cluster, its owner is notified that it happened automatically because there was no response, and the cluster record persists an explanation stating that no response was received within the configured window

#### Scenario: Expiry with ask-to-turn-off disabled for the tier
- **WHEN** a pending request expires with auto-turn-off-on-inaction enabled but that tier's ask-to-turn-off option disabled
- **THEN** the request is marked expired with no action taken, exactly as it would be without this capability

#### Scenario: Expiry when the cluster is already turned off
- **WHEN** a pending request expires with auto-turn-off eligible but the cluster's current operational state is already turned off
- **THEN** the request is marked expired with no action taken, since there is nothing left to turn off, and no automatic-turn-off notification is sent

#### Scenario: Expiry after a previous turn-off failed
- **WHEN** a pending request expires with auto-turn-off eligible for a cluster whose previous turn-off attempt failed
- **THEN** an automatic turn-off decision is recorded, because the cluster is still running and the earlier failure must not exempt it permanently

## ADDED Requirements

### Requirement: A notification remains deliverable regardless of cluster name length
Every consent notification SHALL be constructed so that it stays within the messaging platform's payload limits for any cluster name, however long. Where a limit would otherwise be exceeded, the cluster name SHALL be shortened - with a visible indication that it was shortened - in preference to omitting or truncating the explanation of what the action does.

This exists because an over-long payload is rejected wholesale, and that rejection is indistinguishable from the owner being unreachable: the operator sees only that the notification was not delivered, with nothing pointing at the name as the cause.

#### Scenario: Cluster with an unusually long name
- **WHEN** a consent notification is built for a cluster whose name is long enough that including it in full would exceed a payload limit
- **THEN** the notification is still valid and deliverable, the name appears shortened with an indication that it was shortened, and the explanation of each offered action remains complete

#### Scenario: Cluster with an ordinary name
- **WHEN** a consent notification is built for a cluster whose name is short enough to fit
- **THEN** the name appears in full, with no indication of shortening
