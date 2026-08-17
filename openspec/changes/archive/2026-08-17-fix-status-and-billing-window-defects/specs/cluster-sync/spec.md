## MODIFIED Requirements

### Requirement: Actual cost
The system SHALL retrieve the actual billed cost for each cluster from the Capella Billing API when available.

The period queried SHALL be the current calendar month to date, with both bounds of that period anchored to the same timezone (UTC), so that the reported figure does not depend on the timezone of the machine the system happens to run on. In particular, the period SHALL NOT begin before the first day of the current month, which would fold the previous month's final day into the figure.

#### Scenario: Actual cost lags behind current usage
- **WHEN** the Billing API has not yet reported usage for a recent period
- **THEN** the system retains the most recent actual cost figure available and does not block on missing recent billing data

#### Scenario: Same period regardless of host timezone
- **WHEN** the system queries actual cost while running on a machine whose local timezone is ahead of UTC, and again on one at or behind UTC
- **THEN** both runs query the same period, beginning on the first day of the current month and ending on the current day
