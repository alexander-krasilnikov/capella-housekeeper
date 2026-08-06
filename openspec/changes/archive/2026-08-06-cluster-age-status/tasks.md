## 1. Settings store

- [x] 1.1 Define a `Settings` type (`newDays`, `staleDays`, `forgottenDays`, `inactivityGraceDays`) and default values.
- [x] 1.2 Implement `readSettings()` / `writeSettings()` in a new settings module, following `src/lib/store.ts`'s JSON-file pattern, seeding `data/settings.json` with defaults on first read.
- [x] 1.3 Implement shared validation (`newDays`, `staleDays`, `forgottenDays`, `inactivityGraceDays` all positive integers; `newDays < staleDays < forgottenDays`) used by both the write path and the settings page's save action; on read, fall back to defaults if the persisted file fails validation.

## 2. Age-status computation

- [x] 2.1 Implement `computeAgeStatus(ageDays, lastActivityAt, lastActivitySource, settings)` implementing the four-tier logic and the known-recent-activity hold rule from `specs/cluster-age-status/spec.md`.
- [x] 2.2 Cover boundary cases: exactly at each threshold, unknown activity source, known activity inside vs. outside `inactivityGraceDays`.

## 3. Settings page

- [x] 3.1 Add a settings route/page with a form for the four thresholds, pre-filled with current values.
- [x] 3.2 Add a server action that validates and saves submitted thresholds, surfacing an error and leaving prior values in effect on validation failure.
- [x] 3.3 Link to the settings page from the dashboard header.

## 4. Dashboard integration

- [x] 4.1 In `app/page.tsx`, read settings alongside clusters and compute `ageStatus` per row via `computeAgeStatus`.
- [x] 4.2 Add an `ageStatus` field to `ClusterRow` in `app/components/ClusterTable.tsx`.

## 5. Table UI

- [x] 5.1 Add an `AgeStatusBadge` component with its own color mapping for New / Established / Stale / Forgotten, rendered independently of the existing `StatusBadge`.
- [x] 5.2 Add a new "Age status" column to the table's column definitions, distinct from the existing operational status column.
- [x] 5.3 Add a dropdown filter for age status using TanStack Table's column-filter state, separate from the existing global fuzzy search field.
- [x] 5.4 Confirm the new column participates in existing column visibility/ordering/persistence behavior like other columns.

## 6. Verification

- [x] 6.1 Manually verify tier boundaries against default thresholds using representative clusters (new; established; stale-by-age; forgotten-by-age; old-but-active held at Established; old-with-unknown-activity).
- [x] 6.2 Verify the settings page rejects invalid threshold ordering and non-positive values, leaving prior thresholds in effect.
- [x] 6.3 Verify age-status and operational-status badges render independently (e.g. Active + Forgotten together) and that the age-status filter works alongside the existing search field.
