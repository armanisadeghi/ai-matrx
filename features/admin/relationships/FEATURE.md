# FEATURE.md — `admin/relationships` (Relationships Hub)

**Status:** `active`
**Routes (route-tabbed hub, Super Admin — gated by the `(admin)` layout):**
`/administration/database/relationships` (Overview) · `/rules` · `/entity-types` · `/sharing` · `/explorer` (+ `/explorer/[token]`) · `/reachability` · `/exposure-audit` · `/actions`
**Owner surface for:** the reachability / containment registry control plane, the **`platform.entity_types` registry admin** (the only UI write path), and the **one** home for `platform.shareable_resource_registry` (full CRUD **plus** link policy — the old `/administration/sharing` page is deleted and redirects here).

---

## Purpose

The no-SQL control plane for the platform's **reachability / sharing-cascade** system
(`docs/db_changes/REACHABILITY-ROLLOUT.md`) and the **entity-token vocabulary**. Arman
defines, here, **which entity types exist, which association shapes exist, which of
them convey access when a container is shared, and at what ceiling** — and the
Overview reports **all drift** between the registry and the live association data.

The load-bearing model: `platform.entity_types` (the token vocabulary) +
`platform.association_types` (the rule/edge dictionary) + `platform.associations`
(the tuples) are truth; `platform.reachability` is a disposable closure cache rebuilt
by DB triggers. A rule change here triggers an automatic full closure rebuild in the
DB — the UI just `router.refresh()`es.

## Structure — one layout, one route per tab

- **Layout:** `app/(admin)/administration/database/relationships/layout.tsx` →
  `RelationshipsAdminLayoutClient.tsx` (scheduling-admin pattern: `NAV_ITEMS`,
  `usePathname` active detection, `router.push` in `useTransition`, per-tab spinner).
  The layout owns viewport height (`h-[calc(100dvh-2.5rem)]`); each tab page renders
  inside `flex-1 overflow-hidden` — **never** re-subtract `100dvh` in a tab page.
- **The dynamic orbit route lives at `explorer/[token]`**, never at the hub root — a
  root-level `[token]` would shadow-race every static tab segment.
- Shared presentational atoms: `components/shared.tsx` (`StatusTile`,
  `DirectionGlyph`, `ConveyPill`). Pure helpers (`ruleKey`, `label`, `ruleSentence`,
  `PROBLEM_TITLES`, `problemHuman`, `buildOrbitGraph`, `tokensInRules`): `utils.ts`.
- **Types:** `types.ts` — every shape derived from the generated `Database` types;
  never hand-mirrored.
- **Admin navigation:** destination metadata lives in
  `features/admin/constants/admin-categories.ts`; placement and exact hub/tab
  route ownership live in `features/admin/constants/admin-navigation.ts`
  (`check:admin-catalog --strict` requires every page pattern).

| Tab | Page (server fetch) | Client |
|---|---|---|
| Overview | `page.tsx` (`admin_relationship_system_status` + `admin_relationship_problems`) | `RelationshipsOverviewClient` — status tiles, Rebuild cache, Enforcement switch, `ProblemsPanel`, direction legend |
| Rules | `rules/page.tsx` (`admin_relationship_rules`; `?edit=<source:target:label>`) | `RelationshipRulesClient` — `MatrxDataTable` + `RuleEditorForm` (side panel / WindowPanel), delete confirm |
| Entity Types | `entity-types/page.tsx` (`admin_entity_types_list`) | `EntityTypesClient` + `EntityTypeForm` — full CRUD, deactivate-only delete, generated-types drift banner |
| Sharing | `sharing/page.tsx` (`admin_shareable_registry_list` + `admin_list_share_policies`; `?register=<token>`) | `RelationshipSharingClient` → `ShareableRegistryPanel` (+ `ShareableResourceForm`, `SharePolicyColumnEditor`) |
| Explorer | `explorer/page.tsx` (`admin_relationship_rules`) | `RelationshipExplorerClient` → `EntityExplorerEntry` |
| Explorer orbit | `explorer/[token]/page.tsx` (`admin_relationship_rules`) | `EntityExplorerHeader` + `EntityRelationshipOrbitPageBody` |
| Reachability | `reachability/page.tsx` (none) | `ReachabilityInspectorClient` — self-fetching |
| Exposure Audit | `exposure-audit/page.tsx` (none) | `ExposureAuditClient` — super-admin summary + controlled, paginated file/note exposure inventory |
| Actions | `actions/page.tsx` (none) | `ActionCatalogClient` (`features/action-catalog/` — see its FEATURE.md; moved from the deleted `/administration/action-catalog` route) |

