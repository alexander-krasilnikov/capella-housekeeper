## Purpose
Makes the project's automated checks run on their own, on every proposed change, so that a regression is caught by the repository rather than by whoever remembers to run the suite locally.

## ADDED Requirements

### Requirement: Checks run automatically on every proposed change
The repository SHALL run its test suite and its type check automatically on every push to a branch and on every pull request, without anyone having to trigger them.

#### Scenario: Push triggers the checks
- **WHEN** a commit is pushed to any branch of the repository
- **THEN** the test suite and the type check both run automatically, and their results are visible on that commit

#### Scenario: Pull request triggers the checks
- **WHEN** a pull request is opened, or new commits are pushed to an existing one
- **THEN** the test suite and the type check both run automatically against the proposed merge result, and their results are visible on the pull request

#### Scenario: Checks run on the declared minimum Node version
- **WHEN** the automated checks run
- **THEN** they run on the Node.js version the package declares as its minimum supported version, so an incompatibility with that version is caught rather than hidden by a newer local runtime

### Requirement: A failing check blocks the change
A failing test suite or type check SHALL be reported as a failure that blocks merging, not as advisory output that can be overlooked.

#### Scenario: Failing test fails the run
- **WHEN** any test in the suite fails during an automated run
- **THEN** the run is reported as failed, and the pull request is not presented as ready to merge

#### Scenario: Type error fails the run
- **WHEN** the type check reports an error during an automated run
- **THEN** the run is reported as failed, independently of whether the test suite passed

### Requirement: Coverage is measured and reported
The automated checks SHALL produce a test-coverage measurement for the run, so that coverage of the codebase is an observed figure rather than an estimate.

Coverage is reported, not enforced against a threshold: a numeric gate on a suite this young would either be set so low as to be meaningless or would block legitimate work, whereas a visible figure supports the judgement calls about where to add tests next.

#### Scenario: Coverage reported for a run
- **WHEN** the automated checks complete
- **THEN** a coverage measurement for the run is available to whoever is reviewing the change

#### Scenario: Coverage does not gate the run
- **WHEN** a run's coverage measurement is lower than a previous run's
- **THEN** that alone does not fail the run
