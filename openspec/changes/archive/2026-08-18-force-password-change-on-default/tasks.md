## 1. Auth check

- [x] 1.1 Add `isUsingDefaultPassword(): Promise<boolean>` to `src/lib/auth.ts`, comparing `readSettings().dashboardPassword` against `DEFAULT_SETTINGS.dashboardPassword` (plain equality - the default is public, not a secret, so no timing-safe compare needed).

## 2. Proxy gate

- [x] 2.1 In `proxy.ts`, after a valid session is confirmed, call `isUsingDefaultPassword()` and redirect to `/change-password` if true.
- [x] 2.2 Add `change-password(?:/|$)` to the matcher's exclusion list, alongside `login`/`api/login`.

## 3. Change-password page and action

- [x] 3.1 Add `app/change-password/page.tsx`: a centered-card form (mirroring `app/login/page.tsx`'s layout) with "New password" and "Confirm new password" fields, an explanatory message that the dashboard is still using its default password, and an error banner driven by a query param.
- [x] 3.2 Add `changePasswordAction` to `app/actions.ts`: validates the two fields match and are non-empty, rejects a new password equal to `DEFAULT_SETTINGS.dashboardPassword` (otherwise the redirect in proxy.ts would immediately re-trigger), calls `writeSettings({ dashboardPassword: newPassword })`, and redirects to `/` on success or back to `/change-password?error=...` on failure.

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` and the full test suite.
- [ ] 4.2 Manually verify: fresh settings (default password) -> login -> redirected to `/change-password` for any route requested; submit a new password -> redirected to `/` and subsequent navigation works normally; reset the password back to the literal default via Settings -> next request redirects to `/change-password` again.
