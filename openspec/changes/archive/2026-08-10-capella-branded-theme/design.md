## Context

Today the dashboard's dark mode is entirely OS-driven: `app/globals.css` sets `color-scheme: light dark` and every component uses Tailwind's `dark:` variant, which (with Tailwind's default `media` strategy) is keyed off the `prefers-color-scheme` media query. There is no theme state, no cookie, no `localStorage` — a user cannot override their OS setting.

The codebase already has one relevant precedent worth following: `src/lib/auth.ts` uses a signed cookie for session state, read server-side. And `app/components/ClusterTable.tsx`'s `FormattedDateTime` shows this project is deliberate about avoiding hydration mismatches rather than papering over them with `suppressHydrationWarning`.

Styling itself is bare Tailwind v4 utilities with no design-token layer — `slate` for neutrals, `blue` for the one existing accent, and `emerald`/`amber`/`rose` used consistently as semantic colors (healthy/caution/destructive) across ~7 components. No font is set (system-ui fallback); no logo or brand asset exists in the repo.

See proposal.md for the motivation and overall scope (whole-app visual redesign + theme switch).

## Goals / Non-Goals

**Goals:**
- A working Light/Dark/System toggle, persisted via cookie, correct on first server-rendered paint (no flash-of-wrong-theme), applied instantly on change.
- A small set of reusable design tokens (palette + typography) that every page and shared component draws from, instead of ad hoc `slate`/`blue` utility classes.
- A Capella-inspired brand accent (dark navy/charcoal chrome, orange-red accent) applied to chrome and primary actions, kept visually distinct from the existing semantic status colors, which keep their current meaning unchanged.

**Non-Goals:**
- Pixel-exact matching to Capella's actual current brand guide. The user has explicitly opted for a directionally-inspired palette (not a verified brand source); exact hues are approximate and expected to be tunable later.
- Any new UI component library or icon library. The project has zero net UI dependencies today (hand-rolled dropdowns, hand-drawn SVG icons); this change keeps that footprint at zero net new packages.
- Any change to functional behavior — table sort/filter/pagination, settings forms, auth, manual actions, consent flow all behave exactly as before.

## Decisions

**1. Theme persistence: cookie read server-side in `layout.tsx`, not `localStorage`.**
A cookie lets the root layout read the user's choice during server rendering and emit the correct `<html>` state in the very first response — no client-side script has to run before the right theme appears. `localStorage` would require an inline, pre-hydration `<script>` in `<head>` to avoid a flash (the common `next-themes` workaround); a cookie avoids that entirely and matches the pattern `src/lib/auth.ts` already uses for session state.
- *Alternative considered*: `localStorage` + blocking inline script. Rejected — same end result, but with an extra manual script-injection step this codebase doesn't otherwise need.

**2. Tri-state precedence via `<html data-theme>` presence, resolved by a blocking bootstrap script when absent.**
"System" isn't resolvable server-side (an HTTP request carries no OS-preference signal), so the cookie stores `light`, `dark`, or is simply unset/`system`. When unset, the server omits `data-theme` entirely (only `data-theme-mode="system"`) and a small `next/script` `beforeInteractive` script resolves it to a concrete `light`/`dark` via `matchMedia` before the browser paints anything — the same class of technique `next-themes` uses. **This revises the mechanism originally sketched here**: a pure CSS `prefers-color-scheme` fallback (no JS) turned out not to compose with Decision 3 below — Tailwind's selector-based `dark:` variant only ever responds to the `data-theme` attribute, so *something* has to resolve "system" into a concrete value for every `dark:`-styled element to react correctly, not just this change's new tokens. A mounted `ThemeSync` component keeps it live afterwards (listens for OS-preference changes while `data-theme-mode="system"`), and `ThemeToggle` resolves it immediately client-side on selection. Explicit `light`/`dark` choices still need no script at all — the server-rendered attribute is already correct.
- *Alternative considered*: resolve "system" to a concrete theme at request time using a hint header. Rejected — no reliable OS-preference signal exists in an HTTP request.
- *Alternative considered*: a compound `@custom-variant` combining the attribute selector with a `prefers-color-scheme` media condition in pure CSS (no script at all). Rejected — expressing "OS prefers dark AND no explicit override" cleanly in CSS-only selector logic is exactly the case a bootstrap script sidesteps; hand-rolling it risked a subtly wrong result with no browser available in this environment to verify it against.

**3. Tailwind's dark-mode strategy switches from `media` to selector-based, keyed off `[data-theme="dark"]`.**
This lets an explicit user choice override the OS preference (goal of this change) while keeping every existing `dark:` utility class working unchanged — only the CSS selector Tailwind generates for `dark:` changes, not the class names used throughout the codebase. Combined with Decision 2, `data-theme` is always concretely resolved (server-side for explicit choices, bootstrap-script-side for system) before first paint, so `dark:` always has a definite answer.
- *Alternative considered*: leave `dark:` on the media strategy and add a parallel set of override classes for explicit choice. Rejected — doubles every one of the ~100+ existing `dark:` usages instead of a single config change.

**4. Toggle sets the cookie via a server action and flips `<html data-theme>` on the client in the same interaction.**
Consistent with this app's existing action pattern (`app/actions.ts`), a server action persists the cookie. The toggle component also sets `document.documentElement.dataset.theme` immediately on click, so the change is visible instantly rather than waiting on the action's round trip — mirroring "theme changes apply immediately" in the spec.

**5. Design tokens as CSS custom properties in `globals.css`, layered alongside (not replacing) the existing semantic Tailwind colors.**
A `@theme` block registers light-mode tokens as Tailwind theme colors (background, surface, text, brand accent), which doubles as their `:root` default; a `[data-theme="dark"]` block overrides the same custom properties for dark — since custom properties cascade, every `bg-canvas`/`text-ink`/`bg-brand`/etc. utility built on them stays theme-aware without extra `dark:` variants. `emerald`/`amber`/`rose` usages in existing components are left as-is — they're the semantic layer and are explicitly required (per spec) to stay visually distinct from the new brand accent, so they're not something this token layer should absorb.

**6. Typography via `next/font`, one self-hosted sans family.**
Self-hosted means no runtime request to an external font host and no layout-shift-prone `<link>` tag — Next's standard approach. Applied once, at the root layout.

**7. No new dependency for the toggle UI.**
A small custom control (segmented buttons or a lightweight popover), following the same hand-rolled pattern already used for the table's Columns panel in `ClusterTable.tsx`.

## Risks / Trade-offs

- **[Risk]** Switching Tailwind's dark-mode strategy is a single config change but affects every one of the ~100+ existing `dark:`-prefixed classes across every component at once. → **Mitigation**: it's purely mechanical (no class renames required — only what `dark:` compiles to changes); verify visually across all three pages in both Light and Dark after the config change, before layering new palette tokens on top.
- **[Risk]** The brand palette is approximated from general knowledge of Capella's identity, not a verified brand source (explicit user choice). → **Mitigation**: isolate brand hues to a handful of CSS custom properties in `globals.css` so they're a one-place edit if real brand tokens become available later.
- **[Risk]** Whole-app scope (login, dashboard, table, settings, every shared button/badge) restyled in one change raises the chance of visual inconsistency or a missed component. → **Mitigation**: token layer means components inherit color/spacing rather than hardcoding it; do a manual pass over both themes on all three pages as a task before considering the change done.
- **[Risk]** Under "System", first paint still depends on the CSS media query rather than a server-resolved value (Decision 2) — this is expected and matches today's behavior exactly, not a regression, but worth calling out so it isn't mistaken for a missed no-flash case during review.

## Migration Plan

Single deploy, no data migration. Existing users have no theme cookie, which resolves to "System" — identical to today's OS-driven behavior, so nothing visibly changes for anyone until they explicitly pick Light or Dark. Rollback is a plain revert; there's no persisted state to clean up beyond an inert cookie.
