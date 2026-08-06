## 1. Expand the settings model

- [x] 1.1 Extend the `Settings` type with: `capellaOrgs` (`{orgId, orgName?, apiKey}[]`), `capellaApiBaseUrl`, `syncIntervalHours`, `retentionDays`, `dashboardUsername`, `dashboardPassword`, `sessionSecret`.
- [x] 1.2 Extend default settings: `capellaOrgs: []`, `capellaApiBaseUrl` = current Capella API host, `syncIntervalHours: 1`, `retentionDays: 7`, `dashboardUsername: "admin"`, `dashboardPassword: "change-me"`. `sessionSecret` has no static default - see 1.3.
- [x] 1.3 On first read with no persisted settings, generate `sessionSecret` via `crypto.randomBytes(32).toString("hex")` and persist it as part of the seeded defaults.
- [x] 1.4 Extend validation: non-empty `capellaApiBaseUrl` parseable as an http(s) URL; each `capellaOrgs` entry has non-empty `orgId` and `apiKey`; `syncIntervalHours` and `retentionDays` positive integers; non-empty `dashboardUsername`. Reject and fall back to prior values on any violation, consistent with existing threshold validation.
- [x] 1.5 Hardcode the data directory (`./data`) directly where it's used (`src/lib/store.ts`, `src/lib/settings.ts`); do not add it to `Settings` (see design.md - it's circular).

## 2. Wire consumers to settings instead of env

- [x] 2.1 Update `src/lib/sync.ts` / `src/lib/capellaClient.ts` to read `capellaOrgs` and `capellaApiBaseUrl` from settings instead of `loadOrgConfigs()`/`config.capellaApiBaseUrl`.
- [x] 2.2 Update `src/lib/sync.ts`'s retention/purge call site to read `retentionDays` from settings instead of `config.retentionDays`.
- [x] 2.3 Make cluster sync run a no-op (0 orgs polled, no error) cycle when `capellaOrgs` is empty.
- [x] 2.4 Replace `src/lib/scheduler.ts`'s fixed `setInterval(tick, config.syncIntervalMs)` with a self-rescheduling loop: run a cycle, read the current `syncIntervalHours` from settings, `setTimeout` for that duration, repeat.
- [x] 2.5 Update `src/lib/auth.ts` to verify credentials and sign/verify session tokens against `dashboardUsername`/`dashboardPassword`/`sessionSecret` from settings instead of `config.dashboard`/`config.sessionSecret`.
- [x] 2.6 Update `proxy.ts` to `async`, reading the session secret from settings before verifying the session cookie on each request.

## 3. Credential and secret management

- [x] 3.1 Add a server action to change `dashboardUsername`/`dashboardPassword`: requires and verifies the current password (timing-safe compare) before applying the change; rejects with an error otherwise.
- [x] 3.2 Add a server action to rotate `sessionSecret`: generates a new random secret, persists it, and clears the requester's own session cookie (all other sessions become invalid on their next request since they'll fail verification).
- [x] 3.3 Ensure no code path ever sends the raw `sessionSecret` value to a rendered page or form field.

## 4. Settings page UI

- [x] 4.1 Add a "Capella organizations" section: list of configured orgs with orgId/orgName/masked-apiKey (reveal toggle), add-row and remove-row controls, saved via a server action with the validation from 1.4.
- [x] 4.2 Add an "API base URL" field to the settings page.
- [x] 4.3 Add "Sync interval (hours)" and "Retention period (days)" fields to the settings page.
- [x] 4.4 Add a "Dashboard credentials" section: current username (editable), new password, and current-password confirmation, wired to the action from 3.1.
- [x] 4.5 Add a "Session secret" section showing only that one is set (no raw value) with a "Rotate" action wired to 3.2, with copy warning that it will log the operator out.

## 5. Remove env-based configuration

- [x] 5.1 Delete `src/config.ts`; remove all remaining imports of it.
- [x] 5.2 Delete `.env` and `.env.example`. (Real Capella org credentials from `.env` were migrated into `data/settings.json` first so the live app didn't lose its org connection.)
- [x] 5.3 Update `README.md` to describe first-run setup via the settings page instead of environment variables.

## 6. Verification

- [x] 6.1 Verify a fresh install (no `data/settings.json`, no env vars) boots, seeds defaults, and the dashboard renders its empty state with zero organizations configured.
- [x] 6.2 Verify adding an organization via settings results in it being polled on the next sync cycle, without a restart.
- [x] 6.3 Verify changing the sync interval takes effect on the next scheduled cycle.
- [x] 6.4 Verify a credential change with the correct current password succeeds and the new credential is required on next login; verify a credential change with an incorrect current password is rejected and the old credential still works.
- [x] 6.5 Verify rotating the session secret invalidates the current session (requires re-login) and that the raw secret is never rendered anywhere on the settings page.
