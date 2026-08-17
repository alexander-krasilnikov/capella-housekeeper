## Why

The test suite has 120 passing tests across 14 files, but coverage is concentrated in pure functions while roughly 1,900 lines of `src/lib` orchestration have none at all: `sync.ts` (420), `slackBot.ts` (437), `notifications.ts` (294), and `slack.ts` (479). The consent state machine — the code that decides which clusters get turned off and deleted — is the largest untested module, and `computeAgeStatus`, the 27-line function that classifies every cluster into the tier driving those decisions, has no direct test.

Two structural gaps make that worse than a coverage number suggests:

1. **Nothing runs the suite.** `.github/workflows/release.yml` is tag-triggered and runs only `npm ci && npm run build`. There is no push or pull-request workflow, so both `npm test` and `npm run typecheck` are honor-system, and a tag can publish a release artifact whose tests fail.

2. **The schema-migration branch has never been executed by any automated check.** `bootstrapSchema` creates everything from `SCHEMA_STATEMENTS` when `user_version` is 0 and applies `MIGRATIONS` otherwise. Fresh databases always take the first branch, so every test, CI run, and new clone skips the migration path entirely — only real users ever run it, once, on their own data.

The live v1→v2 migration was verified correct during exploration (the only schema delta is `consentStatusChangedAtMs` and `workflowNote` on `clusters` and `history`, and `MIGRATIONS[1]` adds exactly those four columns; v1 already carried `isLifecycleChange` and both indexes). No user data is at risk today. But that correctness is unverified by anything, and the mechanism has no guard rail: `MIGRATIONS[v] ?? []` turns a missing migration into a silent no-op, and the `PRAGMA user_version` stamp lands regardless — so `bootstrapSchema` early-returns forever afterward and the database is permanently wedged. Adding a column to `CLUSTER_RECORD_COLUMNS_SQL` without its migration entry would leave fresh installs flawless and break every `upsertClusters` call for existing users, discoverable only via a bug report.

Separately, this codebase's dominant bug class is documented in its own comments — `sync.ts:341`, `reconciliation.ts:98`, `slackBot.ts:179`, `notifications.ts:261` each explain at length why they re-read state immediately before writing, to avoid clobbering a concurrent Slack click. The `cluster-sync` spec already requires this behavior ("A concurrent write elsewhere does not cause a spurious entry"), yet no test interleaves a real concurrent write with a real sync cycle. That gap is structural: mocks cannot cover it, because ordering against a real store is the thing under test.

## What Changes

- **Add a CI workflow** running `npm test` and `npm run typecheck` on pushes and pull requests, and gate the existing tag-triggered release on the same suite so a failing build cannot publish an artifact.
- **Freeze historical schemas as committed fixtures** and establish the convention that every `SCHEMA_VERSION` bump snapshots the outgoing schema. `SCHEMA_STATEMENTS` only ever describes the latest schema, so verifying a migration requires the prior one to exist somewhere other than git history.
- **Add migration guard-rail tests**: a schema-identity property asserting a migrated database is structurally indistinguishable from a freshly created one; a data-survival test asserting existing rows survive with new columns defaulting to `null`; and a golden-database fixture exercising a real prior-version file.
- **Build an integration harness** that fakes only the two impure boundaries — the Capella HTTP client and `getDb()` (pointed at in-memory SQLite) — while running `sync`, `notifications`, `store`, `historyFields`, `historyView`, and `ageStatus` for real. Both mocking patterns already exist in the suite (`store.test.ts` for the database, `manualActions.test.ts` for the network); neither has been combined.
- **Add integration coverage** over multi-cycle sync behavior, the consent state machine's tier transitions, reminder and expiry advancement, snooze resumption, and the mid-cycle stale-snapshot race class the code comments describe.
- **Add targeted unit and regression tests** for high-risk, currently uncovered code: `computeAgeStatus`, `auth.ts` session signing and timing-safe comparison, `rateLimiter.ts`, `capellaClient.ts` request/error/non-JSON paths, and the Slack Block Kit 300-character confirm-text bound whose overrun caused a real `invalid_blocks` failure.
- **Add a schema-drift guard** asserting `CLUSTER_RECORD_COLUMNS` matches the keys `clusterRecordToRow` produces, plus a round-trip property over `clusterRecordToRow`/`rowToClusterRecord` covering all 35 columns and their three `null`→`undefined` coercions.
- **Extract a shared record factory.** `makeRecord` is currently duplicated across four test files and would be needed by the integration harness as a fifth.
- **Add coverage instrumentation** (`@vitest/coverage-v8`, currently not installed) so coverage is measured rather than estimated. Reported, not enforced as a threshold.

## Capabilities

### New Capabilities

- `schema-migration-safety`: How a database created by an earlier build must behave when opened by a newer one — schema equivalence with a fresh database, survival of existing rows, and the requirement that an incomplete migration fail loudly during development rather than silently stamping a version. The SQLite storage layer currently has no spec requirements of any kind; `migrate-storage-to-sqlite` only produced deltas against `cluster-history-ui`.
- `automated-quality-gate`: The requirement that the test suite and type check run automatically on every pushed branch and pull request, and that their failure blocks merge.

### Modified Capabilities

- `release-distribution`: Gains a requirement that publishing a release artifact is contingent on the test suite and type check passing. The existing workflow runs `npm run build` only, so a tag can currently ship a build whose tests fail.

## Impact

**New files**: `.github/workflows/ci.yml`; frozen schema fixtures and a golden prior-version database under a test fixtures directory; a shared record factory module; integration harness and integration test files; new unit test files for `ageStatus`, `auth`, `rateLimiter`, `capellaClient`, `slack`, and `store` round-tripping.

**Modified files**: `.github/workflows/release.yml` (gate on tests); `package.json` (add `@vitest/coverage-v8`, a coverage script); `vitest.config.mts` (coverage reporter configuration, and possibly per-directory environment handling now that both `node` and `jsdom` suites exist); the four test files currently declaring their own `makeRecord`.

**Not modified**: no application behavior changes. `bootstrapSchema` and `MIGRATIONS` are expected to remain as they are — the verified v1→v2 path is correct, and this change adds verification around it rather than altering it. If the schema-identity test surfaces a real defect during implementation, that becomes a separate fix rather than being folded in here.

**Dependencies**: one new devDependency (`@vitest/coverage-v8`). No production dependencies. No new test framework — the existing Vitest, jsdom, and `@testing-library/react` setup is sufficient.

**Ongoing obligation**: the frozen-schema-fixture convention adds a step to every future `SCHEMA_VERSION` bump. That cost is deliberate and is the point of the change.