**Cross-tab deep links are consume-once query params:** the Overview drift panel's
"Open rule" → `/rules?edit=<ruleKey>` and "Register as shareable" →
`/sharing?register=<token>`; the target client applies the param once then strips it
with `router.replace` so refresh/back never re-triggers.

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
| `admin_exposure_audit_summary()` | Active/deleted counts by resource + visibility, including grant/link/context totals. |
| `admin_exposure_audit_rows(...)` | Paginated file/note rows with owner/org identity and exact public/internal/link/grant/context exposure reasons. |
| `admin_set_association_enforcement(bool)` | Toggle the write-time known-shape guard trigger. |

**`admin_relationship_problems()` drift categories** (ordered error-first): `unregistered_pair`,
`wrong_way_edges`, `conveying_container_not_shareable` (DB-only drift the client
can't compute — a conveying rule whose container isn't in
`shareable_resource_registry`, so the cascade is dead), `conveying_rule_no_edges`,
`inactive_rule_with_edges`.

### Entity types registry RPCs

Migration: `migrations/entity_types_admin_rpcs.sql` — the **first UI write path**
for `platform.entity_types` (registration was migration-only before). Same
`public.` wrapper / `is_super_admin()` pattern; grants to `authenticated` only.
**`public.entity_types_list()` (anon, active-only, feeds `pnpm gen:entity-types`)
is untouched — never widen or modify it.**

| RPC | Role |
|---|---|
| `admin_entity_types_list()` | ALL rows incl. inactive; `default_visibility` projected as text; `table_ref` as text. |
| `admin_upsert_entity_type(...)` | Create/update (ON CONFLICT on `token`). Validates token `^[a-z][a-z0-9_]*$` and that the physical table exists (loud RAISE otherwise); recomputes `table_ref` server-side. |
| `admin_set_entity_type_active(token, active)` | **The only "delete"** — tokens are FK targets of `platform.associations`; hard deletes are never offered. Loud on a missing token. |
| `admin_set_entity_type_agent_writable(token, enabled)` | Narrow super-admin toggle for generic `create:/update:/delete:` Matrx Actions; shared by Entity Types and the Actions matrix. |

**Generated-types drift:** after any registry write, `types/generated/entity-types.generated.ts`
is stale until `pnpm gen:entity-types` runs. `EntityTypesClient` compares active
registry tokens against `ENTITY_TYPE_TOKENS` and shows a persistent amber banner
(with the +/− token diff and a copy-command button) until they match;
`pnpm check:entity-types` is the CI gate.

### Shareable resource registry RPCs

Migration: `migrations/relationship_manager_shareable_admin_rpcs.sql` (same
pattern). The Sharing tab is the **one** home for
`platform.shareable_resource_registry` — full row CRUD **and** the link-policy
levers. The old `/administration/sharing` page is **deleted**; a `next.config.js`
redirect (2026-07-13) points it at `/administration/database/relationships/sharing`. Its
RPCs live on: `admin_list_share_policies` (contributes `supports_public` + the live
physical column list) and `admin_set_share_policy` (the narrow link-policy write
used by the per-row **Link policy** side panel).

| RPC | Role |
|---|---|
| `admin_shareable_registry_list()` | Full rows for the registry table. |
| `admin_shareable_registry_defaults(token)` | Prefill schema/table/label from `platform.entity_types` when registering a token that isn't shareable yet. |
| `admin_upsert_shareable_resource(...)` | Create/update a row (ON CONFLICT on `resource_type`). Same "typo can't become a phantom public-column allowlist entry" guard as `admin_set_share_policy`. |
| `admin_set_shareable_active(resource_type, active)` | Soft on/off — keeps history; flipping off re-creates `conveying_container_not_shareable` drift on purpose. |
| `admin_list_share_policies()` / `admin_set_share_policy(...)` | Link-policy read/write for the per-row **Link policy** editor (`SharePolicyColumnEditor` — secret-looking columns flagged, default-deny, destructive confirms on enable/expose). |

## Key flows

