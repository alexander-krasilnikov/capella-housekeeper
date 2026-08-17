# release-distribution Specification

## Purpose
Lets someone run Capella Housekeeper with a single `npx` command against a prebuilt artifact published on GitHub Releases, with no local build step, no devDependencies, and no git clone required.
## Requirements
### Requirement: Prebuilt release artifact per tag
Every version tag pushed to the repository SHALL produce a corresponding GitHub Release with a downloadable tarball artifact attached, built ahead of time so no compilation step is required on the end user's machine — provided the project's automated checks pass for that tag. A tag whose test suite or type check fails SHALL NOT produce a published artifact, so a release is never made available from a state the checks reject.

#### Scenario: Tag triggers a published artifact
- **WHEN** a version tag (e.g. `v1.2.3`) is pushed to the repository and the project's automated checks pass for it
- **THEN** a GitHub Release for that tag exists with a tarball asset attached that a user can reference directly by URL

#### Scenario: Failing checks block publication
- **WHEN** a version tag is pushed and the test suite or the type check fails for that tag
- **THEN** no tarball asset is published for it, and the release run is reported as failed

#### Scenario: Artifact requires no local build
- **WHEN** a user downloads and runs the published tarball
- **THEN** the application starts without running `next build`, without installing TypeScript/Tailwind/Vitest or any other development-only dependency, and without a git clone of the repository

### Requirement: Full application parity via npx
Running the published artifact via `npx` SHALL start the complete application - the dashboard, the background sync/reconciliation loop, and the Slack bot - equivalent to running it from source with `npm run build && npm start`.

#### Scenario: All background processes start
- **WHEN** the packaged artifact is launched
- **THEN** the dashboard becomes reachable over HTTP, the sync/reconciliation scheduler begins running on its configured interval, and the Slack bot attempts to connect (or reports itself disabled, per existing Slack-bot behavior)

#### Scenario: Existing source-based workflow is unaffected
- **WHEN** a developer runs `npm run dev`, `npm run build`, or `npm start` from a git checkout of the repository
- **THEN** the application behaves exactly as it does today, unaffected by the existence of the packaged artifact or release pipeline

### Requirement: Startup information printed to the console
On startup, the packaged artifact SHALL print the dashboard's URL, a reminder of the default login credentials (and that they should be changed), and the resolved data-directory path being used for this run.

#### Scenario: First run startup message
- **WHEN** the packaged artifact starts successfully
- **THEN** the console output includes the dashboard's URL, a note that the default login is `admin` / `change-me` and should be changed in Settings, and the absolute path of the data directory in use

### Requirement: Stable default data directory
When launched via the packaged artifact, the system SHALL default to a stable, user-specific data directory that does not depend on the current working directory the command happens to be invoked from, and SHALL allow this location to be overridden by the user.

#### Scenario: Same data directory regardless of launch location
- **WHEN** the packaged artifact is launched via `npx` from two different working directories on the same machine, with no override supplied
- **THEN** both runs resolve to the same default data directory and see the same cluster history and settings

#### Scenario: Override respected
- **WHEN** a user supplies an explicit data-directory override (via an environment variable or command-line flag)
- **THEN** the system uses that location instead of the stable default

#### Scenario: Source-based runs keep today's behavior
- **WHEN** the application is started from source via `npm run dev` or `npm start` without any override supplied
- **THEN** the data directory continues to resolve relative to the current working directory, exactly as it does today

### Requirement: Minimum supported Node version declared
The package SHALL declare its minimum supported Node.js version, consistent with the version required by its `node:sqlite`-based storage layer, so an incompatible runtime is a clear, early failure rather than an obscure crash.

#### Scenario: Declared minimum version
- **WHEN** the published package's metadata is inspected
- **THEN** it declares a minimum supported Node.js version that is known to support `node:sqlite`'s `DatabaseSync` without requiring an experimental-features flag

### Requirement: Background-persistence guidance provided
Because a directly-invoked packaged process runs in the foreground and stops when its terminal session ends, the release SHALL include documented guidance and example configuration for running it as a persistent background service on common platforms.

#### Scenario: Guidance available
- **WHEN** a user wants the application to keep running after closing their terminal or after a machine restart
- **THEN** documentation shipped with the project provides at least one working example (e.g. a systemd unit and/or a launchd agent) for running the packaged artifact as a persistent background service

### Requirement: Not published to the public npm registry
The release process SHALL NOT publish this package to the public npm registry; the tarball SHALL only be made available as a GitHub Release asset.

#### Scenario: Package unavailable via bare package name
- **WHEN** someone runs `npx capella-housekeeper` (or any variant resolving through the public npm registry) without pointing at a GitHub Release URL
- **THEN** no such package is found, since it was never published there

