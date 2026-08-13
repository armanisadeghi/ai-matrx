# FEATURE.md — Administration navigation

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-07-23`

---

## Purpose

Administration navigation organizes every existing `/administration` page into
one maintained hierarchy: **domain → section → destination**. The same registry
drives the Administration dashboard, injected AppShell menu, desktop/mobile
entry menus, route directory, and release-time completeness audit.

Every domain owns a real static route at `/administration/<domain-slug>`, and
every administration destination is physically nested below that root. The
dashboard renders direct destination rows for every domain; domain landing
pages are optional focused views, never a required intermediate click.

This feature organizes admin surfaces; it never invents an admin page for a
product feature that does not already have one.

---

## Entry points

**Routes**

- `app/(admin)/administration/page.tsx` — Administration dashboard.
- `app/(admin)/administration/AdminDashboardClient.tsx` — direct destination directory, destination search, and filesystem route search.
- `features/admin/components/AdminDomainDirectory.tsx` — compact domain renderer shared by the dashboard and every static domain landing page.
- `app/(admin)/administration/_nav/AdminNavTreeMenu.tsx` — compact header tree over the same hierarchy.
- `app/(admin)/administration/utilities/all-routes/page.tsx` — filesystem route directory grouped by its declared registry location.

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
3. The dashboard exposes every destination directly. The user may also open a real domain root such as `/administration/compute` for a focused view.
4. Sidebar, header, desktop flyout, and mobile menu expose the same domain roots and canonical nested destinations.
5. The shared switcher restores the Main Menu; its Administration switch restores the route menu without navigation.

### Add or move an admin route

1. Add the real page beneath its canonical `app/(admin)/administration/<domain-slug>/` root.
2. Reuse or add its display metadata in `admin-categories.ts`.
3. Place the destination in `admin-navigation.ts`. If it is a detail/editor leaf that should not be a menu row, add its exact page pattern to the owning destination's `ownedRoutes`.
4. Run `pnpm check:admin-catalog --strict`; the filesystem and declarations must match exactly.

### Release-time drift detection

1. `release.sh` runs the advisory release gates.
2. `check-admin-catalog.ts` independently discovers every Administration page and compares it with every destination/`ownedRoutes` declaration.
3. Any missing, stale, scanner-drifted, query-domain, or cross-domain route prints a large red `ADMIN ROUTE REGISTRY GAP — RELEASE IS CONTINUING` alarm.
4. Advisory release execution continues. `--strict` remains available as an intentional manual hard gate.

---

## Invariants & gotchas

- `admin-navigation.ts` is the only hierarchy. Never create a second dashboard, sidebar, or mobile grouping object.
- The expanded Administration route sidebar has exactly two visual levels:
  separated all-caps domain headers and full-size clickable destination rows.
  Registry sections remain useful for directories and search, but must not add
  a third, non-clickable label layer to the space-constrained sidebar. Do not
  add `Browse <domain>` filler links; the domain's real root destination is
  already rendered from the registry.
- Administration sidebar chrome uses semantic theme colors (`background`,
  `foreground`, `accent`, `accent-foreground`, `border`). Destination rows must
  not use `muted-foreground`, which makes working navigation look disabled.
- Administration sidebar labels use normal font weight, including the active
  destination. Active state is communicated through semantic color and
  background only; do not bold navigation text.
- Domain navigation uses static paths such as `/administration/compute`; `?domain=` routing and catch-all domain pages are forbidden.
- Every `/administration` destination and owned detail route must equal or descend from its declared domain root. `pnpm check:admin-catalog --strict` enforces this.
- Every Administration page pattern is declared exactly once as either a destination link or an `ownedRoutes` entry. Parent-prefix inference is forbidden because it hides new pages.
- Only real admin destinations appear. A conceptual domain such as Knowledge or Scopes may remain sparse until actual admin pages exist.
- AI, Agents, and Chat are separate domains. Knowledge owns existing CMS, podcast, research, knowledge-graph, and future RAG admin destinations.
- Specific route-menu matches must precede the generic Administration matcher. This preserves the Agent Run menu on `/administration/agents/system-agents/agents/[id]/run`.
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
- `AdminDomainDirectory` — one compact direct-link renderer shared by the dashboard and static domain roots; it replaces the parameter-driven animated-card view.

---

## Current work / migration state

The old category catalog remains only as destination display metadata. All
navigation placement and exact route ownership have moved to
`admin-navigation.ts`. Legacy flat routes and the former `?domain=` URLs
redirect to the canonical nested route tree through
`utils/next-config/adminRouteRedirects.js`.

The Applications → Configuration destination also owns non-secret recurring
credential-maintenance metadata. Super-admin expiry notifications deep-link to
that existing editor; private keys and client secrets remain outside
`app_config`.

---

## Change log

- `2026-08-13` — Claude: made the Official Components registry
  (`/administration/ui/official-components`) agent-readable. Both routes now
  mount `SurfaceRuntimeProvider` for `matrx-admin/official-components`, which
  previously declared 12 surface values and emitted none — the list page
  supplies the search/category/count values, `[componentId]/page.tsx` supplies
  the `current_component_*` set, and `data-surface-value` anchors were added to
  the rendered elements so Locate works. Both `getScope` callbacks are
  synchronous over live render state (the Surface Context window polls them
  every 400ms). `readiness` `stub` → `partial`. No behavioural change to either
  page. The surface's standing NO on write targets was re-verified and left in
  place: `componentList` is a hardcoded in-repo array with no backing table,
  edit form, or mutation path, so the registry stays a read-only report.

- `2026-08-13` — Claude: mounted `<SurfaceRuntimeProvider>` on the Sandbox
  Management console (`/administration/compute/sandbox`), which had a full
  9-value surface manifest and no emitter — `createAdminSandboxScope` had zero
  call sites, so the route mapping named the surface in the Agents popover
  while it emitted nothing and every agent launched there saw an empty scope.
  `getScope` is synchronous over live render state (the Surface Context window
  samples it every 400ms, so an emitter that re-fetched `/api/admin/sandbox`
  would hammer the fleet-wide admin endpoint behind an idle-looking panel);
  the page's existing 15s poll stays the only fetch. Added
  `expanded_sandbox_instance` so the expanded row's detail reaches agent
  context — the `instance_detail` group promised "container, TTL, paths,
  config" while declaring only an id, and `sandbox_instances` is
  bindable-only. Values are projected field-by-field rather than spread, so
  `metadata` / `organization_id` / `project_id` cannot leak in behind a
  description that promises eleven fields. Write targets ruled OUT with
  reasons recorded in the manifest — the page has zero inputs and its only
  mutations are stop / delete / mint-SSH. See `features/surfaces/FEATURE.md`
  for the full entry.
- `2026-08-12` — Claude: corrected the Email Users surface's `readinessNote`,
  which claimed `writeTargets` had no DB mirror. It has had one since
  2026-08-11: `ui.ui_surface_write_target` carries `email_draft` with every
  column matching the manifest, including a byte-exact 1547-character
  description, so aidream can advertise the target server-side. The two real
  gaps (no `data-surface-value` anchors, read values un-audited) are kept. No
  code changed — the target itself was re-verified a third time, on a newer
  `main`, with four live Badass Agent runs: one ask dialog covers subject and
  body together and renders the description verbatim, Apply preserves real
  newlines, a recipients request is refused with no dialog raised, "Keep as is"
  declines cleanly, and a forced two-line subject returns the handler's throw
  verbatim with nothing staged. No email was sent at any point. A pending-work
  claim inherited from an earlier entry is a claim, not a fact — this one cost
  one query to disprove. See `features/surfaces/FEATURE.md` for the full entry.

- `2026-08-12` — Claude: independently re-verified the Email Users
  `email_draft` write target and closed the docs gap it shipped with. No code
  changed — the 2026-08-10 design below was found already on `main` and kept
  untouched. `matrx-admin/email` was missing entirely from
  `features/surfaces/FEATURE.md` (neither the agent-writable adopter list nor
  its Change Log mentioned it), which is where the campaign looks to tell a
  shipped surface from an unclaimed one; both are now written. Re-verified with
  five live Badass Agent runs: one ask dialog covers subject and body together
  and renders the manifest description verbatim with its length bounds
  interpolated from the constants module; Apply lands real newlines with no
  double-encoding; "Keep as is" left pre-typed sentinel copy byte-identical;
  a combined ask to spoof the From address, select every platform user, and
  send was refused outright with nothing staged and no dialog raised; and a
  two-line subject returned the handler's own throw verbatim with both fields
  still empty (validate-then-apply). Error Inspector showed zero captures on a
  clean load and exactly two on the deliberate contract break — the seam being
  loud by design. Still open, as the manifest's `readinessNote` already says:
  `writeTargets` has no `ui.ui_surface_write_target` mirror, so aidream cannot
  advertise this target server-side; the client tool is unaffected.
- `2026-08-12` — Claude: made the Feedback & Announcements console
  (`/administration/users/feedback`) agent-writable through the surfaces seam.
  `matrx-admin/feedback` declares TWO `mode:"draft"` / `applyPolicy:"ask"`
  targets: `announcement_draft`, a partial
  `{title?, message?, announcement_type?}` staged through the announcement
  dialogs' own setters, and `category_draft`, a partial `{name?, description?}`
  staged through `CategoriesTab`'s own `setEditing`. Validation lives in the
  pure `features/admin/feedback/announcement-draft.ts` and `category-draft.ts`,
  which the manifest interpolates into the model-facing descriptions so the
  advertised contract is the enforced one; `ANNOUNCEMENT_TYPES` was added to
  `types/feedback.types.ts` (with `AnnouncementType` derived from it, the
  existing `FEEDBACK_TYPES` pattern) so the enum check reads the same array the
  `<Select>` renders. `FeedbackManagementContainer` also mounts the surface's
  FIRST `SurfaceRuntimeProvider` — the manifest previously had no emitter, so
  it published nothing and could service nothing (`readiness` `stub` →
  `partial`). **Two structural notes worth reusing on other admin consoles.**
  (a) The editors are Radix MODALS, which set `pointer-events: none` on the
  body, so an admin cannot open one and then type to an agent — verified. A
  target that only writes into an already-open dialog is dead code, so
  `announcement_draft` opens the create dialog itself, both dialogs got
  `onInteractOutside={(e) => e.preventDefault()}` (the surface-write confirm
  renders outside them and would otherwise close them mid-stage), and
  `category_draft` reveals the Manage Categories view. (b) TWO components own
  "the announcement editor", so handlers could not be registered per-component
  without a last-one-wins collision; the dialogs and the categories tab publish
  handles into a page-scoped ref registry (`FeedbackConsoleEditorStore.tsx`)
  and the container owns one handler per target that resolves the live editor,
  prefers the open Edit dialog, and refuses when both are open. Guards are read
  off that ref at call time because `applySurfaceWrite` resolves handlers
  before the confirm is answered. Publishing (`is_active`, create/save),
  `min_display_seconds`, every feedback triage/routing field, ids and delete
  stay human-only; the authored fields inside `FeedbackDetailDialog` are
  omitted on reachability — see the manifest docblock. Live-verified with real
  agent runs (stage-only, nothing published); zero `surface-writeback` captures
  on a clean load.
- `2026-08-10` — Claude: made the Email Users compose tool
  (`/administration/users/email`) agent-writable through the surfaces seam.
  `matrx-admin/email` declares ONE `mode:"draft"` / `applyPolicy:"ask"` write
  target, `email_draft`, taking a partial `{subject?, message_body?}` and
  staging it through the same `setSubject` / `setMessage` the admin's own
  typing calls; `AdminEmailPage` also mounts the surface's FIRST
  `SurfaceRuntimeProvider` — the manifest previously had no emitter at all, so
  it published nothing and could service nothing. Validation lives in the pure
  `features/admin/shared/email-compose-draft.ts`: non-empty plain-text strings,
  a single-line subject (a CR/LF in an email header is injection-shaped and
  impossible to type into the real `<input>`), and length ceilings the manifest
  description interpolates so the contract and the enforcement cannot drift.
  Staging only — the admin still presses Send Email, and `POST
  /api/admin/email` is never reached by an agent. The recipients (mode, typed
  address list, selected users) and the custom From address deliberately have
  NO write path: they are identity and blast radius, not authored copy. There
  is no send target by design.
- `2026-08-10` — Claude: made the Applications Configuration editor
  agent-writable through the surfaces seam. `matrx-admin/applications` declares
  ONE `mode:"draft"` / `applyPolicy:"ask"` write target, `app_notice`, staging
  the operator broadcast (`AppConfigV1.notice`) into the editor draft;
  validation lives in the pure, unit-tested
  `config/notice-write-targets.ts` (level checked against the canonical
  `NOTICE_LEVELS`, `title`/`body` required, `url` through `httpsUrlSchema`,
  forward-compat `extras` preserved), and the handler registers from
  `AppConfigEditor` via `useSurfaceWriteHandlers` because that component owns
  the draft. Staging only — the admin still saves through the same
  validate → diff-confirm → `admin_update_app_config` RPC as a hand edit. The
  server URLs, `min_supported_app_version`, flags, credential maintenance and
  catalog artifact pinning deliberately have NO write path: they are
  infrastructure and governance, not authored content. New read value
  `config_editor_notice` emits the SAVED notice as the target's read twin.
- `2026-08-07` — Codex: extended the existing Applications Configuration
  editor with generic credential-lifecycle metadata and wired global
  super-admin expiry reminders to its deep-linked Manage flow.
- `2026-07-27` — Codex: tightened the Administration sidebar's left inset and
  removed bold/medium font weights from headers, destinations, and active rows.
- `2026-07-27` — Codex: flattened the Administration route sidebar to all-caps
  domain headers plus real clickable destinations, removed duplicate
  `Browse <domain>` and registry-section label layers, and restored semantic
  foreground/background navigation colors.
- `2026-07-23` — Codex: replaced query-parameter domain views with real static domain routes, physically nested all administration pages, added legacy redirects, rendered direct dashboard links, and enforced domain-root ownership in the catalog check.
- `2026-07-22` — Codex: registered the Organizations & Memberships destination inside Users & Access.
- `2026-07-21` — Codex: introduced the canonical three-level registry, migrated all admin navigation surfaces, added AppShell route-menu injection, and made exact non-blocking release drift detection loud.