- **Define a rule (Rules tab):** New rule → pick source (content) + target
  (container) via the tabular `EntityTypeCombobox` (existing pairs for the current
  label are disabled + listed as chips) → container side + conveyance ceiling →
  upsert immediately (no confirm).
- **Resolve drift (Overview):** the Drift panel lists every problem with a per-row
  action — **Register as known** for strays (inline), **Register as shareable** for
  `conveying_container_not_shareable` (navigates to `/sharing?register=<token>`,
  form pre-filled from `admin_shareable_registry_defaults`), **Open rule** for the
  rest (navigates to `/rules?edit=<key>`, side-panel editor open).
- **Enforce (Overview):** enforcement can only be enabled when unregistered pairs =
  0 (switch is disabled with a tooltip otherwise).
- **Register an entity type (Entity Types tab):** New entity type → token +
  schema/table (must physically exist) + label + tier/category/visibility + flag
  switches → upsert. Deactivate via the row power action (ConfirmDialog states the
  semantics); the drift banner then demands `pnpm gen:entity-types`.
- **Toggle generic agent writes:** the `Agent writes` switch updates
  `platform.entity_types.agent_writable` through the narrow admin RPC. The Actions tab
  consumes the same mutation primitive, so both control surfaces stay identical.
- **Manage what can be shared (Sharing tab):** full CRUD — **Register resource**
  picks any entity token not yet registered and prefills from
  `platform.entity_types`; inline edit covers active/RLS-grants/scopeable/
  link-shareable/notes; the per-row **Link policy** action opens the no-login
  switch + public-columns allowlist editor. A toast reminds that
  `utils/permissions/registry.ts` needs `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`
  after any register/upsert (no browser write to that file).
- **Explore an entity type (Explorer tab):** pick any token → **Open page**
  (`explorer/[token]`) or **Open in window** (non-blocking peek); clicking a
  neighbor chip re-centers the orbit in place via `onSelectToken` (window) or
  navigates (page).
- **Audit exposed content (Exposure Audit tab):** start on truly public files +
  notes, then pivot to internal/link/shared/contextual/personal scopes; use the
  summary cards, file/note filter, server search, deleted toggle, and row
  inspector to see exactly why a row is reachable. Public notes are labeled as
  agent/RAG searchable; public files state that personal listings remain
  owner-or-explicit-grant only.

## Invariants & gotchas

- **Direction doctrine — little points to big.** Source = content, target =
  container; `container_side='target'` is the norm. `'source'` (big→little) is a
  documented exception, tinted amber. The DB rejects wrong-direction writes.
- **Container tint = the container side** in every row/chip — the primary-tinted
  entity is the one that conveys.
- **Cache is disposable.** Never write `platform.reachability` from the UI; the
  only affordance is Rebuild.
- **Entity-type deletion is deactivate-only** — tokens are FK targets of
  `platform.associations`. Never add a hard-delete affordance or RPC.
- **Plain language is on-demand, never a table cell** — row tooltip + a live
  sentence in the editor. The Overview carries a compact HIGH-CONTRAST legend
  (`SMALL → LARGE | Conveys?`), not prose.
- Entity chips/pickers resolve through the **one** entity registry
  (`features/scopes/registry/entityRegistry`) → `components/entity-types/*`.
- Drift panel + each problem row use `<CopyButtons>` (same Copy / Copy-for-AI
  primitive as the registry tables).
- **THE DOOR LAW** (`common-docs/policies/no-dead-ends.md`) — this hub names
  real records constantly, so it never prints a bare id or an unlinked name:
  a record name → `EntityRef`, a raw FK column → `MatrxUuidCell` with the
  row's own `token` (per-row via `fk.token`), a user → `AdminUserRef`, an
  entity TYPE → `EntityTypeChip` / `entityTypeHref` (both already link to the
  explorer). The Reachability Inspector is also a **destination**:
  `?mode=contents|containers&type=<token>&id=<uuid>` prefills and auto-runs.
- **Association-edge counts are deliberately inert.** `edge_count`,
  `closure_rows`, `reverse_edge_count` (Rules table, drift panel) count
  `platform.associations` rows that NO surface can list. Do **not** link them to
  a client-side read: SELECT RLS on that table is
  `iam.has_org_access(organization_id)` while the counts come from
  `is_super_admin()` RPCs, so the destination would silently under-report. The
  unblock is an `admin_association_edges(...)` SECURITY DEFINER RPC + an Edges
  destination — tracked in `docs/handoffs/no-dead-ends-sweep.md`.

