## Purpose

Lets a user choose whether the dashboard renders in light, dark, or the browser's system-preferred theme, and keeps that choice in effect across page loads and future visits.

## ADDED Requirements

### Requirement: Theme selection
The system SHALL provide a control, accessible from the dashboard, that lets a user choose between Light, Dark, or System theme.

#### Scenario: Selecting Light
- **WHEN** a user selects "Light"
- **THEN** the dashboard renders in the light theme regardless of the browser's OS-level preference

#### Scenario: Selecting Dark
- **WHEN** a user selects "Dark"
- **THEN** the dashboard renders in the dark theme regardless of the browser's OS-level preference

#### Scenario: Selecting System
- **WHEN** a user selects "System"
- **THEN** the dashboard renders in whichever theme matches the browser's current OS-level preference, and switches automatically if that OS-level preference changes

### Requirement: Theme preference persists across sessions
The system SHALL remember a user's theme selection across page reloads and future visits, without requiring the user to reselect it each time.

#### Scenario: Reloading preserves the selected theme
- **WHEN** a user selects a theme, then reloads the page
- **THEN** the dashboard renders in the previously selected theme

#### Scenario: Returning later preserves the selected theme
- **WHEN** a user selects a theme, closes the browser, and returns on a later visit
- **THEN** the dashboard renders in the previously selected theme

### Requirement: Correct theme applies on first paint
The system SHALL render the previously selected Light or Dark theme (if one was selected) on the very first paint of a page load, without first rendering the other theme and then switching.

#### Scenario: No flash of the wrong theme
- **WHEN** a user with a previously selected Dark theme loads any page
- **THEN** the page's first rendered frame is already in the Dark theme, with no visible flash of the Light theme beforehand

### Requirement: Theme changes apply immediately
The system SHALL apply a newly selected theme to the current page immediately, without a full page reload.

#### Scenario: Switching theme while viewing the dashboard
- **WHEN** a user changes the theme selection
- **THEN** the currently displayed page updates to the new theme without reloading

### Requirement: Semantic status colors remain distinct from the theme's brand accent
The system SHALL render semantic status indicators (age status, operational status, consent status, and action outcomes) using colors that remain visually distinct from the theme's brand accent color, in both the Light and Dark themes.

#### Scenario: Status colors distinguishable from brand accent in either theme
- **WHEN** the dashboard is viewed in either the Light or Dark theme
- **THEN** status indicators (e.g. "Forgotten" age status, a destructive action's styling) remain visually distinguishable from the brand accent used for primary actions and navigation
