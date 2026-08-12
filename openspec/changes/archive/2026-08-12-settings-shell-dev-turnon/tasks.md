## 1. Settings schema: developer options toggle

- [x] 1.1 Add `developerTurnOnEnabled: boolean` to the `Settings` interface and to `DEFAULT_SETTINGS` (default `false`) in `src/types.ts`.
- [x] 1.2 Add validation for `developerTurnOnEnabled` (plain boolean) to `validateSettings` in `src/lib/settings.ts`, following the existing boolean fields' pattern.
- [x] 1.3 Update/add tests in `src/lib/settings.test.ts` covering: default is `false` on first run, an existing settings file missing the field gets it gap-filled to `false` without touching other fields, and a persisted `true` value round-trips.

## 2. Capella API and manual turn-on action

- [x] 2.1 Add `turnOnCluster(org, apiBaseUrl, projectId, clusterId)` to `src/lib/capellaClient.ts` - `POST` to the same `activationState` sub-resource `turnOffCluster` `DELETE`s.
- [x] 2.2 Add `manualTurnOn(clusterId)` to `src/lib/manualActions.ts`, mirroring `manualTurnOff`: reuse `resolveClusterAndOrg`/`resolveOrgConfig`, call `supersedeLiveMessage`, call `turnOnCluster`, re-read the cluster fresh before writing `config.status` back, append history with trigger `"manual-turn-on"`.
- [x] 2.3 Add `"manual-turn-on"` to the `HistoryTrigger` union in `src/types.ts`.
- [x] 2.4 Add `"manual-turn-on"` entries to `TRIGGER_LABEL` ("Manual turn-on") and the lowercase description map in `src/lib/historyFields.ts`, following `"manual-turn-off"`/`"manual-delete"`.
- [x] 2.5 Add/extend tests in `src/lib/manualActions.test.ts` for `manualTurnOn`: success path, cluster-not-found, org-no-longer-configured, Capella API failure, and that a live pending consent message is superseded.
- [x] 2.6 Add a `manualTurnOnAction(clusterId)` server action in `app/actions.ts`, mirroring `manualTurnOffAction`.

## 3. Turn-on button component

- [x] 3.1 Create `app/components/ManualTurnOnButton.tsx`, mirroring `ManualTurnOffButton.tsx`'s confirm-modal pattern, calling `manualTurnOnAction`.
- [x] 3.2 Disable the button (with a title/tooltip explaining why) when the cluster's current status is not turned off - the inverse of `ManualTurnOffButton`'s `disabled={statusIsOff}`.

## 4. Wire the toggle into the cluster table

- [x] 4.1 Extend `ClusterTable`'s `TableMeta` augmentation in `app/components/ClusterTable.tsx` with `developerTurnOnEnabled: boolean`, passed in alongside the existing `askResults`/`setAskResult` meta.
- [x] 4.2 In the Action column's cell renderer, render `ManualTurnOnButton` when `developerTurnOnEnabled` is true, positioned alongside the existing Ask/Turn off/Delete/History controls.
- [x] 4.3 Thread `developerTurnOnEnabled` as a prop from `app/page.tsx` (from `readSettings()`) through `DashboardTabs` into `ClusterTable`.

## 5. Developer options settings section

- [x] 5.1 Add a "Developer options" section (id `"developer"`) to the `sections` array in `app/settings/page.tsx`, with a form posting to `saveSettingsAction` (hidden `section` field, matching the existing thresholds/sync sections' pattern) containing a checkbox/toggle for "Enable manual cluster turn-on," defaulting from `settings.developerTurnOnEnabled`.
- [x] 5.2 Register `"developer"` in `resolveInitialSection`'s `SHARED_SECTION_IDS` so save redirects land back on this section.
- [x] 5.3 Confirm `saveSettingsAction`/`writeSettings` correctly persist the boolean from the form submission (checkboxes submit only when checked - handle the unchecked case explicitly rather than relying on absence).

## 6. Shared AppShell extraction

- [x] 6.1 Create `app/components/AppShell.tsx`: move the `<aside>` sidebar (brand mark, collapse toggle, Clusters/History nav, Settings link, theme toggle, Slack indicator) and the top header bar (title + Log out form) out of `DashboardTabs.tsx` into this new component, along with the collapse-state `useState`/`useEffect`/`localStorage` logic.
- [x] 6.2 Give `AppShell` props: `activeNav: "clusters" | "history" | "settings"`, `title: string`, `clusterCount: number`, `historyCount: number`, `initialSlackStatus`, `onSelectTab?: (tab: "clusters" | "history") => void`, and `children`.
- [x] 6.3 Render Clusters/History nav items as `onSelectTab`-driven buttons when `onSelectTab` is provided, and as `<Link href="/">` when it is not.
- [x] 6.4 Update `DashboardTabs.tsx` to render `AppShell` with `activeNav` derived from its `tab` state, `onSelectTab={setTab}`, and its existing content (stat tiles, table) as `children`; remove the now-duplicated sidebar/header/collapse-state code.
- [x] 6.5 Wrap the settings page's content with `AppShell` (`activeNav="settings"`, `title="Settings"`, no `onSelectTab`) - either inline in `app/settings/page.tsx` or via a small wrapper, keeping `SettingsShell`'s own section sub-nav unchanged inside it.
- [x] 6.6 Remove the settings page's own "Settings" `h1` and "← Back to dashboard" link (now redundant with `AppShell`'s header and sidebar); keep the descriptive paragraph as page content.

## 7. Manual verification

- [x] 7.1 Run the app locally; confirm the sidebar (with correct active state) persists when navigating between the dashboard and settings, and that collapse/expand state carries across that navigation.
- [x] 7.2 Confirm the Developer Options toggle defaults off, and that no Turn on control appears anywhere until it's enabled and saved.
- [x] 7.3 Enable the toggle; confirm a Turn on control appears in the Action column, disabled for clusters that are already on and enabled for clusters that are off.
- [x] 7.4 Confirm a manual turn-on: cluster status updates without a page refresh, a history/audit entry is recorded, and any live pending consent message for that cluster is superseded.
- [x] 7.5 Run the full test suite and confirm it passes.
