## ADDED Requirements

### Requirement: Reconciled actions use the credential that discovered the cluster
When more than one configured organization entry shares an organization ID (see dashboard-settings' "Capella organizations configurable in settings"), the system SHALL perform a reconciled turn-off or delete using the specific entry whose API key actually saw that cluster during the most recent sync, not an arbitrary entry that merely shares its organization ID.

#### Scenario: Cluster's org has more than one configured entry
- **WHEN** the reconciliation loop performs an approved action for a cluster whose organization has multiple configured entries (distinct project-scoped API keys)
- **THEN** the action is performed using the entry that actually has access to that cluster's project, not a different entry that happens to share the same organization ID
