## REMOVED Requirements

### Requirement: Table width matches its container proportionally
**Reason**: Superseded by "Table matches full container width" - direct user feedback asked for the table to use more of the main section's space, replacing viewport-dependent proportional sizing with always-full-width (see design.md Decision 6).
**Migration**: Display-only layout behavior, not persisted or user-configurable - no migration needed. See the added requirement below for current behavior.

## ADDED Requirements

### Requirement: Table matches full container width
The system SHALL size the table to the full width of its available container at every viewport width, relying on the container's own padding (not a proportional inset) to keep the table from hugging the container's edges.

#### Scenario: Table fills its container at any viewport width
- **WHEN** the dashboard is viewed at any viewport width
- **THEN** the table occupies the full width of its container, with spacing from the container's edges coming from the container's own padding rather than the table itself being narrower than its container
