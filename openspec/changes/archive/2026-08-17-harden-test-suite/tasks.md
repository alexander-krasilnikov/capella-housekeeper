## 1. CI gate and suite hygiene

- [x] 1.1 Add `@vitest/coverage-v8` (matching the installed Vitest 4.x major) as a devDependency and a `test:coverage` npm script.
- [x] 1.2 Configure coverage in `vitest.config.mts`: v8 provider, text + lcov reporters, excluding test files, fixtures, `src/test/`, config files, and `.next/`. No threshold (see `automated-quality-gate` spec).
- [x] 1.3 Add `.github/workflows/ci.yml` running on `push` and `pull_request`: checkout, `setup-node` with `node-version-file: package.json`, `npm ci`, `npm run typecheck`, `npm test`. Confirm locally that a deliberately failing test fails the run, then revert the break.
- [x] 1.4 Add `npm run typecheck` and `npm test` steps to `.github/workflows/release.yml` ahead of `npm run build`, so a tag cannot publish an artifact whose checks fail.
- [x] 1.5 Create `src/test/factories.ts` exporting a `makeClusterRecord(overrides)` factory covering every `ClusterRecord` field, plus `makeSettings(overrides)` and `makeOrgConfig(overrides)`.
- [x] 1.6 Replace the duplicate local `makeRecord`/`record` definitions in `store.test.ts`, `historyFields.test.ts`, `historyView.test.ts`, and `manualActions.test.ts` with imports from `@/test/factories`. Suite passes with the same 120 test count.

## 2. Migration guard rails

- [x] 2.1 Create the test fixtures directory and freeze version 1's schema as `schema-v1.sql`, copied verbatim from `SCHEMA_STATEMENTS` at commit `fed71f0`.
- [x] 2.2 Add a `schemaSnapshot(db)` test helper: enumerate tables and indexes from `sqlite_master`, read `PRAGMA table_info` and `PRAGMA index_list`/`index_info`, and normalize into a name-keyed comparable structure. Compare introspected structure only — never `sqlite_master.sql` text (design Decision 2).
- [x] 2.3 Schema-identity test: a database built from `schema-v1.sql` and stamped at version 1, then passed through `bootstrapSchema`, produces a snapshot identical to a freshly bootstrapped database, and both report the current `SCHEMA_VERSION`.
- [x] 2.4 Generate `db-v1.sqlite3` as a golden fixture — version 1 schema, a few cluster and history rows, created with `journal_mode = DELETE` so the single committed file is complete with no `-wal` sidecar. Record the generation command alongside the fixture.
- [x] 2.5 Data-survival test: copy the golden v1 fixture to a temp path, open and `bootstrapSchema` it, then assert every pre-existing cluster record and history entry reads back with its original field values, and that `workflowNote` and `consentStatusChangedAt` read as `null`.
- [x] 2.6 Write-after-upgrade test: `upsertClusters` and `appendHistory` against a database that reached the current version by upgrade, then read back — including the columns the upgrade introduced.
- [x] 2.7 No-op test: `bootstrapSchema` on a database already at the current version applies no statements and leaves the snapshot unchanged.
- [x] 2.8 Failed-upgrade rollback test: build a version-1 database that already carries one of the columns the upgrade adds, so the real `ALTER TABLE` fails on a duplicate column name. Assert `user_version` is still 1, no other column from that upgrade was added, and a second `bootstrapSchema` call re-attempts rather than skipping. (Uses only real production code — no injected failure hook.)
- [x] 2.9 Schema-drift guard: assert `CLUSTER_RECORD_COLUMNS` deep-equals the keys `clusterRecordToRow` produces for a full record, so a new `ClusterRecord` field cannot be added without a matching column.
- [x] 2.10 Add a comment above `MIGRATIONS` in `src/lib/db.ts` pointing at the fixture directory and stating the convention: every `SCHEMA_VERSION` bump freezes the outgoing schema as a new `.sql` fixture.

## 3. Integration harness

- [x] 3.1 Before building anything on top of it: verify that `vi.mock` of the `db` module, from a test file that imports `sync.ts`, actually intercepts the `getDb()` call made inside `store.ts`. Assert the in-memory database received the write and that `./data/store.sqlite3` was never opened.
- [x] 3.2 Build `src/test/integrationHarness.ts`: a fresh `:memory:` database bootstrapped with the real `bootstrapSchema`; a fake `capellaClient` module with programmable per-org, per-project, and per-cluster responses (`listProjects`, `listClusters`, `getOrganization`, `getUser`, `getActivityLog`, `getBillingUsage`, `turnOffCluster`, `deleteCluster`, and a real `CapellaApiError`); a fake `slack` module recording every send and update; seeded settings; and `vi.resetModules()` plus dynamic re-import of the subject under test.
- [x] 3.3 Add a deferred-gate utility to the harness so a test can park a chosen faked `capellaClient` call mid-cycle and release it on demand (design Decision 7).
- [x] 3.4 Add harness cleanup for `globalThis.__capellaHousekeeperSlackBotStatus` and `__capellaHousekeeperSlackReceiver`, which `vi.resetModules()` does not clear.
- [x] 3.5 Smoke test: one `runSyncCycle` over one org with one project and one cluster persists one record and one history entry, and the returned `SyncResult` counts match.

## 4. Integration scenarios

