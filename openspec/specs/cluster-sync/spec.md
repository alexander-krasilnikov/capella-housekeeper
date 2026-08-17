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
The system SHALL persist a snapshot of each known cluster's state to local storage, as one flat collection tagged with organization and project identifiers, and SHALL append a historical snapshot entry for a cluster only when its compared fields differ from that cluster's most recently *recorded* history entry - not from whatever the live record happens to hold at the moment of comparison, which another process (a manual action, a Slack decision, the reconciliation loop) can have changed and then changed back since that history entry was written.

The fields compared for this purpose are: `config` (resource shape only - cloud provider, region, Couchbase version, node count, and node spec - see the separate `status` field below), `status` (the cluster's operational state, tracked independently of resource shape so a pure status transition is not folded into a configuration change), `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, `consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`, `snoozeCount`, `consentStatusChangedAt`, and `workflowNote`. `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, and `lastActivitySource` are excluded from the comparison and SHALL NOT, by themselves, trigger a new history entry.

#### Scenario: New cluster discovered
- **WHEN** a cluster appears in a Capella API response that is not yet in the local store
- **THEN** the system creates a new record for it tagged with its organization and project IDs, and appends its first history entry

#### Scenario: Existing cluster updated
- **WHEN** a previously known cluster's compared fields (configuration, status, actual cost, deletion status, derived owner, or any consent/lifecycle field) differ from its most recently recorded history entry
- **THEN** the system updates its stored record and appends a new historical snapshot entry

#### Scenario: Existing cluster unchanged
- **WHEN** a previously known cluster's compared fields are identical to its most recently recorded history entry, even though `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, or `lastActivitySource` differ
- **THEN** the system updates its stored record but does not append a new history entry

#### Scenario: A concurrent write elsewhere does not cause a spurious entry
- **WHEN** another process updates a cluster's live record between two sync cycles, and this sync cycle's freshly-derived state matches what that process already recorded as the cluster's most recent history entry
- **THEN** no additional history entry is appended for this cycle, even though the cluster's live record differed momentarily from what this sync cycle started with

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

The period queried SHALL be the current calendar month to date, with both bounds of that period anchored to the same timezone (UTC), so that the reported figure does not depend on the timezone of the machine the system happens to run on. In particular, the period SHALL NOT begin before the first day of the current month, which would fold the previous month's final day into the figure.

#### Scenario: Actual cost lags behind current usage
- **WHEN** the Billing API has not yet reported usage for a recent period
- **THEN** the system retains the most recent actual cost figure available and does not block on missing recent billing data

#### Scenario: Same period regardless of host timezone
- **WHEN** the system queries actual cost while running on a machine whose local timezone is ahead of UTC, and again on one at or behind UTC
- **THEN** both runs query the same period, beginning on the first day of the current month and ending on the current day

### Requirement: Last activity tracking
The system SHALL record a last-activity timestamp for each cluster, sourced from the Capella Activity Log when reachable via the Management API, or from the sync process's own detection of state or configuration changes when the Activity Log is not reachable via the API.

#### Scenario: Activity Log reachable via API
- **WHEN** the Capella Activity Log is confirmed reachable through the Management API for a cluster
- **THEN** the system uses the timestamp of the most recent Activity Log event as that cluster's last-activity value

#### Scenario: Activity Log not reachable via API
- **WHEN** the Capella Activity Log cannot be retrieved through the Management API
- **THEN** the system falls back to the timestamp of the last state or configuration change it observed during sync, and marks the field as approximate

### Requirement: Organizations, sync interval, and retention are read from live settings
The system SHALL read the configured organizations, sync interval, and retention period from current settings at the start of each sync cycle, rather than from fixed values captured once at process start.

#### Scenario: Organization added via settings takes effect without restart
- **WHEN** an operator adds a new organization in settings after the process has started
- **THEN** that organization is polled starting from the next sync cycle, without restarting the process

#### Scenario: Sync interval change takes effect on the next cycle
- **WHEN** an operator changes the sync interval in settings
- **THEN** the next cycle is scheduled using the new interval

### Requirement: Sync tolerates zero configured organizations
The system SHALL run a sync cycle that polls nothing, without error, when zero organizations are configured, rather than failing to start.

#### Scenario: Fresh install with no organizations configured
- **WHEN** the dashboard starts with zero organizations configured
- **THEN** the sync cycle completes without error and the cluster table shows its existing empty state

### Requirement: Deletion writes a final history snapshot, not a live tombstone
The system SHALL, when a previously known cluster is no longer present in the Capella API response for its organization/project, write one history snapshot capturing its last known state stamped with the time of removal, and SHALL remove the cluster's record from the live store in the same operation rather than marking it deleted in place.

#### Scenario: Cluster removed from Capella
- **WHEN** a previously known cluster is no longer present in the Capella API response for its organization/project
- **THEN** a final history snapshot is recorded for it and its record is removed from the live store

#### Scenario: Manual deletion behaves the same as sync-detected deletion
- **WHEN** an operator manually deletes a cluster from the dashboard and the Capella delete call succeeds
- **THEN** a final history snapshot is recorded for it and its record is removed from the live store, identically to a deletion sync later discovers on its own

### Requirement: History retention is independent of deletion
The system SHALL purge a history snapshot once it is older than the configured retention period (defaulting to 7 days), regardless of whether the cluster it belongs to is still present in the live store.

#### Scenario: A deleted cluster's final snapshot ages out
- **WHEN** a cluster's final history snapshot has been recorded for longer than the configured retention period
- **THEN** that snapshot is permanently removed from history

#### Scenario: An active cluster's older snapshots age out the same way
- **WHEN** a cluster still present in the live store has history snapshots older than the configured retention period
- **THEN** those snapshots are permanently removed from history while the cluster's live record is unaffected

### Requirement: History entries are written at the moment a mutation occurs, not only during sync
The system SHALL append a change-gated history entry, tagged with the action that triggered it, at the moment any of the following mutates a cluster's compared fields outside of a sync cycle, rather than waiting for the next sync cycle to notice the change indirectly: a manual turn-off, a manual delete, a Slack consent decision, a manually-sent consent request, or a reconciliation-loop outcome.

#### Scenario: Slack consent decision recorded immediately
- **WHEN** an owner responds to a Slack consent request (approves turn-off or delete, snoozes, or the request expires unanswered)
- **THEN** a history entry reflecting the new consent state is appended at that moment, timestamped with when the decision was recorded rather than the next sync cycle's time

#### Scenario: Reconciliation outcome recorded immediately
- **WHEN** the reconciliation loop performs, skips, or fails an approved turn-off or delete action
- **THEN** a history entry reflecting that outcome is appended at that moment

#### Scenario: Manual turn-off or delete recorded immediately
- **WHEN** an operator manually turns off or deletes a cluster from the dashboard
- **THEN** a history entry reflecting the resulting state is appended at that moment, independent of the next sync cycle

#### Scenario: Manually-sent consent request recorded immediately
- **WHEN** an operator manually (re-)sends a consent request for a cluster
- **THEN** a history entry reflecting the new consent state is appended at that moment, independent of the next sync cycle

