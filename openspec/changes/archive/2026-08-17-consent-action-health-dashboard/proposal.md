## Why

The dashboard's stat-tile row currently leads with a raw "Total Clusters" count, but that number is already shown in three other places (the sidebar nav badge, the cluster table's row-count footer, and the filter section's "All" button) — it adds no new information. Meanwhile, the housekeeper's actual job — running clusters through a consent-then-action workflow — has no dashboard presence at all: an operator has no at-a-glance way to tell whether consent cycles are resolving normally, stalling in snooze/expiry, or whether the reconciliation loop is actually stopping/deleting clusters versus failing or being overridden by manual action. That information already exists in the data model (`consentStatus`, `consentCycleStartedAt`, the lifecycle audit log) but is only visible by digging into the history tab per cluster.

## What Changes

- **BREAKING**: Remove the "Total Clusters" stat tile from the dashboard - it duplicated the sidebar nav badge, the cluster table's row-count footer, and the age-status filter's "All" count.
- **BREAKING**: Remove the "Cluster Owners" stat tile from the dashboard.
- Add a consent-cycle funnel panel and an actions-taken panel to the same row as the Cluster Count / Daily Spend charts, not a separate section.
- Both new panels are presented as horizontal bar charts: each row is a labeled bar (scaled to that panel's own maximum) alongside its raw count - the bar is a visual aid, not a replacement for the number, so percentages/rates are still never shown.
- The funnel panel: for consent cycles that started in the last 7 days, a raw-count breakdown of how many resolved via approval, were snoozed, expired unanswered, or are still pending. (Time-to-resolution was considered and explicitly removed - see below.)
- The actions-taken panel: for stop/delete actions recorded in the last 7 days, raw counts split into exactly three categories - Auto (system-decided on snooze-limit timeout), Slack (owner decided via Slack, executed later by reconciliation), and Manual (operator acted directly through the dashboard, bypassing consent).
- Consent-cycle detection reconstructs cycles from the lifecycle audit log (start/resolution field transitions on `consentStatus`), not from the live `consentStatus` field, since a cycle that already resolved and reset to `none` within the window would otherwise be invisible.

## Capabilities

### New Capabilities
- `consent-action-health-stats`: A new dashboard section giving operators a 7-day view of consent-cycle outcomes and action-trigger attribution, computed from the existing lifecycle audit log.

### Modified Capabilities
(none — the existing stat-tile row and cluster table are unchanged; this adds a new section alongside them)

## Impact

- Affected UI: `app/components/DashboardTabs.tsx` (Total Clusters and Cluster Owners tiles both removed; the two new panels render in the same row as the remaining Cluster Count / Daily Spend charts).
- Affected data layer: a new aggregation module (alongside `src/lib/clusterCounts.ts` and `src/lib/costSeries.ts`) that reconstructs consent cycles and attributes actions from the lifecycle audit log (`src/lib/historyView.ts`, `src/lib/historyFields.ts`, `ClusterSnapshot.trigger`).
- No changes to the data model or the consent/action state machine itself — this is a read-only reporting layer over existing fields and history.
