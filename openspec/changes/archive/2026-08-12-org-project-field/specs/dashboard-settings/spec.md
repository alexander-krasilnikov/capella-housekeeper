## ADDED Requirements

### Requirement: Project visibility is shown read-only, resolved from the Capella API
The system SHALL display, for each configured organization row, a summary of which project(s) that row's API key can see, resolved live from the Capella API rather than typed by the operator. The system SHALL look up this summary whenever a row's organization ID and API key are both present, independent of whether the row has been saved yet, using the same lookup timing as the organization name.

#### Scenario: Key scoped to a single project
- **WHEN** an organization row's API key can see exactly one project
- **THEN** the settings page displays that project's real name

#### Scenario: Key scoped to the whole organization
- **WHEN** an organization row's API key can see more than one project
- **THEN** the settings page displays "All projects" rather than an arbitrary single project name

#### Scenario: No editable project field is offered
- **WHEN** the settings page displays the organizations list
- **THEN** no control lets the operator directly type or override the project summary

#### Scenario: Lookup fails
- **WHEN** the organization ID and API key don't resolve to any visible project
- **THEN** the project summary is shown as unresolved rather than blocking the rest of the form
