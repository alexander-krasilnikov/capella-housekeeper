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

## Install via npx

Requires Node.js >=22.13.0 (needed by `node:sqlite`, this app's storage layer)
and nothing else - no git clone, no `npm install`, no build step. Each
GitHub Release has a prebuilt tarball attached; run it directly:

```bash
npx https://github.com/<org>/<repo>/releases/download/<tag>/capella-housekeeper-<version>.tgz
```

(This isn't published to the public npm registry - it's only available as a
GitHub Release asset, so the full URL above is required rather than a bare
package name.)

On startup it prints the dashboard URL, the default-login reminder, and
where it's storing data:

```
Capella Housekeeper starting...
  Dashboard: http://localhost:3000
  Login:     admin / change-me - change this in Settings
  Data:      /home/you/.capella-housekeeper/data
```

By default, data lives in a stable per-user directory
(`~/.capella-housekeeper/data`) so it doesn't matter which directory you
happen to run the command from - re-running it later, from anywhere, sees
the same clusters and history. Set `CAPELLA_DATA_DIR` to use a different
location instead. `PORT` and `HOSTNAME` are also respected, same as Next's
own standalone server.

### Running it as a persistent background service

`npx` runs the process in the foreground - closing the terminal stops it.
Since this app's entire purpose is an always-on background sync + Slack
bot, you'll usually want it kept running. Two examples:

**systemd** (Linux) - `/etc/systemd/system/capella-housekeeper.service`:

```ini
[Unit]
Description=Capella Housekeeper
After=network.target

[Service]
ExecStart=/usr/bin/npx https://github.com/<org>/<repo>/releases/download/<tag>/capella-housekeeper-<version>.tgz
Restart=on-failure
User=<your-user>

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl enable --now capella-housekeeper`.

**launchd** (macOS) - `~/Library/LaunchAgents/com.capella-housekeeper.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.capella-housekeeper</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/npx</string>
    <string>https://github.com/&lt;org&gt;/&lt;repo&gt;/releases/download/&lt;tag&gt;/capella-housekeeper-&lt;version&gt;.tgz</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/com.capella-housekeeper.plist`.

## Development setup

For working on the code itself, rather than just running it (requires Node.js >=22.13.0):

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
