## 1. A failed turn-off is no longer treated as already off

- [x] 1.1 Rewrite `isAlreadyOff` in `src/lib/slack.ts` to use `classifyClusterStatus(status) === "off"` plus an explicit check for `TRANSITIONAL_STATUS.turningOff`, importing both from `capellaClient`, and replacing the `/off/i` match over `formatStatusLabel`.
- [x] 1.2 Confirm no import cycle is introduced (`capellaClient` imports only `rateLimiter` and types) — type check and full suite pass.
- [x] 1.3 Replace the test that recorded the defect with assertions on the corrected behaviour: `turnedOff` and `offline` are off, `turningOff` is off (an ask would be noise), `turningOffFailed` is **not** off, and `destroying`/`deploying`/`turningOn` are not off.

## 2. The billing window is anchored in UTC

- [x] 2.1 Derive `getBillingUsage`'s `startDate` via `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)` so both bounds share one clock, and comment why mixing local components with `toISOString` was wrong.
- [x] 2.2 Replace the test comment that documented the defect with an assertion that `startDate` is the first of the month, plus a dedicated test asserting both bounds against UTC-derived expectations.
- [x] 2.3 Verify the suite passes across timezones spanning the range that used to break it — confirmed green under `Europe/Berlin`, `UTC`, `America/New_York`, `Asia/Tokyo` and `Pacific/Kiritimati` (UTC+14).

## 3. Confirm text stays inside Slack's payload limit

- [x] 3.1 Extract `SLACK_CONFIRM_TEXT_LIMIT` and compute the room left by each action's explanation in `confirmDialog`, trimming the cluster name to fit with a trailing ellipsis.
- [x] 3.2 Replace the headroom-measuring test with one asserting the cap holds for name lengths from 0 to 10,000, that a trimmed name is visibly marked, and that an ordinary name is untouched.

## 4. Verification

- [x] 4.1 Full suite and type check green — 422 tests passing, `tsc --noEmit` clean.
- [x] 4.2 Full suite green under multiple timezones, so neither fix is timezone-sensitive.
