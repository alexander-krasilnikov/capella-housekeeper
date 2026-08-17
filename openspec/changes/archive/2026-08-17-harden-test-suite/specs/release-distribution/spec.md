## MODIFIED Requirements

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
