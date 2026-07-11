# FEATURE.md — `admin/relationships` (Relationship Manager)

**Status:** `active`
**Routes:** `/administration/relationships` · `/administration/relationships/[token]` (Super Admin — gated by the `(admin)` layout)
**Owner surface for:** the reachability / containment registry admin control plane, **and** the full `platform.shareable_resource_registry` CRUD (fixes `conveying_container_not_shareable` in place — `/administration/sharing` keeps its link-policy specialty view).

---

## Purpose

The no-SQL control plane for the platform's **reachability / sharing-cascade** system
(`docs/db_changes/REACHABILITY-ROLLOUT.md`). Arman defines, here, **which
association shapes exist, which of them convey access when a container is shared,
and at what ceiling** — and the page reports **all drift** between the registry
and the live association data.

The load-bearing model: `platform.association_types` (the rule/edge dictionary) +
`platform.associations` (the tuples) are truth; `platform.reachability` is a
disposable closure cache rebuilt by DB triggers. A rule change here triggers an
automatic full closure rebuild in the DB — the UI just `router.refresh()`es.

## Entry points

- **Page (Server Component):** `app/(admin)/administration/relationships/page.tsx`
  — fetches `admin_relationship_system_status`, `admin_relationship_rules`,
  `admin_relationship_problems`, `admin_shareable_registry_list` in parallel,
  throws loudly on any RPC error, passes to the client island.
- **Client island:** `features/admin/relationships/components/RelationshipManagerClient.tsx`
  — all interactivity + mutations. Registry grid is **`MatrxDataTable`**
  (`components/official/matrx-data-table/`).
- **Rule editor:** `RuleEditorForm.tsx` — side panel body for create/edit.
- **Shareable registry:** `ShareableRegistryPanel.tsx` (table + CRUD) +
  `ShareableResourceForm.tsx` (side-panel body). Drift row's "Register as
  shareable" (kind `conveying_container_not_shareable`) sets a pending token
  the panel consumes on mount — scrolls into view and opens pre-filled from
  `admin_shareable_registry_defaults`.
- **Entity explorer:**
  - Core (route-agnostic): `EntityRelationshipOrbit.tsx` + pure helper
    `buildOrbitGraph` (`features/admin/relationships/utils.ts`) — sources that
    target the focus token (left), the focus (center), targets it points to
    (right). Shape is React-Flow-ready (token + rule per neighbor) for a
    future graph canvas — not wired in this PR.
  - Route: `app/(admin)/administration/relationships/[token]/page.tsx` +
    `EntityExplorerHeader.tsx` (back link + re-pick token).
  - List-page + route-header entry point: `EntityExplorerEntry.tsx` — entity
    picker with **Open page** (`router.push` + `useTransition`) and **Open in
    window** (`EntityRelationshipOrbitWindow.tsx`, a `WindowPanel` composition
    root reached only via `dynamic({ ssr: false })` — see `window-panels`
    skill).
- **Types:** `features/admin/relationships/types.ts` — every shape derived from the
  generated `Database` types; never hand-mirrored.
- **Admin catalog:** `features/admin/constants/admin-categories.ts` ("Relationship Manager").

## Data model (all via `public.` SECURITY DEFINER RPCs, each re-checks `is_super_admin()`)

`platform.*` has **no client grants** — supabase-js can only reach the exposed
`public.` wrappers. Migrations: `migrations/relationship_manager_admin_rpcs.sql`,
`relationship_rules_reverse_count_refinement.sql`,
`relationship_manager_crud_and_problems.sql`.

| RPC | Role |
|---|---|
| `admin_relationship_rules()` | Rules + live `edge_count` / `closure_rows` / `reverse_edge_count`. |
| `admin_relationship_system_status()` | Status tiles (totals, enforcement state). |
| `admin_unregistered_pairs()` | Shapes in data with no active rule (drives the enforcement lock). |
| `admin_relationship_problems()` | **Unified drift report** — see below. |
| `admin_upsert_relationship_rule(...)` | Create **and** update (ON CONFLICT). `''` label/notes → NULL. |
| `admin_delete_relationship_rule(source, target, label?)` | True delete (completes CRUD). |
| `admin_rebuild_reachability()` | Nuke + rebuild the closure cache; returns row count. |
| `admin_reachability_contents/containers(type, id)` | The "why can they see this?" inspector. |
| `admin_set_association_enforcement(bool)` | Toggle the write-time known-shape guard trigger. |

