## ADDED Requirements

### Requirement: Notification body states only a brief summary of each offered action
The system SHALL state, for each offered action in a consent notification's body, only a one-line summary of what that action does. For turn-off and delete specifically, the system SHALL NOT restate their full explanatory detail in the message body; that full detail SHALL appear only in the confirmation dialog required before the corresponding decision is recorded.

#### Scenario: Message body shows a one-line summary per offered action
- **WHEN** a consent notification is sent
- **THEN** each offered action's line in the message body states only a brief, one-line summary of what that action does

#### Scenario: Full explanation appears only at the confirmation step
- **WHEN** turn off or delete is offered on a consent notification
- **THEN** the full explanatory detail for that action appears in its confirmation dialog and is not duplicated in the message body
