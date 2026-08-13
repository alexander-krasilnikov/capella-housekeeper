## ADDED Requirements

### Requirement: History views state the system's own explanation when one was recorded
The system SHALL, for a history entry where the cluster record carries a persisted explanation for the transition it reflects (an automatic turn-off, a reconciliation skip or failure), display that explanation - both in the per-cluster history timeline and in the cross-cluster lifecycle audit log - instead of only a generic description derived from the changed field's value. An entry with no persisted explanation (an owner's own Slack decision, a manual dashboard action, a routine reset) SHALL continue to show its existing generic description unchanged.

#### Scenario: Timeline entry for a system-driven transition
- **WHEN** a cluster's history timeline includes an entry for an automatic turn-off, a reconciliation skip, or a reconciliation failure
- **THEN** that entry displays the persisted explanation recorded at the time, not only the generic "auto turn-off" / "skipped" / "failed" label

#### Scenario: Audit log entry for a system-driven transition
- **WHEN** the cross-cluster lifecycle audit log includes an entry for an automatic turn-off, a reconciliation skip, or a reconciliation failure
- **THEN** that entry's description includes the persisted explanation recorded at the time

#### Scenario: Entry with no persisted explanation
- **WHEN** a history entry reflects an owner's Slack decision, a manual dashboard action, or a routine tier-change reset, none of which record an explanation
- **THEN** that entry displays its existing generic description, unchanged from today

### Requirement: History tracks operational status separately from configuration
The system SHALL track and display a cluster's operational status as a field distinct from its configuration (resource shape - cloud provider, region, Couchbase version, node count, node spec), so a history entry where only the operational status changed is labeled and described as a status change, not as a configuration change.

#### Scenario: Only the operational status changed
- **WHEN** a cluster's operational status changes (e.g. "Turned Off" to "Turning On") while its resource shape stays the same
- **THEN** the history entry shows a "Status" field change, not a "Configuration" field change

#### Scenario: Resource shape changed
- **WHEN** a cluster's resource shape changes (e.g. node count) independent of its operational status
- **THEN** the history entry shows a "Configuration" field change, not a "Status" field change

#### Scenario: Both changed in the same entry
- **WHEN** a single history entry reflects both a resource-shape change and an operational-status change
- **THEN** the entry shows both a "Configuration" field change and a "Status" field change, each describing only its own aspect
