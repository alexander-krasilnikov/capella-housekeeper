## 1. Establish the facts the documentation will assert

- [ ] 1.1 Confirm, against the running application, the exact Capella API key permission level required for the full set of operations the app performs (list projects/clusters, activity log, billing usage POST, turn off, turn on, delete) and record the minimum that works - this is the one documented fact in this change that cannot be read off the source.
- [ ] 1.2 Walk a fresh Slack app creation end to end and record the actual click path, the exact scope names as Slack presents them, where each token is copied from, and any step Slack requires that the archived design docs omit (e.g. enabling Socket Mode before an app-level token can be generated).
- [x] 1.3 Verify on a real installation what the data directory contains after a first run and after an upgrade across a schema change, so `docs/operations.md` describes actual filenames (`store.sqlite3`, its `-wal`/`-shm` companions, `backups/`) rather than inferred ones.

## 2. Slack setup document

- [x] 2.1 Write `docs/slack-setup.md`: the ordered external walkthrough from 2.1's findings, both token types with their roles distinguished, and the four required scopes (`chat:write`, `users:read.email`, `im:write` on the bot token; `connections:write` on the app-level token).
- [x] 2.2 Document the Socket Mode model and what follows from it for the reader: the app opens an outbound connection, there is no request URL to register, no inbound endpoint, and nothing to expose to the internet.
- [x] 2.3 Document where both tokens are entered (Settings → Slack credentials), that fields are masked, and that saving a blank field preserves the existing token rather than clearing it.
- [x] 2.4 Document the three silent-failure modes: an empty bot token disables notifications entirely regardless of per-tier configuration; an empty app-level token also suppresses sending, not just receiving; and a cluster whose derived owner is absent or not email-shaped is skipped with no fallback recipient.

## 3. Consent workflow document

- [x] 3.1 Write `docs/consent-workflow.md` covering the three Recency tiers, the two thresholds that produce them (`activityGraceHours`, `forgottenHours`), and that unknown activity tiers a cluster on age alone rather than assuming it active.
- [x] 3.2 Document that a notification fires on a tier *transition*, not on every sync cycle, and that `Fresh` is never notification-eligible.
- [x] 3.3 Document the request lifecycle: what the owner receives, the reminder count (`consentReminderMax`), the expiry window (`consentExpiryDays`), and the snooze options (`snoozeDayOptions`, `maxSnoozes`).
- [x] 3.4 Draw the state-machine diagram per design.md Decision 5, visually distinguishing transitions that stop or destroy a cluster, and specifically the paths that reach a destructive outcome without an owner's approval.
- [x] 3.5 Give `autoTurnOffOnInaction` prominent, plain-language treatment: enabling it means a cluster can be turned off by an owner's silence or by exhausting snoozes.
- [x] 3.6 Document what happens after an approval - the reconciliation loop re-verifies that the cluster still warrants the action immediately beforehand, then acts and records the outcome.
- [x] 3.7 Document the manual operator actions (turn off, delete) as independent of the consent workflow, including the confirmation friction each carries, and note that the "turn on" control is a developer option that is off by default.

## 4. Operations document

- [x] 4.1 Write `docs/operations.md` with the persistent-service patterns moved out of the README (systemd unit, launchd agent), placeholders resolved per design.md's open question.
- [x] 4.2 Document the data directory: its default location, that `CAPELLA_DATA_DIR` overrides it, what it contains per 1.3, and that settings live in the database rather than in a configuration file.
- [x] 4.3 Document the upgrade path: run a newer release against the same data directory, and migrations run automatically on open inside a single transaction that rolls back on failure. Per design.md Decision 7, state plainly that this is not a backup - the application never writes one - and give the manual copy command to run first.
- [x] 4.4 Document the `retentionDays` floor - it must stay at or above 30 because consent-approval lineage looks back 30 days, and lowering it silently breaks that lineage rather than failing loudly.
- [x] 4.5 Document session-secret rotation and its effect (every active session is logged out), and that the secret is generated on first run and never displayed.
- [x] 4.6 Write the troubleshooting section: Node below 22.13.0, a Capella key without sufficient permissions, Slack `missing_scope`, a port already in use, and an empty dashboard before the first sync cycle completes - each with cause and resolution.
- [x] 4.7 Document that the application must run as a single long-lived process and is not compatible with serverless or edge deployment, since the sync loop and Slack connection live in the web server's process.

## 5. Development document

