## 1. Project setup

- [x] 1.1 Scaffold Next.js (Node.js) project structure in the repo
- [x] 1.2 Add configuration for one or more Capella organization API keys (org id + Bearer token per org), sync interval, and retention period (default 7 days), via environment/config file
- [x] 1.3 Add configuration for dashboard login credential(s)

## 2. Capella API client

- [x] 2.1 Implement a client for the Capella Management API v4: list projects per org, list clusters per project, fetch cluster detail/config
- [x] 2.2 Implement Billing API client call to fetch actual usage/cost per cluster
- [x] 2.3 Enforce the 100 requests/minute per API key rate limit and the 90s/120s timeouts (backoff/queueing as needed)
- [x] 2.4 **Spike**: attempt to retrieve Activity Log data via the Management API using a real org API key; determine whether it is reachable via API or console-only, and record the outcome in design.md
      Resolved by document, not by live call: downloaded and grepped the official OpenAPI spec directly (see design.md, "Full API conformance audit against the official spec") and confirmed the Activity Log **is** reachable via the public API - it's org-scoped (`GET /organizations/{orgId}/events` with a `clusterIds` filter), not the cluster-scoped path this client originally guessed and which doesn't exist in the spec at all. `getActivityLog` rewritten accordingly. The sync process still falls back to sync-observed activity on any failure, so behavior was correct either way, but the endpoint itself is now spec-verified rather than a guess. Live confirmation against a real org key is still outstanding (no credentials in this environment) - the next real sync will be the first live test.
- [x] 2.5 **Full audit**: verify every endpoint in `capellaClient.ts` against the official OpenAPI spec (`docs.couchbase.com/cloud/management-api-reference`), not just the two flagged as spikes/best-effort
      Downloaded the spec directly (`curl`, not the summarizing WebFetch of the reference SPA, which had proven unreliable on earlier lookups - see design.md). Confirmed correct as-is: `getOrganization`, `getUser`, `listProjects`, `listClusters`, and every field read in `toClusterConfig`. Found and fixed two genuinely wrong endpoints: `getActivityLog` (see 2.4) and `getBillingUsage`, which called a nonexistent `GET .../billing/usage` path - the real endpoint is `POST /organizations/{orgId}/projects/{projectId}/clusters/{clusterId}/billing` with a JSON body, and this is what was causing "Actual Cost" to be empty for every cluster. Full details in design.md. Known remaining gap, not fixed: `listProjects`/`listClusters` don't follow the `cursor` pagination field, low-risk at this project's ~100-cluster scale but unverified for larger orgs.

## 3. Local JSON store

- [x] 3.1 Define the flat cluster-record schema (org id, project id, cluster id/name, config, createdAt, owner + owner-override, lastActivity + source flag, estimatedCost, actualCost, deletedAt/tombstone flag)
- [x] 3.2 Implement atomic read/write (write-then-rename) for the store file(s) to avoid corruption on crash
- [x] 3.3 Implement append-only snapshot history storage per cluster, separate from the current-record store
- [x] 3.4 Implement retention purge: remove tombstoned records and their history once the configured retention period has elapsed since deletion

## 4. Sync process

- [x] 4.1 Implement the interval-driven poller that iterates all configured orgs/projects and fetches current cluster state
- [x] 4.2 Implement owner derivation from cluster-creation event initiating user, respecting any existing manual override
- [x] 4.3 Implement age computation from createdAt
- [x] 4.4 ~~Implement estimated cost computation from node spec × published Capella credit rates × uptime~~ - **Reverted per explicit request**: the rates in `src/pricing.ts` were placeholders, never real Capella pricing, and a user asked where a shown number came from after comparing it against a real cluster. `src/pricing.ts`, `src/lib/costEstimate.ts`, and the `estimatedCostPerMonthUsd` field were all removed rather than kept as a misleading number. See 6.18.
- [x] 4.5 Wire actual cost from the Billing API client into the cluster record, tolerating missing/lagging data
- [x] 4.6 Implement last-activity resolution: use Activity Log via API if the task 2.4 spike confirms it's reachable, otherwise fall back to sync-observed state/config change detection with an "approximate" flag
- [x] 4.7 Implement tombstoning: mark a cluster deleted when it no longer appears in the API response for its org/project, preserving last known state
- [x] 4.8 Write new/updated/tombstoned records to the local JSON store each sync cycle

