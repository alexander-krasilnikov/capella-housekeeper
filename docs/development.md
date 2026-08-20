# Development

For working on the code, rather than running a release.

## Setup

Requires Node.js 22.13.0 or newer (`node:sqlite` needs it without an
experimental flag). No environment variables, no configuration file, no
external services:

```bash
git clone https://github.com/alexander-krasilnikov/capella-housekeeper
cd capella-housekeeper
npm install
npm run dev          # http://localhost:3000
```

The background loops start automatically in dev, the same as in production -
so a running dev server will poll Capella and, if Slack is configured in that
database, message real people. Development uses `./data/` rather than the
per-user directory a release uses, so it is naturally separate from an
installed instance's data.

For a production build locally: `npm run build && npm run start`.

## Checks

```bash
npm test              # Vitest, once
npm run typecheck     # tsc --noEmit
npm run test:coverage # Vitest with a coverage report
```

CI runs the type check and the coverage run on every push and every pull
request, and runs both even when the first fails, so one report covers
everything that is wrong. Both must pass to merge. Coverage is reported but
not gated on a threshold - a numeric gate on a suite this young would either
be meaningless or block legitimate work.

CI pins Node from `engines.node` in `package.json`, so the checks run on the
minimum version the package claims to support rather than whatever is newest.
Bump that field and CI follows.

### Test layering

Unit tests sit beside the module they cover. Integration tests
(`*.integration.test.ts`) use `src/test/integrationHarness.ts`, which fakes
only the two impure boundaries - the Capella HTTP client and Slack - and runs
sync, notifications, reconciliation, the store, and settings for real against
an in-memory SQLite database. Multi-cycle behaviour, consent state
transitions, and mid-cycle races are covered there, because they cannot be
observed from a unit test of any single module.

Shared fixture builders live in `src/test/factories.ts`. They are type-checked
against the real types, so a factory that drifts from `ClusterRecord` fails
`tsc` rather than quietly producing malformed fixtures.

### Changing the database schema

The schema lives in `src/lib/db.ts`. Adding or removing a column means:

1. Update the schema statements.
2. Add a migration entry for the outgoing version.
3. Bump `SCHEMA_VERSION`.
4. Freeze the outgoing schema as `src/test/__fixtures__/schema-v<N>.sql`.

Step 4 is what lets `db.migration.test.ts` verify that upgrading an old
database produces something structurally identical to a fresh one. A missing
migration entry fails *silently* at runtime - fresh installs are perfect while
every existing user's writes fail on a column that was never added - so the
test suite is the only thing standing between that mistake and someone's data.
Do not skip it.

## Cutting a release

Releases are built from a version tag; nothing is published to the public npm
registry.

```bash
# bump "version" in package.json first, then:
git tag v0.2.0
git push origin v0.2.0
```

The release workflow runs the type check and the test suite, then builds,
packages, and attaches `capella-housekeeper-<version>.tgz` to the GitHub
Release for that tag. Failing checks block publication, so a tag cannot ship
an artifact built from a state CI rejects.

The tarball is assembled by `scripts/package-release.mjs` from a separate
staging directory with a dependency-free `package.json`, so that
`npx <tarball>` uses the bundled standalone server rather than re-fetching
Next, React, and Bolt from the registry.

## Layout

```
app/                      Next.js App Router
  page.tsx                dashboard - clusters and history tabs
  actions.ts              server actions (login, settings, cluster actions)
  layout.tsx              root layout, theme bootstrap
  login/  change-password/  settings/
  components/             table, history, action buttons, shell, theme toggle

src/types.ts              shared types and DEFAULT_SETTINGS
src/lib/
  db.ts                   SQLite schema, migrations, shared connection
  store.ts                clusters and history persistence
  settings.ts             settings read/write/validate
  historyFields.ts        change detection between snapshots
  historyView.ts          history presentation

  capellaClient.ts        Capella Management API client
  rateLimiter.ts          per-key rate limiting (100 req/min)

  sync.ts                 one sync cycle: fetch, derive, tombstone
  scheduler.ts            sync loop
  recency.ts              Fresh / Aging / Old tier computation

  notifications.ts        consent cycle: transitions, reminders, expiry
  slack.ts                message construction and sending
  slackBot.ts             Socket Mode receiver for button clicks
  reconciliation.ts       acts on approved consent, every 5 minutes
  manualActions.ts        direct operator turn-off / turn-on / delete
  consentActionHealth.ts  7-day workflow health statistics

  auth.ts                 session cookie signing and verification
  clusterCounts.ts costSeries.ts configSummary.ts format.ts groupBy.ts
  theme.ts sidebarPreference.ts

src/test/                 harness, factories, frozen schema fixtures

instrumentation.ts        starts sync, reconciliation, and the Slack bot
proxy.ts                  auth gate and forced-password-change redirect
bin/capella-housekeeper.js  release launcher (Node check, data dir, startup)
scripts/package-release.mjs release tarball assembly
.github/workflows/        ci.yml, release.yml
openspec/                 specs and change proposals
docs/                     this documentation
```

## Specs

Behaviour is specified under `openspec/specs/`, one directory per capability,
and changes are proposed under `openspec/changes/` before being implemented
and archived. The spec is the contract; when code and spec disagree, one of
them is a bug. `openspec list` and `openspec validate <change>` are the entry
points.

## A note on the Next.js version

`AGENTS.md` at the repository root is generated by `next dev` and warns that
this version of Next.js differs from what a language model is likely to have
been trained on. If you are working with an AI assistant here, that file is
worth heeding: check `node_modules/next/dist/docs/` rather than assuming.
