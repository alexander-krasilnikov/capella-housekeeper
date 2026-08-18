## ADDED Requirements

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