- [x] 5.1 Write `docs/development.md`: clone, `npm install`, `npm run dev`, and that no environment variables are required.
- [x] 5.2 Document the check commands (`npm test`, `npm run typecheck`, `npm run test:coverage`) and that CI runs the type check and the coverage run on every push and pull request, against the Node version declared in `engines.node`.
- [x] 5.3 Document how to cut a release: push a `v*` tag, which builds the standalone output, runs `scripts/package-release.mjs`, and attaches the tarball to the GitHub Release for that tag.
- [x] 5.4 Replace the README's 8-entry project layout with an accurate one covering `app/`, the `src/lib/` modules by role rather than exhaustively, `bin/`, `scripts/`, `.github/workflows/`, and `openspec/`.

## 6. README rewrite

- [x] 6.1 Rewrite the opening to describe both modes - cross-organization visibility and governance action via owner consent or direct operator action - and delete the "phase one / out of scope" framing entirely.
- [x] 6.2 Document the default read-only posture per design.md Decision 3: shipped defaults take no action against any cluster, and this is a supported way to run the tool indefinitely.
- [x] 6.3 Rewrite the quickstart so a first-time reader can install, log in, complete the forced password change, add an organization, and see their own clusters, reading nothing else.
- [x] 6.4 Correct the credential guidance: the Capella API key needs write access for turn-off and delete per 1.1, not read access.
- [x] 6.5 Remove the implementation claims per design.md Decision 2 - the JSON store, `data/settings.json`, the tech-stack inventory - keeping only implementation facts an operator acts on (single process, data location, Node floor).
- [x] 6.6 Remove the claim that the Capella API base URL is adjustable in Settings; the `dashboard-settings` spec requires it be fixed and not exposed.
- [x] 6.7 Correct the retention default from 7 days to 30, everywhere it appears, including the tombstone-retention description.
- [x] 6.8 Correct the password guidance: changing off the default is mandatory and enforced by a redirect to a dedicated page, not an optional Settings task.
- [x] 6.9 Delete the "Known open risk" section - the Activity Log endpoint question is resolved; it is org-scoped with a filter.
- [x] 6.10 Fix the broken `openspec/changes/cluster-monitoring-dashboard` link, and resolve every `<org>/<repo>` placeholder in the install command.
- [x] 6.11 Add the signposted pointers to all four `docs/` pages, and confirm the entry document contains no material that belongs behind one of them.

## 7. Drift guards

- [x] 7.1 Add a test asserting that no file under `docs/` and no README contains an unresolved own-project placeholder (`<org>`, `<repo>`).
- [x] 7.2 Introduce the marked-default form from design.md Decision 4 and apply it to the numeric defaults quoted in documentation.
- [x] 7.3 Add a test comparing every marked default against the corresponding field in `DEFAULT_SETTINGS`, including `retentionDays`, so a defaults change that leaves documentation behind fails the suite.
- [x] 7.4 Guard the install commands against pinning a release version that does not exist: no documented download URL may name a concrete tag, only the `TAG`/`VERSION` substitution the reader fills from the releases page. Added after an earlier draft of the README pinned `v0.1.0` while the repository had no published release at all - all three snippets 404'd.

## 8. Spec prose corrections

- [x] 8.1 Correct `openspec/specs/cluster-age-status/spec.md`'s purpose line from "four-tier" to three tiers, matching the implementation's `Fresh`/`Aging`/`Old`.
- [x] 8.2 Update the residual "age-status" wording in `openspec/specs/cluster-dashboard-ui/spec.md` to "recency", matching the current type name, without changing any requirement's meaning.
- [x] 8.3 Sweep the same leftover naming out of the other specs carrying it, found while doing 8.2: "age-status" in `consent-action-health-stats` and `cluster-consent-notifications`, and the pre-rename tier names "In Use"/"Stale"/"Forgotten" in `dashboard-settings` and `cluster-consent-notifications` scenario titles. Headers and titles only - no requirement body's meaning changes. The `cluster-age-status` capability directory itself is deliberately left as-is: renaming a capability is not a prose fix.

## 9. Verification

- [ ] 9.1 Follow the rewritten README start to finish on a machine with no prior installation and no prior state, and fix anything that requires knowledge not on the page.
- [ ] 9.2 Configure Slack from `docs/slack-setup.md` alone against a real workspace and confirm a consent DM is delivered and a button click lands, with no scope errors.
- [x] 9.3 Run `npm run typecheck` and `npm run test:coverage`, and confirm the new drift guards pass and fail as intended (verify the failure path by temporarily changing a default).
- [x] 9.4 Re-read this change's spec requirement by requirement against the finished documentation, confirming each has a scenario satisfied by something actually written.
