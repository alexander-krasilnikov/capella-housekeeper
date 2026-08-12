# dashboard-shell Specification

## Purpose
Provides the persistent sidebar navigation frame - brand mark, Clusters/History view switcher, Settings link, theme toggle, and Slack connection indicator - shared across every authenticated page, so moving between views never drops the surrounding chrome or feels like leaving the application.
## Requirements
### Requirement: Persistent sidebar across authenticated pages
The system SHALL render the same sidebar (brand mark, Clusters/History view switcher, Settings link, theme toggle, and Slack connection indicator) around every authenticated page, including the settings page, rather than replacing it with a page-specific layout that omits it.

#### Scenario: Navigating to settings keeps the sidebar
- **WHEN** an operator navigates from the dashboard to the settings page
- **THEN** the same sidebar remains visible, unchanged, around the settings content

#### Scenario: Navigating back to the dashboard keeps the sidebar
- **WHEN** an operator navigates from the settings page back to the dashboard
- **THEN** the same sidebar remains visible, unchanged, around the dashboard content

### Requirement: Settings nav item reflects the active page
The system SHALL visually mark the sidebar's Settings entry as active while the settings page is open, using the same active-state styling as the Clusters/History switcher, and SHALL NOT mark the Clusters or History entries as active while on the settings page.

#### Scenario: Settings marked active
- **WHEN** an operator is on the settings page
- **THEN** the sidebar's Settings entry appears in its active state, and the Clusters/History entries do not

#### Scenario: Clusters marked active
- **WHEN** an operator is on the dashboard viewing the Clusters view
- **THEN** the sidebar's Clusters entry appears in its active state, and the Settings entry does not

### Requirement: Sidebar collapse state persists across pages
The system SHALL apply the operator's saved sidebar collapsed/expanded preference on every authenticated page, not only the dashboard.

#### Scenario: Collapsed on dashboard, then visiting settings
- **WHEN** an operator has collapsed the sidebar and navigates to the settings page
- **THEN** the sidebar remains collapsed on the settings page

#### Scenario: Expanded on settings, then returning to the dashboard
- **WHEN** an operator has expanded the sidebar while on the settings page and navigates back to the dashboard
- **THEN** the sidebar remains expanded on the dashboard
