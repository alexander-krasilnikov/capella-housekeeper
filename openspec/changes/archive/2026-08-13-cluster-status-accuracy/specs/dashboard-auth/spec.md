## ADDED Requirements

### Requirement: Login triggers a background cluster sync
The system SHALL trigger a full cluster sync immediately after a successful login, running independently of and without delaying the redirect to the dashboard.

#### Scenario: Login redirects immediately while a sync runs in the background
- **WHEN** a user submits correct credentials on the login form
- **THEN** the system establishes a session and redirects to the dashboard without waiting for a cluster sync to complete

#### Scenario: A sync already in progress is not duplicated
- **WHEN** a login-triggered sync is requested while another sync cycle (e.g. the scheduled one) is already in flight
- **THEN** the system does not run two overlapping sync cycles, and the login-triggered request is satisfied by the in-flight cycle