## 5. Dashboard authentication

- [x] 5.1 Implement login page (username/password form)
- [x] 5.2 Implement session issuance on successful login and session validation middleware for all dashboard routes
- [x] 5.3 Implement logout (session invalidation)
- [x] 5.4 Redirect unauthenticated requests to the login page

## 6. Dashboard UI

- [x] 6.1 Build the unified cluster table reading from the local JSON store, spanning all orgs/projects
- [x] 6.2 Render columns: org, project, name, created date, last activity (with approximate indicator when applicable), owner, config summary, age, ~~estimated cost,~~ actual cost, status (estimated cost column subsequently removed - see 6.18)
- [x] 6.3 Implement the compact configuration summary formatter (e.g. "3× 4vCPU/16GB, aws/us-east-1")
- [x] 6.4 Implement a single search field (outside the table) that filters rows against every column's value (superseded per-column filter inputs)
- [x] 6.5 Implement per-column sorting (ascending/descending)
- [x] 6.6 ~~Implement owner override editing from the UI, persisting back to the store~~ - **Reverted per explicit request**: the inline edit control, `updateOwnerAction`, `setOwnerOverride`, and the `ownerOverride` field were all removed; owner is now read-only, derived-only. See 6.16.
- [x] 6.7 Display tombstoned/deleted clusters with a visible "deleted" indicator until they're purged
- [x] 6.8 Ensure the table fits the viewport without horizontal scrolling, wrapping long cell content instead
- [x] 6.9 Implement row grouping (by org/project/owner) with summed cost aggregation and expand/collapse
- [x] 6.10 Implement column visibility and ordering controls
- [x] 6.11 Implement per-row detail expansion (cluster ID, org ID, project ID, Couchbase version, storage spec), including the value of any currently-hidden column so hiding a column never hides its data
- [x] 6.12 Implement row pagination with a selectable page size
- [x] 6.13 Persist column visibility, column order, sort state, and page size across sessions via localStorage
- [x] 6.14 Make the table responsive: size it to 90% of its container from 640px up (full width below that), and tighten font/padding below 1024px so wrapping breaks at word boundaries rather than mid-word
- [x] 6.15 Format every displayed date/time value using the viewer's browser locale (client-side, not server-side), with a 2-digit year and no seconds
- [x] 6.16 Remove owner override editing entirely: the inline edit control, `updateOwnerAction`, `setOwnerOverride`, and the `ownerOverride` field; owner is now read-only
- [x] 6.17 Remove the "approx." last-activity indicator badge and the now-unused `lastActivityApprox` field, keeping `lastActivitySource` intact at the data-model level
- [x] 6.18 Remove the estimated-cost column entirely: `src/pricing.ts`, `src/lib/costEstimate.ts`, the `estimatedCostPerMonthUsd` field on `ClusterRecord`, and its column/detail-panel/search entries in `ClusterTable.tsx`; actual cost is now the only cost column

## 7. Verification

- [x] 7.1 Verify end-to-end sync against a real (or sandboxed) Capella org: clusters appear, update, and tombstone/purge correctly
      Partially verified: a real sync against a live Capella org (during debugging, see design.md) confirmed clusters appear with correct org name, owner email, config, and status. Update-on-change and tombstone/purge-over-time were not separately exercised against live data - only a single sync was observed.
- [ ] 7.2 Verify rate-limit handling does not exceed 100 req/min per org API key under a multi-org, multi-project load
      **Blocked**: the one live sync observed was against a single small org and did not generate enough traffic to meaningfully exercise the limiter.