**`admin_relationship_problems()` drift categories** (ordered error-first): `unregistered_pair`,
`wrong_way_edges`, `conveying_container_not_shareable` (DB-only drift the client
can't compute — a conveying rule whose container isn't in
`shareable_resource_registry`, so the cascade is dead), `conveying_rule_no_edges`,
`inactive_rule_with_edges`.

### Shareable resource registry RPCs

Migration: `migrations/relationship_manager_shareable_admin_rpcs.sql` (same
`public.` wrapper / `is_super_admin()` re-check pattern). Full CRUD home for
`platform.shareable_resource_registry`; absorbs the same `is_link_shareable` /
`public_columns` levers `admin_set_share_policy` touches so this page owns the
entire row — `/administration/sharing` keeps working unchanged on the same table.

| RPC | Role |
|---|---|
| `admin_shareable_registry_list()` | Full rows for the registry table. |
| `admin_shareable_registry_defaults(token)` | Prefill schema/table/label from `platform.entity_types` when registering a token that isn't shareable yet. |
| `admin_upsert_shareable_resource(...)` | Create/update a row (ON CONFLICT on `resource_type`). Same "typo can't become a phantom public-column allowlist entry" guard as `admin_set_share_policy`. |
| `admin_set_shareable_active(resource_type, active)` | Soft on/off — keeps history; flipping off re-creates `conveying_container_not_shareable` drift on purpose. |

## Key flows

- **Define a rule:** New rule → pick source (content) + target (container) via
  the tabular `EntityTypeCombobox` (existing pairs for the current label are
  disabled + listed as chips) → container side + conveyance ceiling → upsert
  immediately (no confirm).
- **Resolve drift:** the Drift panel lists every problem with a per-row action —
  **Register as known** for strays, **Register as shareable** for
  `conveying_container_not_shareable` (opens the Shareable registry panel
  pre-filled with the missing container token), **Open rule** for the rest.
- **Enforce:** enforcement can only be enabled when unregistered pairs = 0
  (switch is disabled with a tooltip otherwise).
- **Manage what can be shared:** the Shareable registry panel is full CRUD —
  **Register resource** picks any entity token not yet registered (tabular
  `EntityTypeCombobox`, already-registered tokens disabled) and prefills
  schema/table/label from `platform.entity_types`; inline edit covers
  active/RLS-grants/scopeable/link-shareable/notes; a toast reminds that
  `utils/permissions/registry.ts` needs `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`
  after any register/upsert (no browser write to that file).
- **Explore an entity type:** pick any token in the Entity explorer (or from
  a drift/registry row) → **Open page** for the full `[token]` route or
  **Open in window** for a non-blocking peek; clicking a neighbor chip
  re-centers the orbit on that token (in-place, no navigation) via
  `onSelectToken`.

## Invariants & gotchas

- **Direction doctrine — little points to big.** Source = content, target =
  container; `container_side='target'` is the norm. `'source'` (big→little) is a
  documented exception, tinted amber. The DB rejects wrong-direction writes.
- **Container tint = the container side** in every row/chip — the primary-tinted
  entity is the one that conveys.
- **Cache is disposable.** Never write `platform.reachability` from the UI; the
  only affordance is Rebuild.
- **Plain language is on-demand, never a table cell** — row tooltip + a live
  sentence in the editor. Between drift and the registry sits a compact
  HIGH-CONTRAST legend (`SMALL → LARGE | Conveys?`), not prose.
- Entity chips/pickers resolve through the **one** entity registry
  (`features/scopes/registry/entityRegistry`) → `components/entity-types/*`.
