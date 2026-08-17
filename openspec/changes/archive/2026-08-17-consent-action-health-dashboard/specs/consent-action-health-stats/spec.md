## Purpose

Gives operators a 7-day view of whether the consent-and-action workflow is moving clusters through normally or stalling/failing, computed from the existing lifecycle audit trail rather than raw cluster inventory counts.

## ADDED Requirements

### Requirement: Total Clusters tile is removed

The system SHALL NOT display a "Total Clusters" stat tile on the dashboard - that count is already shown by the sidebar nav badge, the cluster table's row-count footer, and the age-status filter's "All" count.

#### Scenario: Total Clusters tile absent
- **WHEN** the dashboard is viewed
- **THEN** no "Total Clusters" tile appears anywhere in the stat-tile row

### Requirement: Cluster Owners tile is removed

The system SHALL NOT display a "Cluster Owners" stat tile on the dashboard.

#### Scenario: Cluster Owners tile absent
- **WHEN** the dashboard is viewed
- **THEN** no "Cluster Owners" tile appears anywhere in the stat-tile row

### Requirement: Consent-cycle funnel and actions-taken panels share the stat-tile row

The system SHALL display a consent-cycle funnel panel and an actions-taken panel in the same row as the Cluster Count and Daily Spend charts, not in a separate section.

#### Scenario: New panels appear alongside existing stats, in the same row
- **WHEN** the dashboard is viewed at a viewport wide enough to fit all four
- **THEN** the Cluster Count chart, Daily Spend chart, consent-cycle funnel panel, and actions-taken panel all appear in a single row

### Requirement: Funnel and actions panels are presented as horizontal bar charts

The system SHALL present each outcome/category in the consent-cycle funnel panel and the actions-taken panel as a horizontal bar scaled to that panel's own maximum value, alongside its raw count - the bar is a visual aid and SHALL NOT be shown in place of the raw count.

#### Scenario: Bar length reflects relative magnitude within its own panel
- **WHEN** one outcome's count is higher than another's in the same panel
- **THEN** its bar is proportionally longer, and both outcomes still display their raw counts as numbers

### Requirement: Consent-cycle funnel reflects cycles started in the last 7 days

The system SHALL identify every consent cycle whose start falls within the trailing 7-day rolling window by detecting a transition of a cluster's `consentStatus` into `pending` from any other status in the lifecycle audit log - not only from `none` - and SHALL NOT rely on a cluster's current, live `consentStatus` value to determine whether a cycle started in that window.

#### Scenario: Cycle that already resolved within the window is still counted
- **WHEN** a cluster's consent cycle started, was approved, and the approved action was performed, all within the trailing 7 days, so the cluster's current `consentStatus` has already reset to `none`
- **THEN** that cycle is still counted in the funnel as a cycle started in the window

#### Scenario: Cycle started before the window is excluded
- **WHEN** a cluster's consent cycle started more than 7 days ago
- **THEN** that cycle is not counted in the funnel, even if it resolves within the trailing 7 days

#### Scenario: A snooze ending and re-prompting the owner counts as a new cycle start
- **WHEN** a cluster's snooze period ends and it is re-prompted at the same tier, moving `consentStatus` directly from `snoozed` to `pending` without passing through `none`
- **THEN** that transition is counted as a consent cycle starting at that moment

#### Scenario: A cancelled cycle is not counted toward any outcome
- **WHEN** an open consent cycle's `consentStatus` resets to `none` (an age-tier change or a manual turn-off/turn-on) instead of resolving into an approved, snoozed, or expired state
- **THEN** that cycle is not counted toward any funnel outcome, and does not later reappear as a "still pending" cycle

### Requirement: Funnel panel shows raw counts per outcome

The system SHALL display, for consent cycles started in the trailing 7-day window, a raw count of how many resolved via approval, how many were snoozed, how many expired without a response, and how many are still pending, using raw counts rather than percentages or rates.

#### Scenario: Mixed outcomes shown as counts
- **WHEN** 6 cycles resolved via approval, 3 were snoozed, 2 expired, and 3 are still pending
- **THEN** the funnel panel displays those four values as raw counts (6, 3, 2, 3), not as percentages

#### Scenario: No cycles started in the window
- **WHEN** no consent cycles started in the trailing 7 days
- **THEN** the funnel panel displays a count of zero for each outcome rather than omitting the panel

### Requirement: Actions-taken panel shows raw counts across exactly three categories

The system SHALL display, for stop and delete actions recorded in the lifecycle audit log within the trailing 7-day window, raw counts split across exactly three categories, labeled "Auto", "Slack", and "Manual" - system-decided on snooze-limit timeout, owner-decided via Slack and executed by reconciliation, and an operator acting directly through the dashboard, respectively.

#### Scenario: Actions split by category
- **WHEN** 5 clusters were stopped automatically on snooze-limit timeout, 2 were stopped manually, and 1 was deleted following a Slack decision, all within the trailing 7 days
- **THEN** the actions-taken panel displays "Auto: 5", "Manual: 2", and "Slack: 1" as separate raw counts, and no other category

#### Scenario: No actions recorded in the window
- **WHEN** no stop or delete actions were recorded in the trailing 7 days
- **THEN** the actions-taken panel displays a count of zero for each trigger category rather than omitting the panel
