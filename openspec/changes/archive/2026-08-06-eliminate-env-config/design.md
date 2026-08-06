## Context

See proposal.md for motivation. Relevant current state:

- `src/config.ts` reads every value once at process boot from `process.env`, including a required `CAPELLA_ORGS` (throws if missing/malformed) and a required `SESSION_SECRET` (throws lazily via a getter).
- `src/lib/scheduler.ts` calls `setInterval(tick, config.syncIntervalMs)` once at startup - the interval value is captured for the lifetime of the process.
- `src/lib/store.ts` builds file paths from `config.dataDir`, synchronously, on every read/write.
- `proxy.ts` runs on every request and today synchronously verifies the session cookie against `config.sessionSecret`. Next.js 16 defaults Proxy to the Node.js runtime (confirmed via `node_modules/next/dist/docs`), so `fs` access and `async` proxy functions are supported - this was verified before committing to this design, since an Edge-runtime proxy could not read a JSON file at all.
- `src/lib/settings.ts` (from the prior change) already establishes the pattern: a `Settings` object persisted to `data/settings.json`, validated on read and write, falling back to defaults when missing/invalid.

## Goals / Non-Goals

**Goals:**
- Zero required environment variables for a fresh install.
- Every setting change takes effect without a process restart.
- Secrets that must exist (session secret) are still eliminated from `.env`, but are never presented as a raw hand-typed/pasted text field.

**Non-Goals:**
- Password hashing or any auth-model change beyond what exists today (dashboard credentials remain a single shared plaintext-compared credential, timing-safe compared - same as today, just relocated). Not introducing this now is a deliberate scope boundary, not an oversight - the existing design already accepted "single shared credential" as sufficient for this phase.
- Splitting secrets into a separate, more tightly-permissioned store from the rest of settings. `data/settings.json` now holds the session secret and dashboard password alongside non-secret operational knobs; this is a real reduction in isolation compared to "secret only in an env var the process reads once," accepted as the direct consequence of the "eliminate `.env` entirely" requirement (see Risks).
- Multi-user accounts, RBAC, or an audit trail of settings changes.
- Making the data directory itself configurable (see Decisions - this is a hard constraint, not a deferred feature).

## Decisions

**The data directory stays a fixed constant, not a setting.**
`data/settings.json`'s own location is defined by the data directory - so the data directory cannot be *stored inside* the file it would need to be read from before the directory is even known. There is no version of "make `DATA_DIR` a setting" that isn't circular. Resolution: hardcode `"./data"` directly in `src/lib/store.ts` and `src/lib/settings.ts`, removing the env var entirely rather than relocating it. This satisfies "eliminate `.env`" for this value the only way it can be satisfied.

**The session secret is auto-generated and persisted, but never rendered as an editable field.**
Alternative considered: expose it as a text input like every other setting, matching "add UI for all parameters" literally. Rejected - a signing secret is not a value a human should hand-type or copy/paste through a browser form (clipboard exposure, shoulder-surfing, browser autofill); the only legitimate operator actions on it are "it exists" and "invalidate everything and get a new one." On first read with no persisted settings, `crypto.randomBytes(32).toString("hex")` is generated and saved once. The settings page shows only whether one is set (it always is, post-migration) and a "Rotate" button that regenerates it and, as an unavoidable side effect, invalidates every existing session (including the operator's own - they'll need to log back in).

**Organizations become a settings-page list, not a single JSON blob to hand-edit.**
`CAPELLA_ORGS` today is a raw JSON array string in `.env` - workable for an operator editing a file, not for a form. The settings page gets an add/remove list of `{orgId, orgName, apiKey}` rows, with `apiKey` masked (password-style input with a reveal toggle) since it's live API credential material, even though it's stored in the same settings file as everything else now.

**Sync interval and retention move from "fixed at boot" to "re-read every cycle."**
`scheduler.ts`'s `tick(); setInterval(tick, config.syncIntervalMs)` captures the interval once. Replacing this with a self-rescheduling loop - run a cycle, read the current `syncIntervalHours` from settings, `setTimeout` for that long, repeat - means a changed interval takes effect starting from the next scheduled tick, without a restart. `runSyncCycle` itself already re-reads whatever it's given per call, so threading settings-sourced values (organizations, retention) through it on each cycle is a natural extension of a call that's already async and already happens on a timer, not a new async boundary being introduced somewhere that had none.

**Sync tolerates zero configured organizations instead of failing at boot.**
Today, a missing/malformed `CAPELLA_ORGS` throws before the server can even start. Once organizations are operator-added via the UI rather than required at boot, a fresh install necessarily starts with zero - sync must run a no-op cycle (0 orgs polled) rather than crash, and the dashboard shows its existing empty-state ("No clusters synced yet") with a nudge toward Settings.

**Credential changes require the current password.**
Alternative considered: let anyone with an active session change the shared credential outright, since they're already authenticated. Rejected - the whole point of a shared credential is that one dashboard session doesn't automatically confer the power to silently lock everyone else out. Requiring current-password confirmation on any change is a small form addition with a meaningful safety property.

## Risks / Trade-offs

- **Secrets now live in a plaintext, web-editable JSON file instead of a process-boot-only env var** -> Mitigation: this is the direct, informed consequence of eliminating `.env` entirely (explicitly requested); partially mitigated by never rendering the session secret for editing/copying, and by the file already being outside version control (`data/` is git-ignored) and behind the existing single-session dashboard auth. Recommend the settings file be written with restrictive permissions (owner read/write only) as a defense-in-depth measure - noted as an implementation detail in tasks.md, not a spec requirement, since file permissions aren't user-observable behavior.
- **Sync failing to notice an interval change until the current wait completes** -> Acceptable: identical in spirit to age-status thresholds already taking effect "next time computed" rather than instantaneously; a running wait completing on the old interval once is not a functional problem.
- **A fresh install with zero organizations configured is a new first-run state that didn't exist before (previously the app refused to boot at all without `CAPELLA_ORGS`)** -> Mitigation: this is explicitly the more graceful behavior being designed in - covered by a new cluster-sync requirement and the dashboard's existing empty-state message, not a gap.
- **Rotating the session secret force-logs-out the operator performing the rotation** -> Inherent to what rotation means (old signatures can no longer verify); the settings page should say so plainly before the action is taken.
