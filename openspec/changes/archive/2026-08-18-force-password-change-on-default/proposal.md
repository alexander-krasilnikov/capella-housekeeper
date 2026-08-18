## Why

`DEFAULT_SETTINGS.dashboardPassword` is the literal, publicly-documented string `"change-me"` (`src/types.ts`). Nothing today prevents an operator from running the dashboard indefinitely on that default: a fresh install seeds it, login accepts it, and there is no signal anywhere prompting a change. Anyone who knows this project (or reads its source) can log in to an unconfigured instance. Forcing a password change on first successful login with the default credential closes that gap without requiring the operator to remember to do it themselves.

## What Changes

- Add a new route, `/change-password`, that lets an authenticated operator set a new dashboard password (no username change here - that stays in Settings).
- The proxy gate (`proxy.ts`) SHALL redirect any authenticated request to `/change-password` whenever the dashboard's current password still equals the seeded default (`DEFAULT_SETTINGS.dashboardPassword`), for every route except that page itself and its own submit action - mirroring how `/login` is already excluded today.
- This applies uniformly regardless of *how* the password came to equal the default - first run, or an operator later resetting it back to `"change-me"` on purpose - since the check is a live comparison against current settings, not a one-time first-login flag.
- Add `src/lib/auth.ts`'s `isUsingDefaultPassword()` to back that check.
- Add a new server action for submitting the new password from `/change-password`, separate from Settings' existing `saveCredentialsAction` (that one requires re-confirming the *current* password and changes username too; this flow already ran through login moments earlier and only ever needs a new password).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dashboard-auth`: adds a requirement that access is blocked behind a mandatory password-change page whenever the dashboard's password is still the seeded default, regardless of route, until it's changed to something else.

## Impact

- **Code**: `src/lib/auth.ts` (new `isUsingDefaultPassword`), `proxy.ts` (redirect + matcher exclusion), `app/change-password/page.tsx` (new), `app/actions.ts` (new `changePasswordAction`).
- **Spec**: `openspec/specs/dashboard-auth/spec.md` gains one new requirement.
- **No DB/schema change**: this reads the existing `dashboardPassword` setting; no new persisted field.
