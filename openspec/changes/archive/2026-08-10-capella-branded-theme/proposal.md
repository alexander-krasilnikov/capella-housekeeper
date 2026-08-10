## Why

The dashboard's visual language is plain and utilitarian (bare Tailwind `slate`/`blue`, no deliberate typeface, no brand identity), and its dark mode is entirely OS-driven — there is no user-facing control, no persisted preference. Operators who want dark mode regardless of their OS setting, or who want light mode despite it, have no way to get it. Separately, the tool's appearance doesn't reflect that it manages Couchbase Capella clusters — there's no visual link to the product it's housekeeping for.

## What Changes

- Add a light/dark/system theme switcher, persisted across sessions via a cookie (not `localStorage`), read server-side in the root layout so the correct theme applies on first paint — no flash of the wrong theme, no hydration mismatch.
- Redesign the app's visual language across all three pages (login, dashboard, settings) around a Capella-inspired palette: dark navy/charcoal chrome with an orange-red brand accent for primary actions, active nav states, focus rings, and the login card, layered on top of — not replacing — the existing semantic status colors (`emerald`/`amber`/`rose` for healthy/caution/destructive meaning), which keep their current role unchanged in both themes.
- Introduce a deliberate typeface via `next/font`, replacing the current unstyled system-ui fallback.
- Restyle shared building blocks consistently under the new palette and typography: buttons, badges, the cluster table's chrome (filters, columns panel, pagination), cards, form inputs, and navigation — in both light and dark variants.

No existing functional behavior (table sorting/filtering/pagination, settings forms, manual actions, consent flow) changes; this is a visual and theming change layered on top of it.

## Capabilities

### New Capabilities
- `theme-preference`: Lets a user choose between light, dark, or system theme; the choice persists across sessions and future visits, and applies on first paint without a visible flash of the wrong theme.

### Modified Capabilities
(none — existing capabilities' functional requirements are unchanged; only their visual treatment changes, which these specs do not govern)

## Impact

- `app/layout.tsx` — reads the theme cookie server-side, sets `<html data-theme>`, applies the new font.
- `app/globals.css` — new design tokens (palette, spacing/radius conventions) replacing ad hoc `slate`/`blue` usage.
- New theme-toggle component + a server action or route to set the theme cookie.
- `app/page.tsx`, `app/components/ClusterTable.tsx`, `app/components/ManualDeleteButton.tsx`, `app/components/ManualTurnOffButton.tsx`, `app/components/SendConsentRequestButton.tsx`, `app/components/RefreshButton.tsx`, `app/components/SlackConnectionIndicator.tsx` — restyled to new tokens; semantic status colors preserved.
- `app/settings/*`, `app/login/page.tsx` — restyled to new tokens.
- No API, data model, or dependency changes beyond `next/font` (already part of Next.js).
