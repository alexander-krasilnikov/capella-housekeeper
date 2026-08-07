## REMOVED Requirements

### Requirement: Four-tier age status
**Reason**: Replaced by a three-tier model where evidence of use (recent activity, or a cluster's own creation date when no real signal exists yet) determines "In Use" status from the first sync, rather than giving every cluster an unconditional age-based pass through two tiers before activity is ever consulted.
**Migration**: The `newDays` and `staleDays` settings are removed with no replacement; `forgottenDays` is replaced by `forgottenHours` (see the dashboard-settings delta for the migration of existing values).

### Requirement: Known recent activity holds a cluster at Established
**Reason**: Recent activity is no longer a rescue applied only once a cluster is already old enough to be Stale or Forgotten - it's the primary mechanism that determines "In Use" status for every cluster, checked from the first sync. This behavior is now the core of the "Three-tier age status" requirement below rather than a separate exception to an age-based default.
**Migration**: No action needed; the new requirement below fully covers this behavior.

## ADDED Requirements

### Requirement: Three-tier age status determined by evidence of use
The system SHALL classify each cluster into exactly one of three age-status tiers - "In Use", "Stale", or "Forgotten". A cluster is "In Use" whenever its last-known activity (real or, absent any real signal, its own creation date standing in for activity) occurred within the configured `activityGraceHours` window. A cluster that is not "In Use" is "Stale" if its age since creation is less than the configured `forgottenHours` threshold, and "Forgotten" otherwise.

#### Scenario: Cluster held In Use by recent real activity
- **WHEN** a cluster's last-activity source is known and its last activity occurred within `activityGraceHours`
- **THEN** its age status is "In Use", regardless of its age since creation

#### Scenario: Newly created cluster with no real activity signal yet
- **WHEN** a cluster has no real activity-log or audit signal and its creation date is within `activityGraceHours`
- **THEN** its age status is "In Use"

#### Scenario: Cluster becomes Stale once evidence of use lapses
- **WHEN** a cluster's last-known activity (real or creation-proxied) is older than `activityGraceHours`, and its age since creation is less than `forgottenHours`
- **THEN** its age status is "Stale"

#### Scenario: Cluster becomes Forgotten once old enough with no evidence of use
- **WHEN** a cluster's last-known activity (real or creation-proxied) is older than `activityGraceHours`, and its age since creation is at least `forgottenHours`
- **THEN** its age status is "Forgotten"

#### Scenario: Old cluster with recent known activity stays In Use
- **WHEN** a cluster's age since creation exceeds `forgottenHours`, its last-activity source is known, and its last activity occurred within `activityGraceHours`
- **THEN** its age status is "In Use", not "Stale" or "Forgotten"

## MODIFIED Requirements

### Requirement: Unknown activity does not affect tiering
The system SHALL determine a cluster's age status purely from its age since creation, ignoring activity recency (including any creation-date proxy) entirely, when the cluster's last-activity source is unknown.

#### Scenario: Old cluster with unknown activity source
- **WHEN** a cluster's last-activity source is unknown and its age exceeds `forgottenHours`
- **THEN** its age status is "Forgotten", regardless of whether any last-activity timestamp is present

### Requirement: Thresholds are configurable, not fixed
The system SHALL compute age-status tiers using the current `activityGraceHours` and `forgottenHours` values from dashboard settings, rather than fixed constants.

#### Scenario: Threshold change reclassifies clusters
- **WHEN** an operator changes the `forgottenHours` threshold in settings
- **THEN** clusters' displayed age status reflects the new threshold the next time it is computed
