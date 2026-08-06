## Why

Every piece of app configuration today lives in `.env`, read once at process boot (`src/config.ts`) - changing an org's API key, the sync interval, retention, or the dashboard password all require editing the environment and restarting the process. The age-status thresholds already moved to a UI-editable settings store; this extends the same model to the rest of configuration so the dashboard is operable entirely from its own UI, with no redeploy for any change.

## What Changes

- **BREAKING**: Remove `.env`-based configuration entirely. `src/config.ts` and all `CAPELLA_*`, `SYNC_INTERVAL_MS`, `RETENTION_DAYS`, `DASHBOARD_*`, `SESSION_SECRET` environment variables are removed. A fresh install now boots with zero environment configuration required.
- Extend the settings store (`data/settings.json`) to hold: Capella organizations (a list of `{orgId, orgName, apiKey}`, replacing `CAPELLA_ORGS`), the Capella API base URL, the sync interval (in **hours**, default **1** - replacing the millisecond-based `SYNC_INTERVAL_MS`, whose prior default was 5 minutes), the tombstone retention period in days, and the dashboard login credentials.
- Add settings-page UI sections for each of the above: an editable list of organizations (add/remove, API key masked with a reveal toggle), a sync/retention form, and a credentials form that requires the *current* password to confirm a change.
- Make the sync scheduler and cluster-sync process re-read the interval, retention period, and organization list from settings on every cycle, so edits take effect on the next cycle without a restart.
- Make sync tolerate zero configured organizations (shows an empty dashboard with a prompt to add one in Settings) instead of failing at boot the way a missing `CAPELLA_ORGS` does today.
- **Exception - not moved into the editable settings form**: the data directory location and the session-signing secret.
  - The data directory can't be *stored* in the very file it would need to be read from before knowing where that file is, so it stays a fixed path (`./data`), no longer configurable at all (env or otherwise).
  - The session secret is auto-generated on first boot and persisted in the settings store like everything else - "eliminating `.env`" applies to it too - but it is never rendered as raw, human-editable text; the settings page instead offers a "Rotate" action that generates a fresh one and invalidates all sessions. A signing secret is not a value an operator hand-types.
- Seed sensible defaults on first run (no orgs, `admin` / `change-me`, 1-hour sync, 7-day retention) so a brand-new install is immediately usable, matching the current `.env.example` defaults for username/password.

## Capabilities

### Modified Capabilities
- `dashboard-settings`: Settings expand from just the four age-status thresholds to also cover Capella organizations, API base URL, sync interval, retention period, and dashboard credentials - each with its own settings-page section and validation. The session secret is explicitly specified as auto-managed, never a raw editable field.
- `cluster-sync`: Organization credentials, sync interval, and retention period are now read from live settings rather than fixed at boot, so changes apply on the next cycle without a restart; sync also now tolerates zero configured organizations instead of failing at boot.
- `dashboard-auth`: Adds the ability to change the dashboard username/password from within the app, requiring the current password to confirm the change.

## Impact

- **Removed**: `src/config.ts`, `.env`, `.env.example`'s role as the configuration source.
- **`src/lib/settings.ts`**: `Settings` type and validation grow substantially; settings become the single source of truth for all runtime configuration.
- **`src/lib/sync.ts`, `src/lib/capellaClient.ts`**: read organizations and API base URL from settings instead of `loadOrgConfigs()`/env.
- **`src/lib/scheduler.ts`**: fixed-interval `setInterval` (captured once at boot) becomes a self-rescheduling loop that re-reads the interval from settings before each wait.
- **`src/lib/auth.ts`, `proxy.ts`**: credential verification and session-secret signing read from settings instead of env; `proxy.ts` becomes `async` (already supported - Proxy defaults to the Node.js runtime as of Next.js 16, so an async settings read on every request is safe).
- **`app/settings/page.tsx`, `app/actions.ts`**: substantial new UI and server actions for organizations, sync/retention, API base URL, and credentials.
- **No changes** to `cluster-dashboard-ui` or the age-status computation itself.
