## REMOVED Requirements

### Requirement: Row grouping with aggregation
**Reason**: Product decision - grouping added state and rendering complexity to the table that isn't wanted going forward.
**Migration**: None required. Grouping was opt-in (default: ungrouped) and its state was never persisted across sessions, so every view of the table was already ungrouped by default. The table now always shows the flat, ungrouped list it showed before anyone chose to group it.
