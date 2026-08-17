## Context

See proposal.md — Why. The relevant current state for the approach:

- **Vitest 4.1.10**, global `environment: "node"`, with the two component test files opting into jsdom via a `// @vitest-environment jsdom` docblock. `@` is aliased to `./src` in both `vitest.config.mts` and `tsconfig.json`.
- **Only two impure boundaries exist in `src/lib`.** `capellaClient.ts` reaches the network via `fetch`; `db.ts`'s `getDb()` reaches disk. `slack.ts` is a third, constructing a `WebClient` per call. Everything else — `sync`, `notifications`, `reconciliation`, `manualActions`, `store`, `settings`, `historyFields`, `historyView`, `ageStatus`, `consentActionHealth` — is pure logic over those.
- **Both mocking patterns already exist in the suite.** `store.test.ts` replaces `getDb()` with a per-test `:memory:` `DatabaseSync` bootstrapped by the real `bootstrapSchema`. `manualActions.test.ts` replaces the `capellaClient` module with `vi.hoisted` fakes. They have never been combined.
- **`SCHEMA_STATEMENTS` only ever describes the latest schema.** Version 1's schema exists nowhere in the working tree — only in git history at `fed71f0`.
- **Several modules hold mutable module-level singletons**: `sync.ts`'s `cycleInFlight`, `reconciliation.ts`'s `started`, `slackBot.ts`'s `started` plus its `globalThis` status/receiver. These leak between tests sharing a module instance.
- **`applyConsentNotifications` already accepts `nowMs`** as a parameter; `runSyncCycle` does not, computing `Date.now()` internally.

## Goals / Non-Goals

**Goals:**

- One integration harness that exercises real orchestration logic against a real (in-memory) database, reusable across sync, consent, and reconciliation scenarios.
- A migration guard that requires no maintenance to keep catching future omissions.
- Test isolation that survives the module-level singletons rather than working around them per test.
- Keep the suite fast enough to stay in the CI inner loop — it is currently 1.24s.

**Non-Goals:**

- **No production code changes.** No dependency-injection refactor, no clock parameter threaded through `sync.ts`, no change to `bootstrapSchema` or `MIGRATIONS`. If a guard-rail test surfaces a genuine defect during implementation, that is a separate change.
- **No end-to-end browser tests.** No Playwright, no dev-server-under-test. Component coverage stays at the jsdom/`@testing-library` level already in use.
- **No coverage threshold.** Coverage is measured and reported; see the `automated-quality-gate` spec for why it does not gate.
- **No exhaustive component coverage.** `ClusterTable.tsx` (944 lines) is acknowledged as under-tested and deliberately not addressed here; this change targets the orchestration layer and the migration mechanism.

## Decisions

### 1. Fake at the module boundary, not at `fetch`, for integration tests

Integration tests replace the `capellaClient` module with fakes returning canned `CapellaProject` / `CapellaClusterConfig` / `ActivityLogEvent` / `BillingResult` values, and replace `getDb()` with an in-memory database. Everything between runs for real.

**Alternative considered — intercept `fetch` (or use MSW/undici):** rejected for integration tests. It would drag `capellaClient`'s own timeout, rate-limit, error-shaping, and non-JSON handling into every orchestration test, making them slower and coupling them to HTTP details that are not what the test is about.

**Instead, split the levels:** `capellaClient`'s own request handling (error-body shaping, the non-JSON base-URL diagnostic, `getBillingUsage`'s 403→`no-access` mapping, `requestNoContent`) gets a dedicated unit suite that stubs `globalThis.fetch` directly. That is the only place HTTP semantics are tested.

A useful side effect: because integration tests never reach `capellaClient`, they never reach `rateLimiter.acquireSlot`, whose `sleep` would otherwise interact badly with fake timers.

### 2. Compare introspected schema structure, never DDL text

The schema-identity check enumerates `sqlite_master` for tables and indexes, then reads `PRAGMA table_info(<table>)` and `PRAGMA index_list` / `index_info`, normalizing into a comparable structure.

**Comparing `sqlite_master.sql` strings directly would produce false failures.** SQLite implements `ALTER TABLE ... ADD COLUMN` by appending the column's definition to the *stored CREATE TABLE text*. A table that reached its shape by migration therefore has different DDL text than an identically-shaped table created fresh — different whitespace, and the appended columns land after the inline ones relative to the `PRIMARY KEY` clause. The schemas are equivalent; the text is not.

