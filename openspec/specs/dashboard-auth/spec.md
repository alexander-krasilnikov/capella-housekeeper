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

