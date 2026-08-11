## ADDED Requirements

### Requirement: Manual consent request control disabled without an eligible owner

The system SHALL disable the manual consent-request (Ask) control for a cluster whose derived owner is absent or not email-shaped, rather than leaving it clickable and only reporting failure after activation.

#### Scenario: Owner is not email-shaped

- **WHEN** a cluster's derived owner is a raw identifier rather than an email address
- **THEN** the manual consent-request control for that cluster is shown disabled

#### Scenario: Owner is absent

- **WHEN** a cluster has no derived owner
- **THEN** the manual consent-request control for that cluster is shown disabled

#### Scenario: Owner is email-shaped

- **WHEN** a cluster's derived owner is an email address
- **THEN** the manual consent-request control for that cluster is enabled
