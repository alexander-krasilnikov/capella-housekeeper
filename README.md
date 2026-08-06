# Capella Housekeeper

A monitoring dashboard for Couchbase Capella clusters across one or more
organizations. It polls the Capella Management API on an interval, keeps a
local history of what it finds, and shows every cluster — across every
configured org and project — in a single filterable, sortable table.

This is phase one: read-only visibility. Cleanup/governance actions (pause,
delete, notify owners, staleness rules) are intentionally out of scope for
now; see [openspec/changes/cluster-monitoring-dashboard](openspec/changes/cluster-monitoring-dashboard)
for the full proposal, design decisions, and spec this was built from.

## What it shows

For every cluster: organization, project, name, creation date, age, last
activity, owner, a compact configuration summary (e.g. `3× 4vCPU/16GB,
aws/us-east-1`), and the actual billed cost (which lags the Capella Billing
API by up to ~5 days). Clusters that
disappear from Capella are kept as a visibly "deleted" tombstone for 7 days
(configurable) before being purged, so short-lived clusters don't just
vanish from history the moment they're torn down.

## Tech stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS 4**
- **TanStack Table v8** (headless — no bundled styling) for the dashboard's sort/search, layered onto the existing Tailwind table markup
- A hand-rolled local JSON file store (`src/lib/store.ts`) — no database
  server, no ORM. At the scale this runs at (~100 clusters), a flat JSON
  file with atomic write-then-rename is simpler and lighter than adding a
  dependency for the same thing.
- A background sync loop started via Next's `instrumentation.ts` hook, so
  the poller and the web server run in the same always-on Node process.
  This only works as a single long-lived process — it is **not** compatible
  with serverless/edge deployment.
- Login/session auth via a signed cookie (`src/lib/auth.ts`), not HTTP
  Basic Auth.

## Setup

No environment variables required. Install dependencies and run:

```bash
npm install
npm run dev     # http://localhost:3000, background sync starts automatically
```

For production: `npm run build && npm run start`.

On first run the dashboard seeds default settings (`admin` / `change-me`,
1-hour sync, 7-day retention, zero organizations configured) into
`data/settings.json` and shows an empty dashboard. Log in, then go to
**Settings** to:

- Change the default username/password (requires the current password).
- Add at least one Capella organization (`orgId` + a Bearer `apiKey` with
  read access) so sync has something to poll.
- Adjust the sync interval, retention period, age-status thresholds, or the
  Capella API base URL, if needed.

Every setting takes effect on its next use (next sync cycle, next
age-status computation) without a restart. The one exception is the
session-signing secret: it's generated automatically on first run and is
never shown - Settings only offers a "Rotate" action, which logs out every
active session.

The first sync cycle runs immediately on startup, then on the configured
sync interval. Until at least one organization is configured and a cycle
completes, the dashboard shows an empty state.

## Known open risk

Whether Capella's Activity Log is reachable through the public Management
API (used here to derive "last activity" and corroborate cluster owner) was
unconfirmed at the time this was built — see `design.md` in the linked
change for details. The sync process already handles both outcomes: it
tries the Activity Log first and falls back to its own change-detection
if that call fails, so this is safe to leave as-is, but the exact endpoint
path is worth validating against a real org API key.

## Project layout

```
app/                    Next.js routes: login, dashboard, settings, server actions
src/types.ts            Shared types (ClusterRecord, Settings, etc.)
src/lib/settings.ts      All runtime configuration: read/write/validate data/settings.json
src/lib/capellaClient.ts  Capella Management API client
src/lib/rateLimiter.ts    Per-API-key rate limiting (100 req/min)
src/lib/sync.ts           One sync cycle: fetch, derive, tombstone
src/lib/scheduler.ts      Self-rescheduling sync loop, started from instrumentation.ts
src/lib/store.ts          Local JSON store: atomic writes, history, retention
src/lib/auth.ts           Session cookie signing/verification
```
