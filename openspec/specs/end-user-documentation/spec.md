# end-user-documentation Specification

## Purpose

Makes the project's own documentation a checkable artifact rather than a best-effort narrative, so that someone installing and operating Capella Housekeeper from the documentation alone gets a working, correctly-configured system - and so that documentation which has drifted away from the application is a defect the project can name rather than something only discovered by a confused operator.

## Requirements

### Requirement: Documented scope matches shipped behavior
The documentation SHALL describe the set of things the application actually does, and SHALL NOT describe a capability as out of scope, planned, or unavailable when that capability ships in the current version.

#### Scenario: A shipped capability is described as out of scope
- **WHEN** the documentation states that some behavior is out of scope, deferred, or belongs to a future phase
- **AND** that behavior is present in the current version of the application
- **THEN** the documentation is defective and the statement must be corrected or removed

#### Scenario: Reader forms an accurate expectation of what the tool does
- **WHEN** a reader who has not seen the application reads its top-level description
- **THEN** they can correctly state that it both provides cross-organization cluster visibility and can take governance action on clusters - by asking owners for consent and by direct operator action - rather than concluding it is read-only

### Requirement: Every required credential is documented with its minimum permissions
For each external credential the application needs in order to function, the documentation SHALL state what the credential is, where it is obtained, where it is entered, and the minimum set of permissions or scopes it requires. Where a credential's permissions must exceed read-only because the application performs writes with it, the documentation SHALL say so explicitly.

#### Scenario: Slack credentials
- **WHEN** an operator wants to enable owner-consent notifications
- **THEN** the documentation names both credentials the feature requires, distinguishes their roles, and lists the exact scopes each one needs, such that the operator can configure the external application correctly on the first attempt without encountering a permission error

#### Scenario: Capella credential permits the actions the application performs
- **WHEN** an operator provisions a Capella API credential by following the documentation
- **THEN** the resulting credential permits every operation the application performs with it, including turning clusters off and deleting them, rather than only the read operations

#### Scenario: A credential's absence has documented consequences
- **WHEN** a required credential is left unset
- **AND** its absence disables or silently suppresses a feature the operator has otherwise enabled
- **THEN** that consequence is documented alongside the credential, rather than being discoverable only by observing that nothing happens

### Requirement: Documented commands are runnable as written
Every command, configuration file, and service definition presented in the documentation SHALL be usable as written, apart from values that are inherently specific to the reader's own environment and are visibly marked as such.

#### Scenario: No unresolved placeholder in a command
- **WHEN** the documentation presents a command intended to be run as-is
- **THEN** it contains no placeholder standing in for a value the project itself knows, such as the repository's own location

#### Scenario: Reader-specific values are marked
- **WHEN** a command necessarily contains a value only the reader can supply
- **THEN** that value is visibly marked as something to substitute, and the documentation states what to substitute for it

### Requirement: Documented locations match where the application reads and writes
Where the documentation states where configuration, data, or backups are stored, those statements SHALL match the locations the application actually uses.

#### Scenario: Documented storage location is inspectable
- **WHEN** a reader follows the documentation to inspect or back up the application's stored state
- **THEN** the location and form described are the ones the running application actually uses

#### Scenario: Configuration is documented where it is actually set
- **WHEN** the documentation directs a reader to change a configuration value
- **THEN** it directs them to the surface where that value is actually changed, and does not refer to a configuration mechanism the application no longer has

### Requirement: Settings capable of destructive action are documented as such
Any setting whose effect is that the application stops or destroys a cluster SHALL be documented as destructive at the point a reader would encounter it while deciding whether to enable it, including settings that act without an explicit human approval for the individual cluster.

#### Scenario: Action taken without an explicit per-cluster approval
- **WHEN** a setting causes the application to turn a cluster off as a consequence of an owner not responding, or of an owner exhausting a limit, rather than as a consequence of an owner approving
- **THEN** the documentation states this plainly before the reader would enable it

#### Scenario: Consent lifecycle is legible before enabling it
- **WHEN** an operator is deciding whether to enable owner-consent notifications
- **THEN** the documentation describes what an owner will receive, what triggers it, how long the request stands, what happens if it is ignored or deferred, and what the application does after an approval

### Requirement: A non-destructive operating posture is documented
The documentation SHALL describe a supported configuration in which the application takes no action against any cluster and serves only as a visibility tool, so that an operator can adopt it deliberately rather than inferring it.

#### Scenario: Operator wants visibility only
- **WHEN** an operator wants to run the application without it ever stopping or deleting a cluster
- **THEN** the documentation states which configuration achieves that, and this is presented as a supported way to run the application rather than as an earlier phase of the project

### Requirement: Upgrading an existing installation is documented
The documentation SHALL describe how to move an existing installation to a newer version, what happens to already-stored data when a newer version opens it, and what recovery material the upgrade leaves behind.

#### Scenario: Upgrade preserves existing data
- **WHEN** an operator upgrades an existing installation by following the documentation
- **THEN** the documentation has told them whether their existing clusters and history survive the upgrade, and where to find a pre-upgrade copy of their data if it does not

#### Scenario: A configuration value with a functional floor
- **WHEN** a configurable value cannot be lowered below some bound without breaking application behavior
- **THEN** the documentation states the bound and what breaks below it, rather than presenting the value as freely adjustable

### Requirement: A reader can reach a running system without reading everything
The documentation SHALL present a path from arriving at the project to a running, configured system, without requiring the reader to first read operational, workflow, or development material. Material beyond that path SHALL be reachable by a signposted reference rather than inlined into it.

#### Scenario: First-time reader installs and configures
- **WHEN** a reader arrives at the project for the first time
- **THEN** they can determine what the project is, install it, log in, and configure it far enough to see their own clusters, reading only the entry document

#### Scenario: Deeper material is signposted, not inlined
- **WHEN** a reader needs setup detail for an external integration, the semantics of the consent workflow, day-to-day operational procedure, or instructions for working on the code itself
- **THEN** the entry document points them to where that material lives instead of containing it

### Requirement: Known failure modes are documented with their causes
The documentation SHALL describe the failure modes an operator is likely to encounter during installation and configuration, each paired with its cause and its resolution.

#### Scenario: Operator hits a known failure
- **WHEN** an operator encounters a failure the project already knows about, such as an unsupported runtime version, an under-permissioned credential, or an empty dashboard before any data has been collected
- **THEN** the documentation names that failure, explains why it happens, and states what to do about it