- Drift panel + each problem row use `<CopyButtons>` (same Copy / Copy-for-AI
  primitive as the registry table).

## Related features

- Reachability rollout doc: `docs/db_changes/REACHABILITY-ROLLOUT.md`.
- Sharing / permissions: `features/sharing/FEATURE.md` (grants + memberships that
  the cascade composes with in `iam.has_access`); `/administration/sharing`
  keeps its link-policy specialty view (`admin_list_share_policies` /
  `admin_set_share_policy`) on the same `shareable_resource_registry` table —
  not merged or deleted.
- Canonical associations: `.claude/skills/canonical-associations`.
- Window Panels (the `EntityRelationshipOrbitWindow` composition root):
  `.claude/skills/window-panels`.

## Doctrine compliance

- **Reusable primitives extracted:** `components/entity-types/EntityTypeChip` +
  `EntityTypeCombobox` (consumed here; available to every association surface).
- **Table chrome:** `MatrxDataTable` — sticky headers, every-column filter/sort,
  toolbar facets, row → `SidePanelSurface` / `MatrxDynamicPanelHost`, panel icon →
  `WindowPanel`. Blocking `Sheet` retired for the rule editor.
- **One core component, two shells:** `EntityRelationshipOrbit` is
  route-agnostic — the `[token]` page and `EntityRelationshipOrbitWindow`
  (WindowPanel) both render it unchanged; no fork.
- **Bundle discipline:** `WindowPanel` reached only through
  `dynamic(() => import(...), { ssr: false })` in `EntityExplorerEntry` — never
  a static import from the list page or the `[token]` route.
- Types derived from generated `Database` types; no `any`, no hand-mirroring.
- Loud recovery: both pages throw on any RPC load error rather than rendering a
  half-empty control plane.

## Change log

- **2026-07-11** — Shareable resource registry gets a full CRUD home here
  (`ShareableRegistryPanel` / `ShareableResourceForm`; new RPCs
  `admin_shareable_registry_list/_defaults`, `admin_upsert_shareable_resource`,
  `admin_set_shareable_active`) — the drift panel's "Register as shareable"
  fixes `conveying_container_not_shareable` in place. New entity-type explorer:
  `EntityRelationshipOrbit` (+ pure `buildOrbitGraph` helper) rendered at
  `/administration/relationships/[token]` and inside a page-local `WindowPanel`
  (`EntityRelationshipOrbitWindow`, lazy-loaded) — one core component, two
  shells, React-Flow-ready data shape for a future graph canvas.
- **2026-07-11** — Drift panel: Copy / Copy-for-AI on the section + each row.
  Direction novel between panels replaced with a compact high-contrast
  `SMALL → LARGE | Conveys?` legend table.
- **2026-07-11** — Save rule is immediate — no conveyance confirm dialog.
- **2026-07-11** — New-rule sheet: `EntityTypeCombobox` is a wide tabular picker
  (Name · Token · Table — full labels, no truncation). Create mode disables
  source/target pairs that already exist for the current label and lists the
  source’s existing targets as chips under the target field.
- **2026-07-11** — Registry cut over to canonical `MatrxDataTable`; rule editor
  moves to `SidePanelSurface` (create) / table detail panel (edit). Panel icon
  opens a WindowPanel with **View / Edit** tabs (Edit = same RuleEditorForm).
  Follow-up: searchable filters, clear-all, any-of entity search (source OR
  target), Copy/Copy-for-AI, deferred inline edit with Save/Cancel pill.
- **2026-07-09** — Full-CRUD rewrite: structured columnar registry (chips + a
  direction glyph, not prose), New/Edit/Delete rules, unified
  `admin_relationship_problems()` drift panel (adds the shareable-registry gap
  check), reachability inspector on the entity-type combobox. New RPCs:
  `admin_delete_relationship_rule`, `admin_relationship_problems`. New
  primitives: `EntityTypeChip`, `EntityTypeCombobox`.
- **2026-07-06** — Initial Relationship Manager shipped (read + partial mutations)
  alongside the reachability system rollout.