**Column order is compared as a name-keyed set, not by ordinal position.** Every read and write in `store.ts` addresses columns by name — `SELECT *` into name-keyed row objects, and named `@parameter` binds built from `CLUSTER_RECORD_COLUMNS`. Ordinal position is therefore not load-bearing, and requiring it to match would fail a migration that is functionally correct. This is a deliberate narrowing of the check, recorded here so it does not read as an oversight.

### 3. Freeze historical schemas as `.sql` fixtures, plus one golden binary database

Two fixture kinds, doing different jobs:

- **`schema-v<N>.sql`** — the `SCHEMA_STATEMENTS` of version N, verbatim, as committed text. Readable and diffable in review; used to construct a version-N database in memory for the identity check.
- **`db-v<N>.sqlite3`** — a small real database file at version N holding a handful of cluster and history rows. Used for the data-survival test, catching things a reconstructed-from-SQL fixture cannot.

The standing convention: **every `SCHEMA_VERSION` bump freezes the outgoing schema as a new `.sql` fixture.** A pointer to the fixture directory goes in the comment above `MIGRATIONS` in `db.ts`, where someone bumping the version is already reading.

**The guard holds even if that convention is forgotten.** Migrations apply in sequence, so exercising the chain from the earliest retained fixture forward runs every intermediate step. If someone adds a v3 column without `MIGRATIONS[2]`, the v1 fixture migrates 1→2→3, ends up missing that column, and the identity check fails — with no v2 fixture needed. Per-version fixtures localize the failure and enable per-version data-survival tests; they are not what makes the guarantee work.

### 4. Do not make a missing migration entry throw

`MIGRATIONS[v] ?? []` silently no-ops, and the version stamp lands regardless. Making that throw was considered and rejected.

The chained-fixture property in Decision 3 already catches this at development time, which is where it belongs. Adding a runtime throw would be a production behavior change (out of scope per the proposal), and it would fire on the *user's* machine — turning a caught-in-CI mistake into a hard startup failure with no recovery path. Detection belongs before release, not after.

### 5. Control time with fake timers, not a threaded clock

Reminder cadence, consent expiry, and snooze resumption all need controllable time. `vi.useFakeTimers()` + `vi.setSystemTime()` supplies it without touching production signatures.

**Alternative considered — thread a clock through `runSyncCycle`:** rejected as a production change for test convenience. `applyConsentNotifications` already takes `nowMs`, so the consent state machine can be driven directly with explicit times for most scenarios; fake timers are needed only where a full `runSyncCycle` must observe a specific instant.

`node:sqlite` is synchronous and holds no timers, so fake timers do not interfere with the database. Anything awaiting a real timer needs `advanceTimersByTimeAsync`.

### 6. Reset module state per test file via `vi.resetModules()` + dynamic import

`sync.ts`'s `cycleInFlight`, `reconciliation.ts`'s `started`, and `slackBot.ts`'s `started`/`globalThis` fields persist across tests in a shared module instance. `cycleInFlight` in particular would make a second `runSyncCycle()` call in the same file return the *first* test's promise.

The harness resets modules and re-imports the subject dynamically, the pattern `db.test.ts` already uses for its `CAPELLA_DATA_DIR` scenarios. `globalThis.__capellaHousekeeperSlackBotStatus` and `__capellaHousekeeperSlackReceiver` are cleared explicitly, since `resetModules` does not touch them.

### 7. Provoke the mid-cycle race with a test-controlled deferred

The stale-snapshot bug class needs a real concurrent write landing while a real sync cycle is parked mid-flight. The harness gives one faked `capellaClient` function (e.g. `getBillingUsage`) an awaitable the test controls:

```
start runSyncCycle()          → parks inside the faked call
write a consent decision      → directly against the same in-memory DB
release the deferred          → cycle resumes with its now-stale snapshot
await the cycle
assert                        → the decision survived; no duplicate history entry
```

This is the only way to cover `cluster-sync`'s existing "A concurrent write elsewhere does not cause a spurious entry" requirement, and it is what `sync.ts:341`, `reconciliation.ts:98`, `slackBot.ts:179`, and `notifications.ts:261` each describe in prose.

### 8. Mock `./slack` for orchestration tests; test it separately at the `WebClient` boundary

