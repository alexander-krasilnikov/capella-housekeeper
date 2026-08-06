# cluster-sync Specification

## Purpose
Keeps a local, queryable record of every Capella cluster across all configured organizations and projects up to date, by polling the Capella Management API and deriving fields (owner, age, cost) that the API does not provide directly.
## Requirements
### Requirement: Multi-organization polling
The system SHALL poll the Capella Management API for cluster data across every organization for which an API key is configured, and for every project within each organization.

#### Scenario: Multiple organizations configured
- **WHEN** two or more Capella organization API keys are configured
- **THEN** the system polls clusters from all configured organizations and their projects on each sync cycle

#### Scenario: Per-organization rate limit respected
- **WHEN** an organization's clusters/projects are being polled
- **THEN** the system keeps API calls for that organization's key within 100 requests per minute

### Requirement: Cluster record persistence
The system SHALL persist a snapshot of each known cluster's state to a local JSON file store after every sync cycle, as one flat collection tagged with organization and project identifiers.

#### Scenario: New cluster discovered
- **WHEN** a cluster appears in a Capella API response that is not yet in the local store
- **THEN** the system creates a new record for it tagged with its organization and project IDs

#### Scenario: Existing cluster updated
- **WHEN** a previously known cluster's configuration or state has changed since the last sync
- **THEN** the system updates its stored record and appends a historical snapshot entry

### Requirement: Owner derivation
The system SHALL derive a cluster's owner from the initiating user of that cluster's creation event, resolved to an email address when available.

#### Scenario: Owner derived from creation event
- **WHEN** a cluster's creation event with an initiating user is available
- **THEN** the system resolves that user's email address and records it as the cluster's owner

#### Scenario: Owner cannot be derived
- **WHEN** no creation-event data is available for a cluster
- **THEN** the system records the owner as unknown rather than leaving the field silently blank or guessing

### Requirement: Operational status tracking
The system SHALL record each cluster's operational status (e.g. running or turned off) as reported by the Capella API.

#### Scenario: Status reflects the API's reported state
- **WHEN** a cluster's status is included in the Capella API response
- **THEN** the system stores and displays that status alongside the cluster's other fields

#### Scenario: Status unavailable
- **WHEN** a cluster's status is not present in the API response
- **THEN** the system treats the cluster as active rather than showing a broken or blank status

### Requirement: Age computation
The system SHALL compute each cluster's age from its creation timestamp.

#### Scenario: Age reflects elapsed time
- **WHEN** a cluster record is read
- **THEN** its age is computed as the current time minus its creation timestamp

### Requirement: Actual cost
The system SHALL retrieve the actual billed cost for each cluster from the Capella Billing API when available.

#### Scenario: Actual cost lags behind current usage
- **WHEN** the Billing API has not yet reported usage for a recent period
- **THEN** the system retains the most recent actual cost figure available and does not block on missing recent billing data

### Requirement: Last activity tracking
The system SHALL record a last-activity timestamp for each cluster, sourced from the Capella Activity Log when reachable via the Management API, or from the sync process's own detection of state or configuration changes when the Activity Log is not reachable via the API.

#### Scenario: Activity Log reachable via API
- **WHEN** the Capella Activity Log is confirmed reachable through the Management API for a cluster
- **THEN** the system uses the timestamp of the most recent Activity Log event as that cluster's last-activity value

#### Scenario: Activity Log not reachable via API
- **WHEN** the Capella Activity Log cannot be retrieved through the Management API
- **THEN** the system falls back to the timestamp of the last state or configuration change it observed during sync, and marks the field as approximate

### Requirement: Deleted cluster tombstoning
The system SHALL retain a tombstoned record of a cluster's last known state when that cluster is no longer returned by the Capella API, instead of deleting the record immediately.

#### Scenario: Cluster removed from Capella
- **WHEN** a previously known cluster is no longer present in the Capella API response for its organization/project
- **THEN** the system marks its stored record as deleted and preserves its last known state and snapshot history

### Requirement: History and tombstone retention
The system SHALL purge a tombstoned cluster's record and its historical snapshots after a configurable retention period, defaulting to 7 days from the time it was marked deleted.

#### Scenario: Retention period elapsed
- **WHEN** a tombstoned cluster record has been marked deleted for longer than the configured retention period
- **THEN** the system permanently removes that record and its snapshot history from the local store

#### Scenario: Retention period not yet elapsed
- **WHEN** a tombstoned cluster record has been marked deleted for less than the configured retention period
- **THEN** the record remains visible and queryable, flagged as deleted

