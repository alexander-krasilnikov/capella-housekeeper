## MODIFIED Requirements

### Requirement: Age-status filter
The system SHALL provide a row of quick-filter buttons - one for "All" plus one per age-status tier - separate from the free-text search field, that restrict the table to rows matching the selected tier, and SHALL display, on each button, the count of clusters that would match if it were selected (computed against whatever the free-text search field already narrows the table down to).

#### Scenario: Filtering to Forgotten clusters
- **WHEN** an operator selects the "Forgotten" quick-filter button
- **THEN** only clusters whose age status is "Forgotten" are shown

#### Scenario: Clearing the filter
- **WHEN** an operator selects the "All" quick-filter button
- **THEN** clusters of all age-status tiers are shown again, subject to any other active filters

#### Scenario: Counts reflect the active search, not the age-status filter itself
- **WHEN** a search term is entered that narrows the table to a subset of clusters
- **THEN** each quick-filter button's count reflects only that narrowed subset, broken down by tier

#### Scenario: Exactly one button is active at a time
- **WHEN** the quick-filter buttons are rendered
- **THEN** exactly one of them (the selected tier, or "All") is visually distinguished as active
