## Purpose

Derives a four-tier age status for each cluster from its creation age and known activity recency, so operators can spot clusters that were likely created and then forgotten, without misflagging long-lived clusters that are still in active use.

## ADDED Requirements

### Requirement: Four-tier age status
The system SHALL classify each cluster into exactly one of four age-status tiers - "New", "Established", "Stale", or "Forgotten" - based on its age since creation and the configured `newDays`, `staleDays`, and `forgottenDays` thresholds.

#### Scenario: New cluster
- **WHEN** a cluster's age since creation is less than the configured `newDays` threshold
- **THEN** its age status is "New"

#### Scenario: Established cluster by age alone
- **WHEN** a cluster's age is at least `newDays` but less than `staleDays`
- **THEN** its age status is "Established"

#### Scenario: Stale cluster
- **WHEN** a cluster's age is at least `staleDays` but less than `forgottenDays`, and it is not held at "Established" by known recent activity
- **THEN** its age status is "Stale"

#### Scenario: Forgotten cluster
- **WHEN** a cluster's age is at least `forgottenDays`, and it is not held at "Established" by known recent activity
- **THEN** its age status is "Forgotten"

### Requirement: Known recent activity holds a cluster at Established
The system SHALL hold a cluster's age status at "Established" regardless of its age when the cluster's last-activity source is known (not unknown) and its last activity occurred within the configured `inactivityGraceDays` window.

#### Scenario: Old cluster with recent known activity stays Established
- **WHEN** a cluster is older than `staleDays`, its last-activity source is known, and its last activity occurred within `inactivityGraceDays`
- **THEN** its age status is "Established", not "Stale" or "Forgotten"

#### Scenario: Old cluster with stale known activity is not held back
- **WHEN** a cluster is older than `staleDays`, its last-activity source is known, and its last activity occurred longer ago than `inactivityGraceDays`
- **THEN** its age status is determined by age alone (may be "Stale" or "Forgotten")

### Requirement: Unknown activity does not affect tiering
The system SHALL determine a cluster's age status purely from its age, ignoring activity recency entirely, when the cluster's last-activity source is unknown.

#### Scenario: Old cluster with unknown activity source
- **WHEN** a cluster's last-activity source is unknown and its age exceeds `forgottenDays`
- **THEN** its age status is "Forgotten", regardless of whether any last-activity timestamp is present

### Requirement: Thresholds are configurable, not fixed
The system SHALL compute age-status tiers using the current `newDays`, `staleDays`, `forgottenDays`, and `inactivityGraceDays` values from dashboard settings, rather than fixed constants.

#### Scenario: Threshold change reclassifies clusters
- **WHEN** an operator changes the `staleDays` threshold in settings
- **THEN** clusters' displayed age status reflects the new threshold the next time it is computed
