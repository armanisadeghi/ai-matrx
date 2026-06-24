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
- `FavoriteItem` / `FavoritesPreferences` (`lib/redux/preferences/userPreferencesSlice.ts`); `FavoriteKind` / `UserEntityState` (`features/scopes/types.ts`) — see Favorites below.

---

## Favorites / pinning (cross-cutting primitive introduced here)

**Two stores, one stable API.** The authoritative "is this favorited?" flag lives in the canonical **`platform.user_entity_state`** ledger (written through `favoritesService`). The **`favorites` module of `user_preferences`** (synced JSON, hydrated into Redux at boot) is the **presentation cache** — the display snapshot that renders both surfaces instantly with **zero fetch**, and the transition-continuity read. Every pin/unpin/toggle writes **both**.

- **Canonical write:** `favoritesService` (`features/scopes/service/favoritesService.ts`) — the **sole chokepoint** for the `ues_set` / `ues_list` / `ues_get_bulk` / `ues_touch` SECURITY-DEFINER RPCs (`authenticated` has no direct `platform.*` grant). Sibling to `associationsService` / `categoriesService`; returns `ScopesRpcResult`, never throws. Entity favorites key by their real uuid; `nav` destinations aren't entities (no uuid) so they key by a stable `uuidv5(href)` under entity_type `"nav"`.
- **Presentation cache / store:** `userPreferences.favorites.items: FavoriteItem[]`, capped at `FAVORITES_MAX` (50). Dedupe + cap + ordering enforced in the slice reducers (`addFavorite` / `removeFavorite` / `toggleFavorite` / `reorderFavorites` / `setFavorites`). Each item is a self-contained **reference** (`label`/`href`/`iconName`/`color` snapshot), not a bare id — that's what lets the sidebar + grid render without resolving anything.
- **Hook:** `usePinned()` (`components/favorites/usePinned.ts`) — `{ favorites, isPinned, pin, unpin, toggle, reorder }`; **public API unchanged**. Dual-writes (prefs cache reducer + canonical flag). `favoriteId(kind, id)` builds stable cache ids (`nav` favorites use their href); `favoriteEntityRef(item)` maps an item to its `(entityType, entityId)` canonical coordinates.
- **Vocabulary:** `FavoriteKind` = canonical **`EntityType | "nav"`** (`features/scopes/types.ts`) — no parallel union; a new favoritable type is added to `platform.entity_types` (then `EntityType`), never invented here.
- **Button:** `<PinButton item={...} />` (`components/favorites/PinButton.tsx`) — drop on any card/row/header to pin anything.
- **Sidebar:** `FavoritesNavGroup` (`features/shell/components/sidebar/FavoritesNavGroup.tsx`) — the dual purpose. Reuses `NavFlyoutGroup`; reads pins from Redux; the flyout panel only renders on hover/click (nothing renders until interacted, no query ever). Always appends a **"Manage favorites"** action (nav-action id `manage-favorites` → `navActions.ts`) at the bottom of the flyout.
- **Manager:** `FavoritesManagerPanel` (`components/favorites/FavoritesManagerPanel.tsx`) — a checklist of every nav destination (`flattenNavDestinations()`) plus "other pins"; check/uncheck to pin/unpin. Shown as the `favoritesManagerWindow` overlay (`features/window-panels/windows/FavoritesManagerWindow.tsx` + opener `features/overlays/openers/favoritesManagerWindow.tsx`). Opened from the sidebar Favorites flyout.

---

## Key flows

1. **Metrics load.** `MetricsStrip` → `useDashboardMetrics()` → `supabase.rpc("get_user_dashboard_metrics")` (cached 60s). Zero counts render the `emptyHint` nudge ("Build your first agent").
2. **Pin from Discover.** Hover a Discover card → `<PinButton>` → `usePinned().toggle()` → **both** the `toggleFavorite` reducer (prefs cache, debounced upsert + cross-tab broadcast) **and** `favoritesService.setFavorite(...)` (canonical `user_entity_state` flag, `ues_set`). The item appears in `PinnedSection` and `FavoritesNavGroup` immediately (same Redux read).
3. **Discover rotation.** `useDiscoverRotation(DISCOVER_POOL, 6)` returns a window seeded by day + per-mount cursor; "Show more" advances it. First page load is deterministic (offset based on values computed in `useState` initializers) → no hydration mismatch.

---

## Invariants & gotchas

- **Route group, not URL.** `/dashboard` is the URL regardless of group; moving the folder `(transitional)→(core)` kept every login/redirect reference valid. Don't add a second `/dashboard` route.
- **Favorites cap is load-bearing.** Never bypass the reducers to push into `favorites.items` directly — the cap/dedupe protects the preferences blob size.
- **Always toggle favorites through `usePinned`.** It dual-writes the canonical `user_entity_state` flag (authoritative) **and** the prefs cache (instant render). Dispatching the favorite reducers directly skips the canonical write; calling `favoritesService` alone loses the display snapshot.
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
- `favoritesService` (`features/scopes/service/favoritesService.ts`) — Why new: `platform.user_entity_state` had no FE chokepoint. Considered extending: `associationsService` / `categoriesService`. Rejected because: different table + RPCs + semantics (per-user flags, not org edges/nouns). Built as their exact sibling (same `ScopesRpcResult` envelope + `rpc()` cast-bridge), not a fork.
- `features/dashboard/*` components — Why new: replaces the deleted `(transitional)/dashboard` page; organizes route-local code into its feature folder per File Organization.

---

## Change log

- `2026-06-24` — Claude: **Favorites now persist to the canonical `platform.user_entity_state` ledger** via the new **`favoritesService`** chokepoint (`ues_*` RPCs); the `user_preferences` blob is now the presentation cache + transition-continuity read (every toggle dual-writes). `FavoriteKind` folded onto canonical `EntityType | "nav"` (`features/scopes/types.ts`) — parallel union deleted. `nav` favorites key by `uuidv5(href)` under entity_type `"nav"`. `usePinned` / `PinButton` / `FavoritesNavGroup` public APIs unchanged. Verified live: toggle on `/dashboard` → `ues_set` 204 → row read back from `user_entity_state` via `ues_list`.
- `2026-06-24` — Claude: Added the **Manage Favorites** window (`favoritesManagerWindow` overlay + `FavoritesManagerPanel`) — a check-to-include picker reachable from the sidebar Favorites flyout ("Manage favorites" action). Extracted `flattenNavDestinations()` into the nav registry (shared by the manager + Discover).
- `2026-06-24` — Claude: Added 3 KPIs (research reports `rs_topic`, podcasts `pc_episodes`, messages `dm_messages`). Registered `Star` in `shellIconMap` (fixes empty collapsed Favorites entry). Consolidated all curation into `dashboard.config.ts` (Discover hide/order/extra + Start-something).
- `2026-06-24` — Claude: Moved `/dashboard` from `(transitional)` to `(core)`; rebuilt as a lean hub (engagement metrics via new `get_user_dashboard_metrics` RPC, quick actions, pinned favorites, rotating Discover). Removed the AI-models widget. Added the favorites/pinning primitive (preferences module + `usePinned`/`PinButton`) and the sidebar `FavoritesNavGroup`.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change, update status, flows, and the Change log here.
