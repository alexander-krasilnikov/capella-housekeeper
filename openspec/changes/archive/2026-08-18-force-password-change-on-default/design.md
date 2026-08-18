## Context

See proposal.md - Why/What Changes. `proxy.ts` already gates every route behind session verification (`verifySessionToken`) and excludes `/login`/`api/login` from that gate via its `matcher`. This Next.js version's Proxy defaults to the Node.js runtime (confirmed in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, "Proxy defaults to using the Node.js runtime"), so calling `readSettings()` (which uses `node:sqlite`) directly inside `proxy.ts` is supported, not an Edge-runtime limitation to work around.

## Goals / Non-Goals

**Goals:**
- Nobody can use the dashboard beyond the password-change page while its password is still the public, documented default.
- The check is enforced at a single choke point so it can't be dodged by an already-existing session, a direct URL, or a future new route someone forgets to gate individually.

**Non-Goals:**
- No password complexity rules, expiry, or history - out of scope, matches this repo's existing credential validation (`validateSettings` just requires a non-empty string).
- No change to `saveCredentialsAction`'s existing behavior in Settings (still requires the current password, still allows a username change too).

## Decisions

**Enforce in `proxy.ts`, not (only) in `loginAction`.** Checking only at the moment of login would miss a session that already exists from before the password was ever changed (e.g. an operator who deployed today, never logged out, and someone else picks up the session cookie later), and would need duplicating in every future entry point. Proxy already runs on every authenticated request and is the one place that already can't be bypassed for any route - adding one more check there is a single line, not a new mechanism. Alternative considered: a flag baked into the session token at creation time - rejected because it wouldn't self-correct if an operator manually reset the password back to the default later (the proposal explicitly wants that case caught too), whereas comparing live against current settings on every request handles both first-login and later-reset identically for free.

**No re-entered current password on the change-password page.** Unlike Settings' `saveCredentialsAction`, this page doesn't ask for the current password before accepting a new one. The operator only just authenticated (via login, or via an existing valid session) to reach this page at all, and re-asking for a password whose value is public knowledge (`"change-me"`) adds friction without adding real confirmation value. The only two things the new-password action enforces: non-empty, and not equal to the seeded default (otherwise the redirect would immediately re-trigger).

**Separate server action, not a reused `saveCredentialsAction`.** The two flows have different required fields (this one has no `currentPassword` and no username field) and different post-success redirects (`/` vs `/settings?credSaved=1`). Forcing one shared action to serve both would need branching on which flow called it - more speculative-generality than the two real, distinct call sites justify.

## Risks / Trade-offs

- **[Risk]** An operator intentionally wants to keep the seeded default temporarily (e.g. a throwaway local demo). → **Mitigation:** none needed - this is exactly the scenario the feature exists to prevent; the way out is the same one-time action of setting any other password.
- **[Risk]** Reading settings on every proxied request adds a DB read to every navigation. → **Mitigation:** `verifySessionToken` (already called on every request today) already performs its own `readSettings()` call for `sessionSecret`; this adds one more equivalent local SQLite read alongside an existing one of the same cost, not a new class of overhead.