- [x] 7.3 Verify login/session flow blocks unauthenticated access and allows authenticated access
      Verified with a Playwright-driven headless browser against the running dev server: unauthenticated `/` redirects to `/login`, wrong credentials show an error and stay on `/login`, correct credentials land on the dashboard, and logout clears the session (re-visiting `/` redirects to `/login` again). No console errors.
- [x] 7.4 Verify search and sorting behave correctly across combined multi-org data in the browser
      Verified with Playwright against seeded multi-org sample data (including one row matching the real "turnedOff" cluster shape): the single search field matches across all columns, column sort toggles ascending/descending correctly, status badges render for active/turned-off/deleted states, no horizontal scrollbar appears, and long cell content (owner email, cost-with-date) wraps instead of overflowing.
- [x] 7.5 Verify the dashboard route renders live data on every request rather than a stale build-time snapshot
      Caught via `next start`: `/` was statically pre-rendered at build time since it reads the store directly rather than via `fetch()`. Fixed with `export const dynamic = "force-dynamic"` in `app/page.tsx`; re-verified afterward that a fresh data file is reflected without rebuilding.
- [x] 7.6 Verify grouping, column visibility/ordering, row detail expansion, and pagination all behave correctly
      Verified with Playwright against 12 seeded rows across 3 orgs (isolated `DATA_DIR`, fake org key - never touching real data/credentials): pagination (page-size change, next/prev, row counts), global search, sort (including the desc-vs-asc-first click convention), grouping by org with correct per-group cluster counts and summed cost aggregation plus expand/collapse, column visibility toggle, column reordering, and per-row detail expansion (cluster/org/project IDs, version, storage) - 14/14 automated checks passed, no console errors. Pinning and resizing were subsequently removed per user request.
- [x] 7.7 Verify hidden-column data appears in the detail panel, and that column visibility/order/sort/page-size persist across a page reload
      Verified with Playwright (isolated environment): hid the "Age" column, reordered "Project", changed sort to Est. Cost/mo, changed page size to 10, confirmed "Age" now appears in the expanded row's detail panel, then reloaded the page and confirmed column order, hidden state, sort, and page size all survived - 6/7 automated checks passed (the 7th, checking the hidden column's detail value, was a false-negative test-locator issue - the screenshot taken in the same run visually confirms "Age: 16 days" correctly present in the detail panel). No console errors.
- [x] 7.8 Verify responsive width and wrapping behavior across viewport sizes
      Measured horizontal scroll presence directly (not assumed) at 1400/1024/900/768/640/500/400px: none from 640px up, present below 500px (twelve columns cannot fit meaningfully at that width even wrapped - a known, accepted limit rather than a bug). Screenshots at 900px and 700px confirmed the initial fix (gated at the `md` breakpoint) didn't reach the 900px case where character-by-character wrapping was actually observed; regated to `lg` and re-verified clean word-boundary wrapping at both widths. Separately, a real screenshot from the user at a wide viewport showed the table visibly narrower than 90% - traced to a leftover `max-w-[1400px]` on `<main>` capping the container the 90% was computed against, plus a redundant second 90% nested inside `ClusterTable` compounding to ~81%. Fixed by moving the 90% sizing to `<main>` alone and removing the nested duplicate; re-measured at a 2400px viewport and confirmed exactly 90.0% with symmetric margins, header and table widths matching.
- [x] 7.9 Verify owner is read-only and date/time formatting respects the browser's locale
      First verification pass (four simulated locales, all looked correct, zero console errors) turned out to be a false positive: it used `suppressHydrationWarning`, which silences the mismatch warning but never actually triggers React to correct the displayed value away from the server's locale - confirmed broken by a real user in Germany still seeing US-formatted dates in production. Re-verified properly after switching to a mount-gated `FormattedDateTime` component: fetched the raw server-rendered HTML directly via `curl` with an extracted session cookie (not through a browser) and confirmed the date cells literally contain the neutral placeholder `…` before any client JS runs, then re-checked under simulated `de-DE` and `en-GB` browser locales and confirmed correct locale-specific formatting after mount, with 2-digit years and no seconds throughout, zero console errors. Confirmed separately: zero occurrences of "edit" text anywhere in the table.
