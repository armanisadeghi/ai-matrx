# FEATURE.md — `admin/relationships` (Relationship Manager)

**Status:** `active`
**Route:** `/administration/relationships` (Super Admin — gated by the `(admin)` layout)
**Owner surface for:** the reachability / containment registry admin control plane.

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
  `admin_unregistered_pairs`, `admin_relationship_problems` in parallel, throws
  loudly on any RPC error, passes to the client island.
- **Client island:** `features/admin/relationships/components/RelationshipManagerClient.tsx`
  — all interactivity + mutations. Registry grid is **`MatrxDataTable`**
  (`components/official/matrx-data-table/`).
- **Rule editor:** `RuleEditorForm.tsx` — side panel body for create/edit.
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

## Key flows

- **Define a rule:** New rule → pick source (content) + target (container) via
  `EntityTypeCombobox` → container side + conveyance ceiling → upsert.
- **Convey guardrail:** flipping a rule to conveying (or changing side/ceiling)
  prompts a confirm naming how many existing edges start conveying.
- **Resolve drift:** the Drift panel lists every problem with a per-row action
  (Register-as-known for strays, Open-rule for the rest).
- **Enforce:** enforcement can only be enabled when unregistered pairs = 0
  (switch is disabled with a tooltip otherwise).

## Invariants & gotchas

- **Direction doctrine — little points to big.** Source = content, target =
  container; `container_side='target'` is the norm. `'source'` (big→little) is a
  documented exception, tinted amber. The DB rejects wrong-direction writes.
- **Container tint = the container side** in every row/chip — the primary-tinted
  entity is the one that conveys.
- **Cache is disposable.** Never write `platform.reachability` from the UI; the
  only affordance is Rebuild.
- **Plain language is on-demand, never a table cell** — row tooltip + a live
  sentence in the editor. The table itself is structured columns.
- Entity chips/pickers resolve through the **one** entity registry
  (`features/scopes/registry/entityRegistry`) → `components/entity-types/*`.

## Related features

- Reachability rollout doc: `docs/db_changes/REACHABILITY-ROLLOUT.md`.
- Sharing / permissions: `features/sharing/FEATURE.md` (grants + memberships that
  the cascade composes with in `iam.has_access`).
- Canonical associations: `.claude/skills/canonical-associations`.

## Doctrine compliance

- **Reusable primitives extracted:** `components/entity-types/EntityTypeChip` +
  `EntityTypeCombobox` (consumed here; available to every association surface).
- **Table chrome:** `MatrxDataTable` — sticky headers, every-column filter/sort,
  toolbar facets, row → `SidePanelSurface` / `MatrxDynamicPanelHost`, panel icon →
  `WindowPanel`. Blocking `Sheet` retired for the rule editor.
- Types derived from generated `Database` types; no `any`, no hand-mirroring.
- Loud recovery: the page throws on any RPC load error rather than rendering a
  half-empty control plane.

## Change log

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
