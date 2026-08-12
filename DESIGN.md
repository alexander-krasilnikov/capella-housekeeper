---
name: Capella Housekeeper
colors:
  canvas: '#f7f6f3'
  panel: '#ffffff'
  panel-hover: '#f1efec'
  line: '#e3e0da'
  ink: '#1c2333'
  ink-muted: '#5b6478'
  ink-faint: '#94a0b4'
  brand: '#e8551f'
  brand-hover: '#d1461d'
  brand-active: '#b93b10'
  brand-soft: '#fde6da'
  brand-ink: '#ffffff'
  dark-canvas: '#12141c'
  dark-panel: '#191c26'
  dark-panel-hover: '#212433'
  dark-line: '#2b2f3f'
  dark-ink: '#eef0f5'
  dark-ink-muted: '#9aa3b8'
  dark-ink-faint: '#616a80'
  dark-brand: '#ff7a45'
  dark-brand-hover: '#ff8f61'
  dark-brand-active: '#ffa676'
  dark-brand-soft: '#33231a'
  dark-brand-ink: '#1c0f08'
  status-healthy: '#10b981'
  status-caution: '#f59e0b'
  status-destructive: '#f43f5e'
typography:
  font: Geist
rounded:
  DEFAULT: 0.5rem
---

## Brand & Style

This is the design system for **Capella Housekeeper**, an internal monitoring dashboard for running Couchbase Capella database clusters. It targets ops/dev users who need to scan a dense cluster table, spot idle or forgotten clusters, and take quick manual actions (turn off, extend, delete).

The visual language is a warm, understated "Capella-inspired" redesign: a warm neutral (off-white/charcoal) canvas rather than cold slate gray, with a single orange-red brand accent reserved for primary actions and brand chrome. It is directionally inspired by Couchbase Capella's identity, not a pixel-exact brand match (see `openspec/changes/archive/2026-08-10-capella-branded-theme/`). The overall feel should be calm, utilitarian, and trustworthy — a tool an engineer keeps open in a tab all day, not a marketing surface.

## Colors

- **Canvas / Surface:** Light mode uses a warm off-white canvas (`#f7f6f3`) with white panels (`#ffffff`) and a warm hairline border (`#e3e0da`). Dark mode uses a warm-charcoal/navy canvas (`#12141c`) with slightly lighter panels (`#191c26`).
- **Text ("ink"):** Dark navy ink (`#1c2333`) on light, near-white (`#eef0f5`) on dark, with muted and faint variants for secondary/tertiary text.
- **Brand accent:** A single orange-red (`#e8551f` light / `#ff7a45` dark, brighter to stay legible on dark surfaces) used ONLY for primary buttons, links, active nav states, and brand marks — never for large fills.
- **Semantic status colors (kept visually distinct from brand):** emerald `#10b981` = healthy/in-use, amber `#f59e0b` = caution/stale, rose `#f43f5e` = destructive/forgotten/delete. These carry specific meaning across cluster status badges, age tiers, and destructive-action buttons, and must never be reused for anything else.

These map 1:1 to the CSS custom properties already defined in `app/globals.css` (`--color-canvas`, `--color-brand`, etc.) — this file documents the same tokens as design intent/rationale, it does not introduce new ones.

## Typography

Single sans family, **Geist** (self-hosted via `next/font/google`, applied once at the root layout), used for everything — no serif, no separate display face. Lean on weight and size rather than multiple families to build hierarchy. Numeric/table data uses tabular figures (`tabular-nums`) for alignment.

## Shape & Elevation

Corners are moderately rounded (~8px, Tailwind `rounded-lg`) on cards, buttons, and inputs; smaller controls (chips, badges) use a slightly tighter radius, and pill/circular shapes are reserved for status dots and avatar-style icons. Depth comes from flat panel-vs-canvas color contrast and thin hairline borders rather than heavy drop shadows — this is a flat, IDE-adjacent aesthetic, not a glossy/skeuomorphic one.

## Components

- **Data table:** The core surface of the app — a dense cluster list with sortable columns, status badges (colored pill with dot), an actions column (hand-rolled icon buttons, not a UI-kit dropdown), and hover row highlighting using `panel-hover`.
- **Buttons:** Primary = solid brand orange-red with white text, for the single most important action per view (e.g. "Save", "Confirm"). Secondary/ghost = bordered or text-only in ink-muted, used for the majority of controls. Destructive = rose, reserved for delete/turn-off-now actions, usually behind a confirm step.
- **Badges/chips:** Small rounded-full pills with a colored dot + label, using the semantic status colors — e.g. "In Use" (emerald), "Stale" (amber), "Forgotten" (rose).
- **Navigation:** Section switching (Clusters / History) — see "Sidebar exploration" below for a Stitch-generated alternative to the current top-tab pattern.
- **Theme toggle:** A small hand-rolled segmented control (Light / Dark / System) living in the app chrome, not a third-party switch component.
- **Forms (settings):** Simple label-above-input layout, warm-neutral input backgrounds with a hairline border, brand-colored focus ring.

## Sidebar exploration (Stitch)

A Stitch-generated variant (`Capella Housekeeper Dashboard`, project `Capella Housekeeper`, screen `fcfad3db2c234a709c6d8f014ddee088`) explores replacing the top tab switcher with a persistent left sidebar:

- 256px-wide (`w-64`) fixed sidebar, `canvas`-colored, right border in `line`, hidden below `md` breakpoint.
- Header block: "Clusters" in brand color/bold, "GLOBAL FLEET" as a small uppercase `ink-muted` eyebrow label underneath.
- Nav items (icon + label, `rounded-lg`, `px-3 py-2`): active item uses `brand-soft` background with `brand` text and bold weight; inactive items are `ink-muted`, hover to `ink` text + `panel-hover` background.
- Items mocked: Clusters (`dns` icon, active), History (`history` icon), Templates (`description` icon), Analytics (`analytics` icon) — only Clusters and History correspond to real features today.
- Top bar simplifies to just the wordmark + theme toggle + settings/account icons (no tab switcher, since navigation moved to the sidebar).

This is a design exploration, not yet applied to the running app — see below for what was carried over into code versus left as a reference.

## Do / Don't

- Do keep the brand accent rare and high-signal — it should draw the eye to the one right action.
- Do keep emerald/amber/rose semantic and consistent everywhere they appear.
- Don't introduce a second accent hue, gradients, or heavy shadows — the aesthetic is flat and quiet.
- Don't use a decorative or serif display font; everything is Geist.
