## ADDED Requirements

### Requirement: Dashboard credentials can be changed, confirmed by the current password
The system SHALL let an authenticated operator change the dashboard username and/or password, and SHALL require the current password to be submitted and verified before applying the change.

#### Scenario: Changing the password with correct current password
- **WHEN** an operator submits a new password along with the correct current password
- **THEN** the credential is updated and takes effect for subsequent login attempts

#### Scenario: Rejecting a change with an incorrect current password
- **WHEN** an operator submits a new password along with an incorrect current password
- **THEN** the change is rejected and the existing credential remains in effect
