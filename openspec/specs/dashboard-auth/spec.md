# dashboard-auth Specification

## Purpose
Restricts access to the dashboard to authenticated users via a login form and session, rather than leaving it open or relying on browser-native HTTP Basic Auth.
## Requirements
### Requirement: Login required for access
The system SHALL require a user to authenticate via a login form before viewing any cluster data.

#### Scenario: Unauthenticated request redirected to login
- **WHEN** an unauthenticated user requests any dashboard page
- **THEN** the system redirects them to a login page instead of showing cluster data

#### Scenario: Successful login grants access
- **WHEN** a user submits correct credentials on the login form
- **THEN** the system establishes a session and grants access to the dashboard

#### Scenario: Failed login denies access
- **WHEN** a user submits incorrect credentials on the login form
- **THEN** the system rejects the attempt and does not establish a session

### Requirement: Session-based access
The system SHALL maintain an authenticated user's access via a session, without requiring credentials to be resubmitted on every request.

#### Scenario: Subsequent requests use existing session
- **WHEN** an authenticated user with a valid session requests a dashboard page
- **THEN** the system grants access without prompting for credentials again

#### Scenario: Logout ends session
- **WHEN** an authenticated user logs out
- **THEN** their session is invalidated and subsequent requests redirect to login

### Requirement: Dashboard credentials can be changed, confirmed by the current password
The system SHALL let an authenticated operator change the dashboard username and/or password, and SHALL require the current password to be submitted and verified before applying the change.

#### Scenario: Changing the password with correct current password
- **WHEN** an operator submits a new password along with the correct current password
- **THEN** the credential is updated and takes effect for subsequent login attempts

#### Scenario: Rejecting a change with an incorrect current password
- **WHEN** an operator submits a new password along with an incorrect current password
- **THEN** the change is rejected and the existing credential remains in effect

### Requirement: Login triggers a background cluster sync
The system SHALL trigger a full cluster sync immediately after a successful login, running independently of and without delaying the redirect to the dashboard.

#### Scenario: Login redirects immediately while a sync runs in the background
- **WHEN** a user submits correct credentials on the login form
- **THEN** the system establishes a session and redirects to the dashboard without waiting for a cluster sync to complete

#### Scenario: A sync already in progress is not duplicated
- **WHEN** a login-triggered sync is requested while another sync cycle (e.g. the scheduled one) is already in flight
- **THEN** the system does not run two overlapping sync cycles, and the login-triggered request is satisfied by the in-flight cycle

### Requirement: Access is blocked behind a mandatory change while the password is still the default
The system SHALL redirect any authenticated request to a dedicated password-change page, instead of granting access to the requested route, whenever the dashboard's currently configured password equals the seeded default password - regardless of which route was requested, and regardless of whether that state came from a fresh install or an operator later resetting the password back to the default. The system SHALL exempt only the password-change page itself and its own submission action from this redirect, so the operator can actually reach and use it.

#### Scenario: First login with the default password is redirected to change it
- **WHEN** an operator logs in successfully while the dashboard password is still the seeded default
- **THEN** the request is redirected to the password-change page instead of the dashboard, and stays redirected there for any other route requested until the password is changed

#### Scenario: An existing session is also caught, not just the login moment
- **WHEN** a request carries an already-valid session established before the password was ever changed from its default
- **THEN** it is redirected to the password-change page the same as a fresh login would be

#### Scenario: Changing the password lifts the redirect
- **WHEN** the operator submits a new password (different from the seeded default) on the password-change page
- **THEN** the dashboard's password is updated and subsequent requests reach their requested route normally, with no further redirect to the password-change page

#### Scenario: Resetting the password back to the default re-triggers the redirect
- **WHEN** an operator later changes the dashboard password back to the exact seeded default value, whether via Settings or otherwise
- **THEN** subsequent requests are redirected to the password-change page again, the same as on first login