## Deferred core audit — `content_role` is carrying ambiguous authority

This is intentionally an unresolved design decision, not something papered
over by the 2026-08-11 runtime fix. The immediate incident was a false alarm:
`platform.entity_types.content_role IS NULL` is valid and means the token is not
classified as a knowledge resource. The shared resolver nevertheless treated
NULL as invalid, substituted `destination`, and emitted `console.error`; global
production capture promoted that expected fallback into a red incident. The
resolver now alarms only on invalid **non-NULL** values.

The audit exposed a deeper recurring-failure class:

- The same five-value vocabulary is independently stored on
  `platform.entity_types.content_role` and
  `platform.shareable_resource_registry.content_role`. Both admin tabs edit
  their own copy. There is no database constraint, generated guard, or release
  check requiring them to agree.
- Live evidence on 2026-08-11: 324 active entity types; 37 have an entity role
  and 287 are NULL. There are 69 active shareable rows, 68 of which overlap an
  active entity token; **13 overlapping rows disagree**. Examples prove this is
  not merely missing backfill: `data_store` is `source` in `entity_types` but
  `container` in the shareable registry; `web_site` is NULL in `entity_types`
  but `container` in sharing; `udt_document` is `hybrid` in `entity_types` but
  NULL in sharing.
- `content_role` therefore has at least three observable jobs today: membership
  in curated attach/resource surfaces; visual grouping inside those surfaces;
  and classification of shareable organization modules. Those may be one
  concept with drift, or two concepts given the same name. The 13 disagreements
  must be classified before consolidating data.
- `EntityInfo.contentRole` is non-null even though its source is nullable.
  `getEntityInfo` converts NULL to `destination` to keep generic consumers
  total. That erases “explicitly an output” versus “unclassified but this caller
  demanded a bucket.” Curated callers correctly use `curatedTokens()` to exclude
  NULL; generic callers can accidentally treat the fallback as real metadata.
- A dedicated `unclassified` enum value would make absence explicit, but would
  **not** resolve duplicate authorities or decide whether every entity belongs
  on resource surfaces. Making the column NOT NULL and bulk-defaulting 287 rows
  to `destination` would encode false meaning and is specifically unsafe.

### Recommended investigation when this resumes

1. Define each axis without mentioning a table: “knowledge resource role” and
   “shareable module role.” If the definitions differ, split and rename the
   fields. If identical, choose `platform.entity_types` as the sole authority
   and remove the sharing copy.
2. Review the 13 live disagreements against their real consumers. Start with
   `data_store`, where `source` and `container` may both be defensible depending
   on which axis is intended.
3. Preserve nullability until classification completeness becomes an explicit
   product invariant. Carry `ContentRole | null` as truth in TypeScript and make
   grouping-only call sites choose an explicit fallback; do not hide that choice
   inside the general registry resolver.
4. Add a live drift guard before migration: equality across stores if this is
   one concept, or a guard against cross-use after deliberately splitting it.
5. Backfill, remove the obsolete editor/column, regenerate metadata, then test
   curated pickers, association lists, project references, war-room resources,
   organization modules, and shareable-registry flows.

Tracked as `FOUND_DEFECTS.md` D171. Do not “fix” recurrence with Error Inspector
downgrades, route-specific defaults, blind role backfills, or by making NULL
illegal before the semantic decision.

## Related features

- Reachability rollout doc: `docs/db_changes/REACHABILITY-ROLLOUT.md`.
- Sharing / permissions: `features/sharing/FEATURE.md` (grants + memberships that
  the cascade composes with in `iam.has_access`).
