# cluster-age-status Specification

## Purpose
Derives a four-tier age status for each cluster from its creation age and known activity recency, so operators can spot clusters that were likely created and then forgotten, without misflagging long-lived clusters that are still in active use.
## Requirements
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

