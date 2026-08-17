## Why

Three defects surfaced while building the test suite in the `harden-test-suite` change. That change deliberately scoped itself to verification only and recorded each finding in the test that found it, leaving the fixes to a separate change. This is that change.

**A failed turn-off left a cluster running and billing indefinitely.** `isAlreadyOff` decided whether a cluster was already off by matching `/off/i` against its humanized status label. That matched `turningOffFailed` ("Turning Off Failed") — a cluster whose turn-off *failed*, and which is therefore still running. Because it read as already off, the turn-off option was omitted from every consent notification for it, and auto-turn-off-on-inaction could never fire for it either. Nothing would ever ask about that cluster again. This is the regression `classifyClusterStatus` was introduced to prevent for the status badge, but `isAlreadyOff` was never migrated onto it.

**Billed cost included a day from the previous month, in some timezones.** The month-to-date billing window's start was built from local calendar components and then serialized via `toISOString`, mixing local and UTC. In any timezone ahead of UTC, midnight on the 1st locally is still the last day of the previous month in UTC, so the window began a day early. The end bound was already derived in UTC, so the two disagreed. The effect was invisible in CI (UTC) and present on a European developer's or operator's machine.

**A long cluster name could make a consent notification undeliverable.** Slack caps a Block Kit confirm object's `text` at 300 characters. The cluster name was interpolated into that text untruncated, so a sufficiently long name pushed it over the cap and `chat.postMessage` rejected the whole message as `invalid_blocks`. This is the same failure mode a previous change fixed by shortening the explanation text, but the unbounded input was left in place — so the margin was luck rather than a guarantee. It surfaces to an operator only as "the owner couldn't be reached".

## What Changes

- **`isAlreadyOff` is derived from `classifyClusterStatus`'s buckets** rather than a regex over the display label. A cluster is treated as already off when its status is in the `off` bucket, or when it is specifically `turningOff` — that turn-off is in progress, so asking again would be noise. `turningOffFailed` is no longer treated as off, so such a cluster is asked about again and is eligible for auto-turn-off.
- **Both billing bounds are derived in UTC**, so the month-to-date window starts on the first of the current UTC month regardless of the host's timezone.
- **The cluster name in a confirm dialog is trimmed** to whatever room the explanation leaves inside the 300-character cap, with an ellipsis marking that it was shortened. The name is trimmed rather than the explanation, since the name is the caller-supplied unbounded part.

## Capabilities

### New Capabilities

<!-- None: all three fixes change the behavior of existing capabilities. -->

### Modified Capabilities

- `cluster-consent-notifications`: refines what "already turned off" means when deciding whether to offer the turn-off option and whether auto-turn-off may fire — a failed turn-off no longer counts as off. Also adds a requirement that a notification stays deliverable regardless of cluster name length.
- `cluster-sync`: adds a requirement that the actual-cost window is anchored in UTC, so the figure does not depend on the host's timezone.

## Impact

**Modified files**: `src/lib/slack.ts` (`isAlreadyOff`, `confirmDialog`, and a new import of `classifyClusterStatus`/`TRANSITIONAL_STATUS` from `capellaClient`); `src/lib/capellaClient.ts` (`getBillingUsage`'s date bounds); `src/lib/slack.test.ts` and `src/lib/capellaClient.http.test.ts` (the tests that recorded these findings now assert the corrected behavior).

**Behavioral consequences worth stating plainly**:

- Clusters currently sitting in a `turningOffFailed` state will start receiving consent notifications again, and become eligible for auto-turn-off where the tier is configured for it. That is the intended fix, but it means previously-silent clusters may generate owner DMs on the next sync cycle.
- Reported actual cost may change slightly for installs running ahead of UTC, because the window no longer includes the previous month's final day. The new figure is the correct month-to-date one.

**No new dependencies.** `slack.ts` gains an import from `capellaClient.ts`, which introduces no cycle — `capellaClient` imports only `rateLimiter` and types.