- [x] 4.1 An unchanged cluster observed across many consecutive cycles accumulates exactly one history entry, not one per cycle.
- [x] 4.2 A newly discovered cluster gets a record and a first history entry, with its owner resolved from `audit.createdBy` via the users lookup and that lookup cached across multiple clusters in a single cycle.
- [x] 4.3 A cluster that disappears from a fully-synced org gets one final history snapshot carrying `deletedAt` and is removed from the live table; a pre-existing tombstone is swept once and reuses its original `deletedAt`.
- [x] 4.4 When one project's cluster listing fails, the org is not marked fully synced: its other clusters are untouched, none are treated as deleted, and the org appears in `failedOrgIds`.
- [x] 4.5 Activity resolution precedence: activity log first, then `audit.modifiedAt`, then sync-observed fingerprint comparison — including that an unchanged fingerprint preserves the prior `lastActivityAt` and source.
- [x] 4.6 When billing is unavailable, the prior amount and `asOf` are carried forward with the appropriate `unavailableReason` set.
- [x] 4.7 A tier transition into a notifying tier opens a consent cycle: `pending`, cycle-start and status-changed timestamps set, tier recorded, and a DM sent to an email-shaped owner.
- [x] 4.8 A tier transition while a cycle is live resets every consent field and supersedes the live Slack message before re-asking.
- [x] 4.9 Reminders fire on the evenly spaced schedule across the expiry window, `remindersSent` advances once per due reminder, and never exceeds `consentReminderMax`.
- [x] 4.10 Expiry with auto-turn-off eligible records `approved-turnoff` with the reason note; expiry without it records `expired` and supersedes the message.
- [x] 4.11 A snooze that has elapsed re-asks at the same tier, resetting `remindersSent` but preserving `snoozeCount`; when the tier no longer notifies, the cycle returns to `none`.
- [x] 4.12 Mid-cycle race: a Slack decision written while a cycle is parked survives that cycle's final upsert, and no duplicate history entry is produced — covering `cluster-sync`'s existing "A concurrent write elsewhere does not cause a spurious entry" scenario end to end.
- [x] 4.13 Mid-cycle race, other direction: a cycle whose own consent logic genuinely changed a record keeps that change rather than adopting the on-disk value.
- [x] 4.14 Reconciliation against the real store: an approved decision whose tier still matches is performed and writes the transitional status; a tier that has changed is skipped; a removed org config fails and stays eligible for retry.
- [x] 4.15 History older than `retentionDays` is purged during a cycle, for active and deleted clusters alike.

## 5. Targeted unit and regression tests

- [x] 5.1 `computeAgeStatus`: activity within grace holds "In Use"; an `unknown` activity source is ignored entirely; the `forgottenHours` boundary separates "Stale" from "Forgotten"; boundary values are exact, not off by one.
- [x] 5.2 `clusterRecordToRow` → `rowToClusterRecord` round-trip property over a spread of records, covering every nullable field and all three `null`→`undefined` coercions (`orgConfigId`, `actualCost.unavailableReason`, `workflowNote`).
- [x] 5.3 `auth`: token round-trips; a tampered signature, a wrong-length signature, a malformed payload, and an expired token all reject; `verifyCredentials` returns false when no password is stored; rotating the session secret invalidates a previously issued token.
- [x] 5.4 `rateLimiter`: permits up to the per-window cap, blocks beyond it, keeps separate budgets per API key, and releases once the window slides (fake timers).
- [x] 5.5 `capellaClient` request handling against a stubbed `fetch`: JSON error bodies shaped into the thrown message, the non-JSON response producing the base-URL diagnostic, 403 mapping to `no-access`, a null `totalCurrencySpend` mapping to `credits-based`, `requestNoContent` accepting a bodyless 202, and `listProjects`/`listClusters` falling back to an empty array on missing `data`.
- [x] 5.6 `slack` message builders: offered actions follow `tierConfig`, turn-off is suppressed when the cluster is already off, reminder and initial headings differ, and the no-response consequence reflects auto-turn-off eligibility plus the extra "Forgotten" clause.
- [x] 5.7 Regression: the Block Kit `confirm` dialog's text stays within Slack's 300-character limit even with a long cluster name — the overrun that caused a real `invalid_blocks` failure.
- [x] 5.8 `parseSnoozeSubmission`: unparseable metadata, missing/zero/negative days, and a blank or whitespace-only justification each return null; a valid submission parses correctly.
- [x] 5.9 `slackErrorReason`: extracts a Slack `data.error` code, falls back to an `Error` message, and stringifies anything else.
- [x] 5.10 `sendConsentDM` and `updateMessage` against a mocked `@slack/web-api` `WebClient`: each failure stage (lookup, conversation open, post) returns `ok: false` with its stage-prefixed reason, and a missing id or timestamp is treated as a failure rather than a success.
- [x] 5.11 `testSlackConnection`: `missing_scope` reported as a failure while any other error on a made-up target is reported as the scope being present, per check, including `users_not_found` being the success case for the email lookup.
- [x] 5.12 `notifications` helpers: `isEmailLike` accepts and rejects correctly, `resolveTierConfig` returns the "In Use" manual default with `autoTurnOffOnInaction` false, and `supersedeLiveMessage` no-ops when channel, timestamp, or bot token is absent.

## 6. Verification

- [x] 6.1 Full suite and typecheck green. Record the test count and coverage figure before and after this change.
- [x] 6.2 Confirm no test opens the real `./data/store.sqlite3` — assert it via the harness canary from task 3.1 and by checking the working tree's database is unmodified after a full run.
- [ ] 6.3 Open a pull request and confirm the CI workflow runs on it, that a deliberately failing test blocks it, and that the release workflow's added gate behaves the same way on a throwaway tag.
  - **Outstanding at archive time.** Both gates were verified locally instead (task 1.3): a failing test exits 1 and a type error exits 2, so either fails its workflow step. What remains unverified is GitHub-side behaviour — that the `on: push` / `on: pull_request` triggers actually fire and that a failed run blocks the PR. That needs a branch pushed to the remote, and the release half needs a throwaway tag, which would trigger a real Release run. Left for whoever pushes this first; the workflow files themselves are complete and YAML-validated.
