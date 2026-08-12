## Why

The settings page currently renders as a bare, isolated page - no sidebar, no nav, just a "← Back to dashboard" link - so navigating to it feels like leaving the application rather than moving within it. Separately, the team needs a way to manually reactivate a turned-off cluster during the current test period, without making that a permanent, unrestricted capability - so it must be off by default and opt-in via a settings toggle that's clearly scoped as temporary/developer-only.

## What Changes

- Extract the dashboard's persistent sidebar (brand mark, Clusters/History nav, Settings link, theme toggle, Slack indicator) into a shared shell rendered around both the dashboard and the settings page, so Settings is reached via in-place navigation rather than a page that drops the surrounding chrome. The Settings nav entry is highlighted as active while on `/settings`.
- Add a "Developer options" section to the settings page containing a single toggle, "Enable manual cluster turn-on," disabled by default.
- When that toggle is enabled, a "Turn on" control appears in the Action column alongside the existing Ask/Turn off/Delete/History controls, for every cluster row. It is disabled when the cluster is not currently turned off, and turns the cluster back on (immediately, independent of owner consent, mirroring the existing manual turn-off/delete behavior) when activated and confirmed.
- **BREAKING (spec-level, not user-facing today):** removes the standing prohibition in `manual-cluster-actions` on any control to reactivate a manually turned-off cluster - that capability now permits a turn-on control specifically when the new developer-options toggle is enabled, and continues to prohibit it otherwise.

## Capabilities

### New Capabilities
- `dashboard-shell`: the persistent sidebar/navigation frame (brand, Clusters/History switcher, Settings link, theme toggle, Slack status) shared across every authenticated page, including the settings page.

### Modified Capabilities
- `dashboard-settings`: adds a "Developer options" section and the "Enable manual cluster turn-on" toggle setting; the settings page requirement is amended to note it renders within the shared dashboard shell rather than as a standalone page.
- `manual-cluster-actions`: replaces the blanket "no reactivation control" requirement with one scoped to the new toggle's state, and adds requirements for the manual turn-on control's confirmation, availability, and result behavior (mirroring the existing turn-off control).
- `cluster-dashboard-ui`: the unified Action column requirement is amended to include the turn-on control when the developer-options toggle is enabled.

## Impact

- **UI**: `app/settings/page.tsx`, `app/settings/SettingsShell.tsx`, `app/components/DashboardTabs.tsx` (sidebar extraction), new `ManualTurnOnButton` component, `app/components/ClusterTable.tsx` (Action column).
- **Settings schema**: `src/types.ts` (`Settings`, `DEFAULT_SETTINGS`), `src/lib/settings.ts` (`validateSettings`) gain a `developerTurnOnEnabled: boolean` field, defaulting to `false`.
- **Capella API/actions**: `src/lib/capellaClient.ts` gains a `turnOnCluster` function (`POST` to the same `activationState` sub-resource `turnOffCluster` `DELETE`s); `src/lib/manualActions.ts` gains a `manualTurnOn` function mirroring `manualTurnOff`; `app/actions.ts` gains a corresponding server action.
- **History/audit**: `src/types.ts` and `src/lib/historyFields.ts` gain a `"manual-turn-on"` trigger/label, already covered by the existing generic "consent or lifecycle action" wording in `cluster-history-ui` - no spec change needed there.
