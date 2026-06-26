# Association & Context Architecture — decisions (the model bible)

> ✅ **CURRENT (decisions/model).** The live unified table is **`platform.associations`** (in the `platform` schema, coexisting with old FKs/M2M); where older text says `ctx_associations`, read `platform.associations`. Live-state record: `official/db-status.md` + `CUTOVER_HANDOFF.md`. This doc keeps only the **load-bearing decisions** of the association/context model — much is built, some (typed slots, required slots) is forward-looking design not yet in `official/`.
>
> ✅ decided · ⚠️ open · 🚫 out of scope · 💡 proposed

## 0. The shape — every relationship is exactly one of three
| Mechanism | Expresses | Storage | Multiplicity |
|---|---|---|---|
| **Ownership / containment** | "belongs to / lives inside" | hard FK (the spine) | single-parent |
| **Loose membership** | "filed under / tagged to" | `platform.associations` | M2M, no role |
| **Typed slot** | "X's `<named role>` *is* Y" | `ctx_context_item_values` (value = primitive **or** typed reference) | per-item cardinality |

Two concepts sit orthogonal to relationships: **audit/ownership** (§4) and **Active Context** (§5). **Store explicit, derive the rest** — never materialize derived links.

## 1. Loose membership — `platform.associations` ✅
One polymorphic table, both ends polymorphic: `(source_type, source_id, target_type, target_id, organization_id, metadata, created_by, created_at)`, UNIQUE on the tuple, indexed on source/target/org.
- ✅ Folds in the old `ctx_scope_assignments` (→ `target_type='scope'`) and `ctx_task_associations` (→ `target_type='task'`).
- ✅ **No `relationship_kind` column** — loose membership carries no role; named/typed relationships live in typed slots (§2) where **the item key IS the role**.
- ✅ **Direction: content = SOURCE → container = TARGET** (the `target_type` CHECK forbids entity types as targets). A note on a task = `source=note → target=task`.
- ✅ **`organization_id NOT NULL`** (associations never cross orgs) → RLS is the uniform `iam.has_org_access(organization_id)`, not a polymorphic per-target helper.
- ✅ Target set is bounded {scope, scope_type, project, task, context_item, category, thread, war_room, …}. **Org is excluded** — it's the single owner, never associable.

## 2. Typed slots — the named/enforceable relationship + value layer 💡
`ctx_context_item_values` carries a **typed value**: primitive (`value_text/number/...`), document, or **typed reference** (`value_reference_id` + `value_reference_type`). Storage already exists (the `context_value_type` enum has `reference`/`document`).
- ✅ **File-into-slot = a reference value** — dropping a PDF into the "Operating Agreement" slot writes one item-value row (`value_reference_type='file'`), NOT also an association row. Cascade is derived from it.
- ✅ **The item key IS the relationship role** ("opposing_counsel", "client") — typed, named, directional. No `relationship_kind` anywhere.
- 💡 **Scope-as-value = the relational layer** — a scope can be another scope's item value (`Case.client → scope ABC Co.`), making the scope set a typed, queryable entity-relationship graph. Directional by construction; the reverse is derived via the `(ref_type, ref_id)` index.
- 💡 **Required slots = enforcement** — an item definition can be `required` (every Client scope must have a `communication_agent`). ⚠️ Mechanics open (§6): leaning **surface-as-gaps**, not hard-block.

> Two explicit stores — loose `associations` (membership) + typed `context_item_values` (named role/references) — **derive one unified read model**. One write surface per kind, one read surface total.

## 3. Cascade / layered visibility ✅
- ✅ **Store explicit only; derive ancestors** (materializing derived links makes deletion contradiction-hell).
- ✅ **Vertical spine** (`context_item → scope → scope_type → org`) = auto-derived silently. **Lateral edges** (`scope → project`, itself M2M) = suggested, never silent.
- ✅ **Multi-level association is first-class** (a file on both a project *and* its parent scope) — agents/UI surface references **by layer**, never dump everything into context.
- ✅ **Promotion = additive** (add the upper association, keep the lower). **Push-down** (pull-closer) lets you associate a 2-3-layer-away thing directly to you so you don't lose it if the higher node is dissociated.
- ✅ **One directional control** — add up / add over / add down / move (= add+remove) — underneath it's only INSERT/DELETE rows. Compute on read via a hop-traversal RPC.

## 4. Ownership & audit model ✅ (= the Base Standard)
**User-first for identity/UX; org-first for data ownership.** Three concepts kept separate: *principal* (user), *tenancy boundary* (org), *UX home* (view-layer aggregation across a user's orgs).
- Every Base-1 table: `created_at, updated_at` (trigger), `created_by, updated_by` (`created_by` null = system), `deleted_at` (soft delete), `version` (history anchor).
- `organization_id NOT NULL` = the single tenancy key; org type ∈ {personal, business}; solo users get an auto-provisioned personal org. **One column → one uniform RLS predicate.** Cross-org sharing = explicit audited grants, never a second org column.
- 🚫 Rejected: polymorphic `owner_type/owner_id`; a separate ownership table; a separate `tenant_id`; **`organization` as an association target**.

## 5. Active Context vs Durable Association ✅ (never mix — agents butcher this)
- **Association** — the durable graph (§1/§2): "belongs to / filed under." Persisted.
- **Active Context** (Working Context) — the user's *current* selection feeding the agent right now. Runtime/session state in `ctx_user_active_context` + `appContextSlice`. Ephemeral relevance, not membership. → keeps its `project_id`/`task_id` FKs (it's Active Context, not litter).
- **Context Hints** ✅ — Active Context may **seed suggested** associations but **never auto-writes** them. (This is the exact line coding agents keep crossing.)

## 6. Open questions
- ⚠️ Reference cardinality (single vs multi) — reconcile with `max_assignments_per_entity` on scope types.
- ⚠️ Required-slot enforcement — block-on-write vs surface-as-gaps (leaning gaps).
- ⚠️ Judgment-case FK columns (`code_*`, `wc_claim`, `skl_skill_projects`, `ai_*`) — keep vs convert. **`code_*`/`wc_*`/`sch_*`/`wf_*` `project_id`/`task_id` are real FKs, NOT association litter — leave them** (per CHANGEOVER §8).

## 7. Industry-module binding principle ✅
A discipline-specific module (workers' comp is the first) **brings its own domain tables, but its connective tissue to scopes/projects/tasks/files/agents goes through `platform.associations` + typed context-item values — never bespoke FK columns.** This is what stops every future module (and every coding agent) re-inventing associations.

## 8. Naming carried into the schema-reorg wave
`ctx_context_item_values` → `knowledge.attribute_values`; `ctx_context_items` → `knowledge.attributes`; `ctx_associations`/litter → `platform.associations`. "Context" is retired for the **durable** layer (it's *attributes*) and reserved for the **active/working** layer (§5).

## Decision log
- *2026-06-07* — §0 framing; §1 associations (`organization_id`/canonical RLS, no relationship_kind, bounded targets, org excluded, content=source direction); §2 typed-reference values + scope-as-value + required slots; §3 cascade (multi-level, promotion additive, push-down, directional control); §4 org-first ownership adopted; §5 Active Context vs Association + Context Hints; §7 industry-module binding; durable values renamed *attributes*.
