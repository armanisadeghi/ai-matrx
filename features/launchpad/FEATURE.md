# FEATURE.md — User Launchpad

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-20`

## Purpose

`/launchpad` is the signed-in user's always-open command surface. It is the
user counterpart to the Admin Launchpad, but deliberately calmer: a compact
set of real start actions, the user's existing favorites, a searchable catalog,
and concise area cards instead of the administration page's dense route wall.
Every work destination opens in a new tab so the Launchpad remains intact.

The personalized `/dashboard` remains the user's hub for momentum, metrics,
and discovery. The Launchpad is a launcher, not a second dashboard.

## Entry points

- `app/(core)/launchpad/page.tsx` — Server Component route shell and AppShell header.
- `features/launchpad/components/UserLaunchpad.tsx` — search, favorites, compact area cards, and new-tab launch contract.
- `features/launchpad/catalog.ts` — pure catalog derivation from `primaryNavItems` and `settingsItem`.
- `features/launchpad/hooks/useVisibilityAwarePageRefresh.ts` — shared one-shot stale-page refresh used by both Launchpads.
- `features/shell/constants/nav-data.ts` — the canonical Launchpad navigation entry; it opens in a new tab and is hidden from guests.

## Data model

No database table, API endpoint, or Redux slice is owned by this feature.
Favorites are read and written through the existing `usePinned()` API. Start
actions come from `features/dashboard/dashboard.config.ts`. Browse and search
destinations derive from the shell navigation registry.

## Key flows

1. A signed-in user opens `/launchpad` from the shell. The shell link itself opens a new tab so their current workspace is preserved.
2. The page hides the normal sidebar and presents the canonical AppShell header plus a compact, sticky search control.
3. With no query, the page shows the dashboard's real start actions, the user's real favorites, and compact top-level area cards.
4. Search ranks every discoverable registry destination plus start actions and matching favorites. Every result is a real new-tab anchor.
5. Area cards show at most three direct child destinations. Their `View all N destinations` control is a real count-door: it searches that area and reveals the complete matching set.
6. One one-shot timer becomes due after an hour. A hidden page waits until visible, and a focused form control gets a five-minute grace period before the page reloads.

## Invariants

- Every work destination opens in a new tab with `noopener noreferrer`.
- The catalog has no parallel route list. It derives from `primaryNavItems`, `settingsItem`, `QUICK_ACTIONS`, and live favorites.
- Shell action children and WindowPanel controls do not enter the static destination catalog; their fallback hrefs do not necessarily perform the named action.
- The Launchpad is authenticated and hidden from guests.
- `/dashboard` stays a hub. Do not move its metrics or rotating discovery content here.
- The default browse state stays compact. Full destination density appears only after a search or an explicit `View all` action.
- The route uses the canonical `(core)` AppShell header and full-height body rules.

## Doctrine compliance

**Reused:** `primaryNavItems`, `settingsItem`, dashboard `QUICK_ACTIONS`,
`QuickActions`, `PinnedSection`, `usePinned`, `PinButton`, `SearchInput`,
`filterAndSortBySearch`, `ShellIcon`, and the shell's `shell-hide-sidebar`
sentinel.

**Extended:** `QuickActions` accepts an opt-in compact grid and new-tab mode,
while `PinnedSection` accepts an opt-in new-tab mode;
shell navigation items accept an opt-in `openInNewTab` contract; the Admin
Launchpad's visibility-aware hourly refresh became one shared hook.

**Created:** the pure Launchpad catalog and its compact/search result renderers.
No existing primitive combined the user navigation hierarchy, start actions,
and favorites into an always-open launcher.

## Change log

- `2026-08-20` — Codex: created the authenticated user Launchpad, registry-backed search and browse cards, shared new-tab quick starts and favorites, the persistent shell door, unique route identity, and shared visibility-aware stale-page refresh.
