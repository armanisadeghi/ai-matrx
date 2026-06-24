# FEATURE.md — `dashboard`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-06-24`

---

## Purpose

`/dashboard` is the signed-in user's personalized hub — the post-login landing. It surfaces engagement metrics, a few "start something" actions, the user's pinned favorites, and a rotating "Discover" strip that advertises a different corner of the platform over time. It is a hub, not a launcher: full navigation lives in the shell sidebar.

---

## Entry points

**Routes**
- `app/(core)/dashboard/page.tsx` — Server Component wrapper; renders `<DashboardClient>`. Lives in `(core)` so it shares the slim modern shell (sidebar + header). The proxy redirects guests off `/dashboard`.
- `app/(core)/dashboard/layout.tsx` — funnels new users (`isNewUser`) to `/welcome`; sets route metadata.

**Components** (`features/dashboard/components/`)
- `DashboardClient.tsx` — composes the page (greeting → metrics → quick actions → pinned → discover).
- `MetricsStrip.tsx` — featured + secondary engagement counts.
- `QuickActions.tsx` — fixed "start something" launchers.
- `PinnedSection.tsx` — the user's favorites grid + empty state.
- `DiscoverSection.tsx` — rotating spotlight cards with `<PinButton>`.
- `DashboardGreeting.tsx` — time-aware greeting.

**Hooks**
- `useDashboardMetrics()` (`hooks/useDashboardMetrics.ts`) — React-Query-wrapped read of the `get_user_dashboard_metrics` RPC (dedups across remounts).
- `useDiscoverRotation()` (`hooks/useDiscoverRotation.ts`) — picks which slice of the Discover pool to show.

**Data/config**
- `dashboard.config.ts` — **the single curate-here file.** Edit to hide/reorder/add Discover items (`DISCOVER_HIDDEN_HREFS` / `DISCOVER_FEATURED_ORDER` / `DISCOVER_EXTRA`) and the "Start something" launchers (`QUICK_ACTIONS`).
- `constants/discover.ts` — assembles `DISCOVER_POOL` FROM `primaryNavItems` (the nav registry, so every spotlight is a real route) using the config knobs above.
- `constants/metricCards.ts` — `METRIC_CARDS` (one per RPC key; tweak labels/icons/order/empty-hints here).

---

## Data model

**RPC** (Supabase) — `migrations/get_user_dashboard_metrics.sql`
- `get_user_dashboard_metrics()` → jsonb. `SECURITY DEFINER`, derives identity from `auth.uid()` (takes NO arg — a caller can't request another user's counts). Counts the calling user's rows in the CURRENT tables: `agx_agent`, `cx_conversation` (NOT `conversations`), `cld_files`, `aga_apps` (`status='published'`), `notes`, `ctx_tasks`, `transcripts`, `ctx_scopes`, `agx_shortcut`, `rs_topic` (research reports), `pc_episodes` (podcasts), `dm_messages` (messages sent, `sender_id`). Replaces the role of the legacy `get_user_stats` (which counted the deprecated `conversation`/`recipe`/`udt_datasets` entity tables).

**Key types**
- `DashboardMetrics` (`features/dashboard/types.ts`)
- `FavoriteItem` / `FavoritesPreferences` (`lib/redux/preferences/userPreferencesSlice.ts`) — see Favorites below.

---

## Favorites / pinning (cross-cutting primitive introduced here)

Favorites live in the **`favorites` module of `user_preferences`** (the synced preferences JSON) — already fetched, synced across devices/tabs, and hydrated into Redux at boot. This is why both surfaces render instantly with **zero fetch**.

- **Store:** `userPreferences.favorites.items: FavoriteItem[]`, capped at `FAVORITES_MAX` (50). Dedupe + cap enforced in the slice reducers (`addFavorite` / `removeFavorite` / `toggleFavorite` / `reorderFavorites` / `setFavorites`) — single source of truth.
- **Hook:** `usePinned()` (`components/favorites/usePinned.ts`) — `{ favorites, isPinned, pin, unpin, toggle, reorder }`. `favoriteId(kind, id)` builds stable ids (`nav` favorites use their href).
- **Button:** `<PinButton item={...} />` (`components/favorites/PinButton.tsx`) — drop on any card/row/header to pin anything.
- **Sidebar:** `FavoritesNavGroup` (`features/shell/components/sidebar/FavoritesNavGroup.tsx`) — the dual purpose. Reuses `NavFlyoutGroup`; reads pins from Redux; the flyout panel only renders on hover/click (nothing renders until interacted, no query ever).

