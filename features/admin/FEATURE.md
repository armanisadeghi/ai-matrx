# FEATURE.md — Administration navigation

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-07-22`

---

## Purpose

Administration navigation organizes every existing `/administration` page into
one maintained hierarchy: **domain → section → destination**. The same registry
drives the Administration dashboard, injected AppShell menu, desktop/mobile
entry menus, route directory, and release-time completeness audit.

This feature organizes admin surfaces; it never invents an admin page for a
product feature that does not already have one.

---

## Entry points

**Routes**

- `app/(admin)/administration/page.tsx` — Administration dashboard.
- `app/(admin)/administration/AdminDashboardClient.tsx` — domain and section views, destination search, and filesystem route search.
- `app/(admin)/administration/_nav/AdminNavTreeMenu.tsx` — compact header tree over the same hierarchy.
- `app/(admin)/administration/admin-directory/page.tsx` — filesystem route directory grouped by its declared registry location.

**Canonical declarations**

- `features/admin/constants/admin-navigation.ts` — the one placement and route-ownership registry.
- `features/admin/constants/admin-categories.ts` — destination display metadata only: title, description, link, icon, and optional flags.
- `features/admin/users/FEATURE.md` — Users & Access route family, including reciprocal organization membership management.

**Shell navigation**

- `features/admin/components/AdminRouteSidebarMenu.tsx` — Administration route menu rendered by the shared route-menu slot.
- `features/shell/constants/route-menu-registry.ts` — maps every `/administration` pathname to the Administration menu; more-specific route menus remain first.
- `features/shell/components/sidebar/RouteMenuSlot.tsx` — shared desktop injection and Main Menu switcher.
- `features/shell/components/mobile-sheet/MobileRouteMenuSlot.tsx` — shared mobile injection and Main Menu switcher.
- `features/shell/components/sidebar/admin-menu/AdminMenu.tsx` — Administration entry menu shown while the main menu is active.
- `features/shell/components/sidebar/admin-menu/AdminMobileMenu.tsx` — equivalent main-menu entry on mobile.

**Release audit**

- `scripts/check-admin-catalog.ts` — compares every discovered page pattern to an exact registry declaration.
- `features/admin/utils/admin-route-catalog-server.ts` — filesystem discovery and comparison.
- `scripts/run-release-gates.sh --advisory` — runs the audit during `release.sh` (each gate announces itself before starting), surfaces its alarm, and continues the release.

---

## Data model

No database tables, API endpoints, or Redux state are owned by this feature.

**Key types**

- `AdminNavigationDomain` — top-level grouping such as AI, Agents, Chat, or Knowledge.
- `AdminNavigationSection` — the similar destinations collected within a domain.
- `AdminNavigationDestination` — a visible admin destination plus exact `ownedRoutes` for detail/editor leaves it owns.

---

## Key flows

### Navigate Administration

1. A user enters any `/administration` route.
2. `RouteMenuSlot` matches the Administration entry in `route-menu-registry.ts` and automatically displays `AdminRouteSidebarMenu` in place of the main app menu.
3. The user navigates domain → section → destination using declarations from `admin-navigation.ts`.
4. The shared switcher restores the Main Menu; its Administration switch restores the route menu without navigation.

### Add or move an admin route

1. Add the real page under `app/(admin)/administration`.
2. Reuse or add its display metadata in `admin-categories.ts`.
3. Place the destination in `admin-navigation.ts`. If it is a detail/editor leaf that should not be a menu row, add its exact page pattern to the owning destination's `ownedRoutes`.
4. Run `pnpm check:admin-catalog --strict`; the filesystem and declarations must match exactly.

### Release-time drift detection

1. `release.sh` runs the advisory release gates.
2. `check-admin-catalog.ts` independently discovers every Administration page and compares it with every destination/`ownedRoutes` declaration.
3. Any missing, stale, or scanner-drifted route prints a large red `ADMIN ROUTE REGISTRY GAP — RELEASE IS CONTINUING` alarm.
4. Advisory release execution continues. `--strict` remains available as an intentional manual hard gate.

---

## Invariants & gotchas

- `admin-navigation.ts` is the only hierarchy. Never create a second dashboard, sidebar, or mobile grouping object.
- Every Administration page pattern is declared exactly once as either a destination link or an `ownedRoutes` entry. Parent-prefix inference is forbidden because it hides new pages.
- Only real admin destinations appear. A conceptual domain such as Knowledge or Scopes may remain sparse until actual admin pages exist.
- AI, Agents, and Chat are separate domains. Knowledge owns existing CMS, podcast, research, knowledge-graph, and future RAG admin destinations.
- Specific route-menu matches must precede the generic Administration matcher. This preserves the Agent Run menu on `/administration/system-agents/agents/[id]/run`.
- Navigation gaps are loud but non-blocking during a normal release. Do not change the advisory release path into a silent skip or a hard release failure.

---

## Related features

- Depends on: `features/shell/` for route-menu injection and reversible switching.
- Depends on: `components/official/icons/IconResolver` for registry-declared icon names.
- Organizes but does not own the admin pages of every product feature.

---

## Doctrine compliance

**Primitives reused**

- Components: the existing `RouteMenuSlot`, `MobileRouteMenuSlot`, AppShell nav classes, shadcn dropdown primitives, and `IconResolver`.
- Utilities: existing filesystem route discovery and search-scoring utilities.
- State: the existing shell menu state; no parallel navigation state or Redux slice was introduced.

**Primitives introduced**

- `AdminNavigationDomain` / `AdminNavigationSection` / `AdminNavigationDestination` and `adminNavigationRegistry` — one generic hierarchy was required to replace multiple competing two-level category renderings and to give the release audit exact route ownership.
- `AdminRouteSidebarMenu` — a thin registry renderer matching the existing route-menu component contract; route switching and persistence remain owned by the shared shell primitive.

---

## Current work / migration state

The old category catalog remains only as destination display metadata. All
navigation placement and exact route ownership have moved to
`admin-navigation.ts`.

---

## Change log

- `2026-07-22` — Codex: registered the Organizations & Memberships destination inside Users & Access.
- `2026-07-21` — Codex: introduced the canonical three-level registry, migrated all admin navigation surfaces, added AppShell route-menu injection, and made exact non-blocking release drift detection loud.
