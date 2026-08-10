## 1. Theme infrastructure

- [x] 1.1 Add a `theme` cookie helper (get/set, values `light` | `dark`, absent = system) alongside the existing cookie/session helpers in `src/lib/auth.ts`'s style.
- [x] 1.2 Switch Tailwind's dark-mode strategy from `media` to selector-based, keyed off `[data-theme="dark"]`, so explicit choice can override OS preference while every existing `dark:` class keeps working unchanged.
- [x] 1.3 Update `app/layout.tsx` to read the theme cookie server-side and set `<html data-theme="light"|"dark">` (omit the attribute when unset/system).
- [x] 1.4 Verify first paint is correct with no flash: set the cookie manually, reload, confirm the server-rendered HTML already carries the right `data-theme` before any client JS runs.

## 2. Design tokens and typography

- [x] 2.1 Define light-mode design tokens (background, surface, text, brand accent) as CSS custom properties in `app/globals.css` under `:root`.
- [x] 2.2 Define dark-mode token overrides under `[data-theme="dark"]`. (Revised from the original plan's `prefers-color-scheme` media guard — see design.md Decision 2: system-mode resolution moved to a `beforeInteractive` bootstrap script instead, since Tailwind's selector-based `dark:` needs a concrete attribute value regardless.)
- [x] 2.3 Leave existing `emerald`/`amber`/`rose` semantic color usages untouched; do not fold them into the new token layer.
- [x] 2.4 Add a self-hosted sans-serif typeface via `next/font` and apply it at the root layout.

## 3. Theme toggle

- [x] 3.1 Build a Light/Dark/System toggle component (hand-rolled, no new dependency) following the existing custom-dropdown pattern used for the table's Columns panel.
- [x] 3.2 Add a server action that persists the selected theme to the cookie.
- [x] 3.3 On selection, flip `document.documentElement.dataset.theme` immediately on the client (don't wait on the server action round trip) so the change is instant.
- [x] 3.4 Place the toggle in the dashboard header, next to the existing Settings/Refresh/Log out controls.

## 4. Shared component restyle

- [x] 4.1 Restyle buttons (primary/secondary/destructive) to the new brand-accent and neutral tokens, keeping destructive (`ManualDeleteButton`) and caution (`ManualTurnOffButton`, `SendConsentRequestButton`) actions on their existing semantic colors.
- [x] 4.2 Restyle badges/status dots (`StatusBadge`, `AgeStatusBadge`, `ConsentBadge`, `SlackConnectionIndicator`) to use the new neutral tokens for chrome while keeping their semantic dot/text colors unchanged.
- [x] 4.3 Restyle form inputs, cards, and section headers (`app/settings/page.tsx` helpers, `NotificationsEditor`, `OrgsEditor`) to the new tokens.

## 5. Page restyle

- [x] 5.1 Restyle `app/login/page.tsx`: brand gradient/accent on the card, new typography.
- [x] 5.2 Restyle the dashboard header and layout in `app/page.tsx`.
- [x] 5.3 Restyle `ClusterTable.tsx` chrome: search input, age-status quick-filter pills, Columns panel, table header/row borders, pagination footer. Leave column data and semantic badge colors as-is.
- [x] 5.4 Restyle `SettingsShell.tsx` sidebar navigation (active/inactive states) to the new brand accent.

## 6. Verification

- [x] 6.1 Manually walk all three pages (login, dashboard, settings) in Light, Dark, and System, confirming semantic status colors (age status, consent, delete/turn-off) remain visually distinct from the brand accent in both themes. (Verified structurally via `npm run build` output and direct CSS/HTML inspection over curl — no browser available in this environment; a human visual pass in an actual browser is still recommended before considering this fully done.)
- [x] 6.2 Confirm theme choice persists across a reload and across a new browser session. (Verified via curl with an explicit `chk_theme` cookie: `light`/`dark` render the matching `data-theme` server-side with zero JS involved.)
- [x] 6.3 Confirm switching theme while on a page applies instantly, without a full page reload. (`ThemeToggle` mutates `document.documentElement` synchronously on click, independent of the server action's round trip — verified by reading the implementation; not exercised in a live browser.)
- [x] 6.4 Run `npm run typecheck` and fix any resulting type errors. (Passes with no errors; `npm run build` also succeeds.)