- Action Catalog (the Actions tab's client): `features/action-catalog/FEATURE.md`.
- Canonical associations: `.claude/skills/canonical-associations`.
- Window Panels (the `EntityRelationshipOrbitWindow` composition root):
  `.claude/skills/window-panels`.

## Doctrine compliance

- **Reusable primitives extracted:** `components/entity-types/EntityTypeChip` +
  `EntityTypeCombobox` (consumed here; available to every association surface).
- **Table chrome:** `MatrxDataTable` — sticky headers, every-column filter/sort,
  toolbar facets, row → `SidePanelSurface` / `MatrxDynamicPanelHost`, panel icon →
  `WindowPanel`.
- **One core component, two shells:** `EntityRelationshipOrbit` is
  route-agnostic — the `explorer/[token]` page and `EntityRelationshipOrbitWindow`
  (WindowPanel) both render it unchanged; no fork.
- **Bundle discipline:** `WindowPanel` reached only through
  `dynamic(() => import(...), { ssr: false })` in `EntityExplorerEntry` — never
  a static import from any tab page.
- Types derived from generated `Database` types; no `any`, no hand-mirroring.
- Loud recovery: every tab page throws on any RPC load error rather than rendering
  a half-empty control plane.

## Change log

- **2026-08-11** — Documented the deferred `content_role` core audit: two live
  writable authorities, 13 disagreements, nullable truth erased by a generic
  fallback, decision options, and the safe investigation/migration sequence
  (tracked as D171).
- **2026-08-11** — Entity-registry resolution now honors the live
  `platform.entity_types` contract: nullable `content_role` means the token is
  not classified as a knowledge resource, so generic consumers retain their
  `destination` fallback without emitting a production error. A non-null value
  outside the five-value vocabulary remains a loud corruption alarm.
- **2026-08-09** — No-dead-ends sweep. Exposure Audit: resource name →
  `EntityRef`, owner → `AdminUserRef`, organization → `EntityRef`, `resource_id`
  → per-row `fk.token`, and the "N context" signal now links to the Reachability
  Inspector prefilled with that record. Reachability Inspector: id column →
  `MatrxUuidCell` with the row's token, plus `?mode=&type=&id=` deep-link entry.
  Shareable registry: the Label column links to the entity explorer. Edge counts
  left inert on purpose — see Invariants.
- **2026-07-27** — Added the live `agent_writable` column and one-click toggle to the
  Entity Types registry; extracted the shared mutation consumed by the Actions matrix.

- **2026-07-25** — Added the read-only **Exposure Audit** tab and
  `admin_exposure_audit_summary/rows` super-admin RPCs. Files and notes now have
  one cross-user inventory for public, internal, link, explicit-grant, and
  contextual reachability; rows include owner/org identity, active links,
  conveying containers, broad-discovery status, and derived/system flags.
  Hardened `workbench.notes.pub_read` so soft-deleted public notes cannot remain
  anonymously readable.
- **2026-07-13** — **Route-tabbed hub restructure.** The single endless-scroll page
  split into 7 tab routes under one layout (`RelationshipsAdminLayoutClient`,
  scheduling pattern); `RelationshipManagerClient.tsx` deleted, decomposed into
  per-tab clients + `ProblemsPanel` / `shared.tsx` / helpers in `utils.ts`. Orbit
  route moved `[token]` → `explorer/[token]` (kills static/dynamic shadowing).
  **New Entity Types tab** — first-ever `platform.entity_types` admin UI
  (`migrations/entity_types_admin_rpcs.sql`: `admin_entity_types_list` /
  `admin_upsert_entity_type` / `admin_set_entity_type_active`; deactivate-only
  delete; generated-types drift banner). **/administration/sharing absorbed and
  deleted** (redirect; per-row Link policy side panel via `SharePolicyColumnEditor`
  + `admin_set_share_policy`). **/administration/action-catalog moved** to the
  Actions tab (redirect; `ActionCatalogClient` unchanged). Cross-tab drift actions
  ride consume-once `?edit=` / `?register=` params.
- **2026-07-11** — Shareable resource registry gets a full CRUD home here
  (`ShareableRegistryPanel` / `ShareableResourceForm`; new RPCs
  `admin_shareable_registry_list/_defaults`, `admin_upsert_shareable_resource`,
  `admin_set_shareable_active`) — the drift panel's "Register as shareable"
  fixes `conveying_container_not_shareable` in place. New entity-type explorer:
  `EntityRelationshipOrbit` (+ pure `buildOrbitGraph` helper) rendered at
  the token route and inside a page-local `WindowPanel`
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
- **2026-07-09** — Full-CRUD rewrite: structured columnar registry (chips + a
  direction glyph, not prose), New/Edit/Delete rules, unified
  `admin_relationship_problems()` drift panel (adds the shareable-registry gap
  check), reachability inspector on the entity-type combobox. New RPCs:
  `admin_delete_relationship_rule`, `admin_relationship_problems`. New
  primitives: `EntityTypeChip`, `EntityTypeCombobox`.
- **2026-07-06** — Initial Relationship Manager shipped (read + partial mutations)
  alongside the reachability system rollout.