A favorite is a self-contained **reference** (`label`/`href`/`iconName`/`color` snapshot), not a bare id — that's what lets the sidebar + grid render without resolving anything.

---

## Key flows

1. **Metrics load.** `MetricsStrip` → `useDashboardMetrics()` → `supabase.rpc("get_user_dashboard_metrics")` (cached 60s). Zero counts render the `emptyHint` nudge ("Build your first agent").
2. **Pin from Discover.** Hover a Discover card → `<PinButton>` → `usePinned().toggle()` → `toggleFavorite` reducer → preferences sync (debounced upsert + cross-tab broadcast). The item appears in `PinnedSection` and `FavoritesNavGroup` immediately (same Redux read).
3. **Discover rotation.** `useDiscoverRotation(DISCOVER_POOL, 6)` returns a window seeded by day + per-mount cursor; "Show more" advances it. First page load is deterministic (offset based on values computed in `useState` initializers) → no hydration mismatch.

---

## Invariants & gotchas

- **Route group, not URL.** `/dashboard` is the URL regardless of group; moving the folder `(transitional)→(core)` kept every login/redirect reference valid. Don't add a second `/dashboard` route.
- **Favorites cap is load-bearing.** Never bypass the reducers to push into `favorites.items` directly — the cap/dedupe protects the preferences blob size.
- **Discover never hand-lists routes.** `DISCOVER_POOL` derives from `primaryNavItems`; add a nav entry with `dashboard: true` + a `description` and it auto-appears. Curate (hide/reorder/add) only via `dashboard.config.ts`.
- **`Star` must stay in `shellIconMap`.** The sidebar Favorites entry renders its icon via `ShellIcon name="Star"`; if `Star` is dropped from `features/shell/shellIconMap.ts` the collapsed entry becomes an empty hole.
- **RPC takes no argument.** Call `supabase.rpc("get_user_dashboard_metrics")` with no params; identity is `auth.uid()`.

---

## Related features

- Depends on: `features/shell` (nav registry, `ShellIcon`, `NavFlyoutGroup`), `lib/redux/preferences` (preferences slice + sync engine).
- Cross-links: `features/settings/FEATURE.md` (the `favorites` preferences module).

---

## Doctrine compliance

**Primitives reused**
- Data: `primaryNavItems` + `iconColorMap` (`features/shell/constants/nav-data.ts`) — Discover pool, colors, quick actions.
- Components: `ShellIcon`, `NavFlyoutGroup`, `NavItem` (shell); `sonner` toast; `cn`.
- Redux: `userPreferencesSlice` (extended, not forked) + sync engine; `selectActiveUserName` / `selectUserId`.
- Data fetching: `@tanstack/react-query`.

**Primitives introduced**
- `favorites` preferences module + `FavoriteItem` (`userPreferencesSlice.ts`) — Why new: no existing module modeled cross-surface user-curated pins. Considered extending: `coding.favoriteConversationIds` (a bare-id, conversation-only list). Rejected because: it is record-specific and uncapped; favorites must be typed, capped, and span any surface.
- `usePinned` / `<PinButton>` (`components/favorites/`) — Why new: no generic pin control existed. Reused everywhere; not dashboard-specific.
- `features/dashboard/*` components — Why new: replaces the deleted `(transitional)/dashboard` page; organizes route-local code into its feature folder per File Organization.

---

## Change log

- `2026-06-24` — Claude: Added 3 KPIs (research reports `rs_topic`, podcasts `pc_episodes`, messages `dm_messages`). Registered `Star` in `shellIconMap` (fixes empty collapsed Favorites entry). Consolidated all curation into `dashboard.config.ts` (Discover hide/order/extra + Start-something).
- `2026-06-24` — Claude: Moved `/dashboard` from `(transitional)` to `(core)`; rebuilt as a lean hub (engagement metrics via new `get_user_dashboard_metrics` RPC, quick actions, pinned favorites, rotating Discover). Removed the AI-models widget. Added the favorites/pinning primitive (preferences module + `usePinned`/`PinButton`) and the sidebar `FavoritesNavGroup`.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change, update status, flows, and the Change log here.
