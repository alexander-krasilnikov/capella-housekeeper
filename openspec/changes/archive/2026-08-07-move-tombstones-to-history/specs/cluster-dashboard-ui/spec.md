## REMOVED Requirements

### Requirement: Deleted clusters remain visible during retention
**Reason**: Deletion no longer leaves a tombstone in the live store (see the cluster-sync delta) - a deleted cluster has nothing left to display. Recent deletions remain inspectable through the cluster's history instead of as a row in the live table.
**Migration**: No dashboard action needed; once a cluster's live record is removed, it simply stops appearing in the table, same as any cluster that was never in the store.