Integration tests replace the `slack` module, asserting on what would have been sent. `slack.ts`'s own units split three ways: pure builders (`buildConsentMessage`, `buildSnoozeModalView`, `parseSnoozeSubmission`, `slackErrorReason`, `canAutoTurnOff`, `isAlreadyOff`, `describeSnoozeAllowance`) tested directly; the send/update wrappers tested against a mocked `@slack/web-api`; `testSlackConnection`'s scope-probe interpretation tested by feeding it errors carrying each Slack error code.

The 300-character Block Kit `confirm` bound gets an explicit assertion with a long cluster name — the overrun that caused a real `invalid_blocks` failure is currently held off only by a shorter string with nothing pinning it.

### 9. Colocate integration tests with an `.integration.test.ts` suffix

Matches the repo's existing colocation and needs no new `include` pattern. Shared factories live at `src/test/factories.ts` (reachable as `@/test/factories` from both `src/lib` and `app/components` tests), replacing the four duplicate `makeRecord` definitions. Test-only modules are never imported by application code, so the Next bundler never includes them, while `tsconfig` still type-checks them.

**Alternative considered — a separate `tests/integration/` tree with a vitest `projects` split:** deferred. It buys separate environments and independent invocation, neither of which is needed yet, and costs config complexity now.

## Risks / Trade-offs

- **Golden `.sqlite3` fixture committed with an unflushed WAL would be nearly empty** → generate it with `journal_mode = DELETE` (or checkpoint and drop the sidecar) so the single committed file is complete. This is a live trap, not theoretical: the working tree's own `data/store.sqlite3` is 4 KB against a 2 MB `-wal`, so a naive copy would carry almost no data.

- **`vi.mock("./db")` from a test that imports `sync.ts` must resolve to the same module id `store.ts` imports** → Vitest keys mocks on the resolved path, and both `./db` and `@/lib/db` resolve to the same file, so this should hold. Verify it on the very first harness test rather than after building scenarios on top of it; a silent miss would mean tests quietly hitting the real `./data` database.

- **Integration tests are slower than the current 1.24s suite** → in-memory database, no network, no real timers. Accepted: some slowdown is the cost of covering the race class at all. Worth watching that it stays inside the CI inner loop.

- **The frozen-fixture convention can rot** → the chained-migration property (Decision 3) means the guard keeps firing regardless; a forgotten fixture degrades diagnosis, not detection.

- **Fake timers can mask a genuine hang** → integration tests never touch `rateLimiter`'s `sleep` (Decision 1), which is the only unbounded wait in the codebase. Keep it that way; a test that needs `acquireSlot` belongs in the `capellaClient` suite with real timers.

- **Mocking `./slack` means the orchestration tests cannot catch a malformed Block Kit payload** → that is exactly what the separate pure-builder suite covers, including the 300-character bound. The split is deliberate; the gap is closed on the other side.

- **Testing `slackBot.ts`'s handlers requires reaching closures registered on a Bolt `App`** → the handler bodies are inline in `connectSocketMode`, not exported. Options at implementation time: assert through the exported helpers those closures delegate to, or capture the registrations via a faked `App`. Prefer the former; do not refactor production code to expose them.

## Migration Plan

Phased so each phase is independently valuable and the earliest phases protect the later ones:

1. **CI gate + coverage + shared factories.** The workflow, `@vitest/coverage-v8`, the release-workflow gate, and collapsing the four `makeRecord` copies. Nothing below counts for much until the suite runs on its own.
2. **Migration fixtures + guard-rail tests.** Freeze `schema-v1.sql`, generate `db-v1.sqlite3`, add the identity / data-survival / rollback tests. Closes the live-path gap.
3. **Integration harness.** Verify the `./db` mock resolution first, then build the fake-Capella + in-memory-DB fixture and the deferred mechanism.
4. **Integration scenarios.** Multi-cycle sync, consent tier transitions, reminders, expiry, snooze resumption, the mid-cycle race.
5. **Targeted units and regressions.** `computeAgeStatus`, `auth`, `rateLimiter`, `capellaClient` HTTP paths, `slack` builders and the 300-char bound, `store` round-trip property, the schema-drift guard.

**Rollback:** everything here is additive test code plus one workflow file. If the CI workflow proves noisy, revert that file alone; the tests remain useful locally. No production code changes, so there is nothing to roll back on a user's machine.

## Open Questions

- Whether to split integration tests into a vitest `projects` configuration once there are enough of them to want independent invocation. Deferrable — it changes neither the specs nor the harness design, only how tests are launched.
- Whether per-version golden `.sqlite3` fixtures earn their keep, or whether the v1 file plus per-version `.sql` schemas suffice. Answerable once there is a second migration to write.
