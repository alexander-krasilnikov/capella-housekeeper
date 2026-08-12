## MODIFIED Requirements

### Requirement: Cross-cluster lifecycle audit log
The system SHALL provide a view, separate from the per-cluster timeline, listing history entries triggered by a consent or lifecycle action - not routine configuration or cost drift - across all clusters, in reverse-chronological order, each described in plain language identifying the cluster, the action taken, and when it happened. Whether an entry counts as a lifecycle action SHALL be determined once, at the moment the entry is recorded, using the classification rules in effect at that time; it SHALL NOT be re-evaluated afterward using rules that changed later.

#### Scenario: Viewing the audit log
- **WHEN** a user opens the lifecycle audit log
- **THEN** entries from all clusters appear together, most recent first, each identifying the cluster name, the action taken, and when it occurred

#### Scenario: Routine sync-detected changes excluded
- **WHEN** a history entry's only differences from the previous one are in configuration or cost fields, with no consent/lifecycle field involved
- **THEN** that entry does not appear in the lifecycle audit log

#### Scenario: Classification rules changing later does not reclassify existing entries
- **WHEN** the set of fields that counts as a consent/lifecycle field is changed after a history entry was already recorded
- **THEN** that entry's presence or absence in the lifecycle audit log continues to reflect the rules in effect when it was recorded, not the current rules
