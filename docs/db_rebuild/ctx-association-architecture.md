> ✅ **CURRENT (decisions/model).** Naming note: the live unified table is **`platform.associations`** (in the `platform` schema); where this doc says `ctx_associations`, read `platform.associations`. The implemented path is coexistence + mirror triggers, not the compat-view rename in the superseded phase-1 SQL. Live-state record: `db-handover-notes.md` + `db-first-cut-execution-plan.md`.

# CTX Association & Context Architecture — Source of Truth

> **Purpose.** The bible for the association / context overhaul. Records **locked decisions**, **current-system facts**, and **open questions**. Keep it to load-bearing decisions, not implementation minutiae.
>
> ✅ decided · ⚠️ open / needs a decision · 🚫 out of scope for now · 💡 newly proposed, leaning yes

---

## 0. The shape of the whole thing (read this first)

Every relationship between things falls into exactly one of these, and we stop blurring them:

| Mechanism | What it expresses | Storage | Multiplicity |
|---|---|---|---|
| **Ownership / containment** | "you *belong* / you *live inside*" | hard FK (the spine) | single-parent |
| **Loose membership** | "this is *filed under* / *tagged to* these" | `ctx_associations` | many-to-many, no role |
| **Typed slot** | "X's `<named role>` *is* Y" (and may be *required*) | `ctx_context_item_values` (value = primitive **or** typed reference) | per-item cardinality |

Two more concepts sit *orthogonal* to all relationships:

- **Audit + ownership model** — who made it, who controls it, what tenant it's in. Fixed columns, §5.
- **Active Context** — the user's *current* working selection that feeds the agent right now. Runtime state, **never** mixed with durable associations, §6.

Everything non-FK (loose membership + typed slots) **derives one unified cascade** on read. We **store explicit, derive the rest** — never materialize derived links.

---

## 1. Current state (facts pulled from the DB)

- **The unified table already exists twice.** `ctx_scope_assignments (scope_id, entity_type, entity_id, …)` and `ctx_task_associations (task_id, entity_type, entity_id, label, metadata, …)` are the same polymorphic edge with the target hardcoded. Proof the abstraction is real.
- **The litter, with exact FK hit list:** `project_id` FKs on ~34 tables, `task_id` FKs on ~21, `organization_id` on ~65. ~99% null on live data (caveat: dev-stage, ~1 real user, projects UI was unusable until rebuilt — so low usage ≠ proof, but the structural case stands).
- **The spine FKs are clean and stay:** `ctx_tasks.project_id`, `ctx_tasks.parent_task_id`, `ctx_scopes.parent_scope_id`, `ctx_scope_types.parent_type_id`, plus task child-tables (`ctx_task_comments/attachments/assignments`) and project child-tables (`ctx_project_members/invitations`).
- **RLS (newest pattern, `ctx_tasks`)** resolves via `user_id`, `assignee_id`, org membership, project membership, **plus generic `has_permission(table,id,level)`** — it does **not** depend on the scattered FKs → safe to drop them.
- **DB-side RPC surface to migrate: ~20 functions.** Writers to repoint: `set_entity_scopes`, `associate_with_task`, `dissociate_from_task`, `set_context_value`, `set_scope_context_value`, `create_task_with_association`, `create_tasks_bulk`. Readers (work via compat views): `get_entity_scopes`, `get_tasks_for_entity`, `get_task_associations`, `list_entities_by_scopes`, `resolve_full_context`, `get_user_full_context`, `get_scope_context`, `list_scopes`, `delete_scope`, `delete_scope_type`, `ctx_version_context_item_value`, `get_value_history`, `kg_simulated_scope_graph`.

---

## 2. Loose membership — `ctx_associations` ✅

One polymorphic table, both ends polymorphic:

```
ctx_associations
  id            uuid pk
  source_type   text          -- 'agent','note','file','conversation','prompt', ...
  source_id     uuid
  target_type   text          -- 'scope','scope_type','project','task','context_item'   (NO 'organization' — see §5)
  target_id     uuid
  metadata      jsonb default '{}'
  created_by    uuid
  created_at    timestamptz default now()
  unique (source_type, source_id, target_type, target_id)
  index (source_type, source_id)
  index (target_type, target_id)
```

- ✅ **Verdict: good idea, do it.** Negligible perf impact at our scale with the two composite indexes. The only real cost — no DB-level FK on a polymorphic end — we already live with today; mitigate with a trigger or periodic integrity sweep if needed.
- ✅ **Fold in** `ctx_scope_assignments` (→ `target_type='scope'`) and `ctx_task_associations` (→ `target_type='task'`, `label/metadata → metadata`).
- ✅ **No `relationship_kind` column.** Loose membership carries no role. Named/typed relationships live in typed slots (§3), where the **item key *is* the role**. This resolves the old open question.
- ✅ **Target set is a bounded enum** {scope, scope_type, project, task, context_item}, **not** fully generic. Org is excluded (§5). `scope_type` stays a first-class target (the cold-email agent example).
- ✅ **Carries `org_id NOT NULL` (Base Standards alignment).** Because org is the single owner and associations never cross orgs, every edge has a well-defined org. This replaces the polymorphic `ctx_can_access_target` RLS helper with the **canonical org-first policy** (`iam.has_org_access(org_id)`) — simpler and faster (no per-target branching). Finer within-org visibility (e.g., hiding a member's junk agents) is a separate later layer, not the boundary. *(Supersedes the helper-based RLS in the Phase-1 SQL; fold into the staged build.)*

---

## 3. Typed slots — the big expansion 💡 (flagship)

`ctx_context_item_values` becomes the **typed, named, enforceable relationship + value layer**. A value is no longer just a primitive.

### 3.1 Values can be primitives OR typed references ✅ — STORAGE ALREADY EXISTS
A context item definition has a **type** (`ctx_context_items.value_type`). Confirmed in the DB: the `context_value_type` enum already includes `reference` and `document` alongside the primitives, and `ctx_context_item_values` already carries **`value_reference_id uuid`** + **`value_reference_type text`**. So a value is one of:
- **primitive** — `value_text` / `value_number` / `value_boolean` / `value_json` / `value_date`
- **document** — `value_document_url` / `value_document_size_bytes`
- **typed reference** — `value_reference_id` + `value_reference_type` (free text: `file`, `agent`, **`scope`**, …)

✅ **No schema change needed for storage** — the typed-reference foundation is already built. The remaining work is *logic*: an index on `(value_reference_type, value_reference_id)` for reverse lookups, plus the derive/enforce/cascade behavior below. (This closes old Q7.1.)

### 3.2 File-into-slot = a reference value (resolves Q1) ✅
Dropping a PDF into the "Operating Agreement" slot on scope ABC Co. writes **one `ctx_context_item_values` row** (`value_type='reference'`/`'document'`, `value_reference_type='file'`, `value_reference_id=<file uuid>`). The file *is* ABC Co.'s operating agreement — it lives in its proper versioned home (`is_current`). The association/cascade is **derived from this row** — we do **not** also write a `ctx_associations` row. (Same mechanism for `agent`, `scope`, etc.) Type-mismatch is guarded by the item's declared `value_type` (and the existing `trg_ctx_validate_value_scope_type` trigger).

### 3.3 The item key IS the relationship role ✅
"opposing_counsel", "client", "communication_agent" — the item key supplies the typed, named, directional relationship. No separate `relationship_kind` needed anywhere.

### 3.4 Required slots = enforcement 💡
An item definition can be marked **required**. e.g. a `communication_agent` item (type: agent) on scope_type **Client** means *every* Client scope must have a dedicated agent assigned. This converts options into **org-admin-enforceable structure** — currently we have none. ⚠️ Enforcement mechanics open (§7): block-on-write vs. surface-as-gaps/compliance. Leaning **surface-as-gaps** (don't hard-block; show what's missing).

### 3.5 Scope-as-value = the relational layer 💡 (the breakthrough)
A scope can be the value of another scope's item. `Case 12345.opposing_counsel → scope <Opposing Counsel X>`; `.client → scope <ABC Co.>`; `.experts → [scope, scope, …]`. This turns the scope set into a true, typed, queryable entity-relationship graph.
- **Directional by construction** ✅ — the reference lives on the *source* scope's item and points to the target. The reverse ("which cases name expert X?") is **derived** via the `(ref_entity_type, ref_entity_id)` index, never stored separately. This is the clean answer to the "one-way relationships vs ownership" instinct.
- ⚠️ **Cardinality** (§7): single-value ("the client") vs multi-value ("the experts"). Maps naturally onto the existing `max_assignments_per_entity` idea on scope types.

> **Net synthesis:** two explicit stores — loose `ctx_associations` (membership, no role) and typed `ctx_context_item_values` (named role, enforceable, references) — **derive one unified read model** ("everything related to X, by layer"). One write surface per kind, one read surface total.

---

## 4. Cascade / layered visibility ✅ (refined)

- ✅ **Store explicit only; derive ancestors.** Never materialize derived links (or editing becomes contradiction hell — "I deleted the project but it won't go away"). Payoff: deletion is trivially clean — remove the one explicit row and the whole spine vanishes.
- ✅ **Vertical spine = auto-derived (silent).** `context_item → scope → scope_type → org` is a true single-parent chain → always safe to compute up.
- ✅ **Lateral edges = suggested, never silent.** `scope → project` is itself M2M; assigning a file to "Acme" (in 5 projects) must **not** drop it into all 5. Surface as one-click suggestions.
- ✅ **Multi-level association is a first-class concept.** A thing can be explicitly associated at more than one level at once (e.g. a file on both a project *and* its parent scope). This is allowed and expected; it only affects fetch/relationship-building, and that's fine — agents and UI **surface references by layer, never dump everything into context**, so a hit at three layers is informative, not confusing.
- ✅ **Promotion = additive, never a move.** The warehouse-lease case: a lease uploaded into a project can be **promoted** to the parent scope. Promotion **adds** the upper association and **keeps** the lower one — both persist. (A separate explicit "move" exists; see §7a.)
- ✅ **Push-down (pull-closer) is also a thing.** From inside a project/agent you can see something that's 2–3 layers away (via a parent scope) and click to associate it **directly** to you. Two payoffs: (1) it becomes first-tier for you and your agents (closer = cheaper to fetch); (2) if it's later dissociated from the higher node, **you don't lose it** — your direct association survives.
- ✅ **Compute on read via hop-traversal RPC**, indexed as needed. A few seconds worst-case is acceptable.

### 7a. One control: associate / re-associate / move ✅ (UI principle, DB is trivial)
A single control offers directional options — **add up** (to parent), **add over** (to a sibling/cousin), **add down** (to a child), or **move** (add to the new node *and* remove from the current one). Underneath it is only `INSERT`/`DELETE` rows in `ctx_associations` (or a value row for typed slots). "Move" is just add+remove; the UI frames it directionally because that's how people think. One RPC per action.

---

## 5. Ownership & audit model ✅ (adopted as the Base Standard — see DB Base Standards §2)

This is now formalized by the **Database Base Standards** doc (§2): **user-first for identity/UX; org-first for data ownership.** Three concepts kept separate — *principal* (user), *tenancy boundary* (org), *UX home* (view-layer aggregation across a user's orgs).

**Audit (every Base 1 table):** `created_at`, `updated_at` (trigger-enforced), `created_by`, `updated_by` (`created_by` null = system). Plus `deleted_at` (soft delete) and `version` (history anchor) — universal, see Base Standards §1/§3.

**Tenancy + ownership:**
- `org_id` **NOT NULL** = the single tenancy key (RLS/billing boundary). Org type ∈ {personal, business}; solo users get an auto-provisioned personal org. **One column → one uniform RLS predicate.**
- `created_by` = actor; optional `owner_id` (trait) = the responsible human, distinct from the creator.
- Cross-org **sharing** = explicit, audited grants — never a second `org_id`.

**Rejected, on purpose:** 🚫 polymorphic `owner_type`/`owner_id`; 🚫 a separate ownership table; 🚫 a separate `tenant_id` (org_id *is* the tenant key); 🚫 **`organization` as an association target** (single owner, never associable).

⚠️ Migration implication: backfill `org_id` on every row before enforcing `NOT NULL`; this is part of the staged base retrofit (Wave 3), not a standalone step.

---

## 6. Active Context vs Durable Association ✅ (canonical names — never mix)

Coding agents butcher this constantly because it was unnamed. Fix = explicit names + distinct UIs + explicit docs.

- **Association** — the durable graph (§2/§3). "This entity *belongs to / is filed under* these." Persisted in `ctx_associations` / `ctx_context_item_values`.
- **Active Context** (a.k.a. Working Context) — the user's *current* selection that feeds the agent right now. Runtime/session state in `ctx_user_active_context` + `appContextSlice`. Ephemeral relevance, not membership.
- **Context Hints** ✅ (the sanctioned shortcut) — Active Context may **seed suggested** Associations, but **never auto-writes** them. e.g. active context = (org: Titanium Marketing, scope: SEO dept); you create an agent → system *nudges*: "Add to the SEO department's corpus? Share with the org?" Suggestion only. This is the exact line agents keep crossing.

`ctx_user_active_context` therefore **keeps** its `project_id`/`task_id` FKs — it is Active Context, not litter.

---

## 7. Open questions — TO RESOLVE
- ✅ **7.1 Reference-value storage — RESOLVED.** Columns already exist (`value_reference_id`, `value_reference_type`; `value_type` enum has `reference`/`document`). Use them; just add a reverse-lookup index. No schema change.
- ⚠️ **7.2 Reference cardinality** — per-item single vs multi (client=1, experts=many); reconcile with `max_assignments_per_entity` on scope types.
- ⚠️ **7.3 Required-slot enforcement** — block-on-write vs surface-as-gaps. Leaning surface-as-gaps.
- ⚠️ **7.4 Per-table classification** — judgment cases now tracked in the **removed-FK ledger §E**: `code_*` (likely a *coding-discipline container* — possibly we're misusing `ctx_projects` and a `code_projects` table is the honest answer; **keep the FK for now**, revisit when the next industry module lands), `wc_claim`, `skl_skill_projects`, `ai_runs/ai_tasks`. Resolved by the internals + codebase audits.
- ⚠️ **7.5 Promotion/move UX timing** — the *control* is decided (§7a); open only: when to *proactively suggest* a promotion. Start simple — manual button now, smart suggestions later.

## 8. Deferred / out of scope
- 🟡 **Org-first model = ADOPTED now** (Base Standards §2: `org_id` everywhere + canonical policy on new/changed tables). Only the **within-org per-member visibility layer** (e.g. hiding a colleague's junk agents from your view) remains a later pass — that's a finer grant/sharing layer on top of the org boundary, not the boundary itself.
- 🚫 Promoting `client`/`customer` to permanent hard-coded types — separate idea, parked.
- 🚫 Scheduler subsystem (`sch_task`/`sch_run`/`sch_trigger`) — unrelated `task_id`, leave alone.

## 8a. Industry-module binding principle ✅ (why this matters system-wide)
Workers' comp is our **first** discipline-specific module and a template for the future: a module behaves like a small Next.js + SQL + server/client app a user builds with our agents, where ~99% rides on the core system. The rule that follows: **a module brings its own domain tables, but its connective tissue to scopes / projects / tasks / files / agents goes through `ctx_associations` and typed context-item values — never through bespoke FK columns.** This is the "one overarching system too dominant to work around" — it's what stops every future module (and every coding agent) from re-inventing associations. Anything industry-specific that needs a relationship expresses it through the fabric.

## 9. Migration strategy ✅ — NOW FOLDED INTO THE STAGED BASE-STANDARDS REBUILD
The standalone "run association Phase 1 in today's outage" plan is **superseded**. The association cut is now **Wave 2** of a larger, staged rebuild governed by the **Database Base Standards** (see `db-base-standards-review-and-integration.md` and `db-staging-and-cutover-plan.md`). The mechanics still hold and carry forward:
- ✅ **Build new + backfill first; drop later.** Backfill volume is ~18 rows — **the risk is code, not data.**
- ✅ **Compatibility layer** — `*_deprecated` tables + views with INSTEAD OF triggers keep readers/writers working. The same shim trick covers the schema rename (`public` views → new schema).
- ✅ The existing `ctx-association-migration-phase1.sql` is the v1 reference; it gets **re-scoped** to (a) add `org_id NOT NULL` + canonical org RLS (replacing the polymorphic helper), and (b) emit into the new schema/naming, when authored as ordered migration files for the staging branch.
- Naming carried in: `ctx_context_item_values` → `knowledge.attribute_values`; `ctx_context_items` → `knowledge.attributes`; `ctx_associations` → `platform.associations`. "Context" is retired for the **durable** layer (it's attributes) and reserved for the **active/working** layer (§6).

## 10. Decision log
- *2026-06-07* — §0 framing; §2 (`ctx_associations` + `org_id`/canonical RLS, no relationship_kind, bounded targets, org excluded); §3 typed-reference values (storage already present) + scope-as-value + required slots; §4 cascade (multi-level first-class; promotion additive; push-down) + §7a directional associate/move control; §6 Active Context vs Association + Context Hints; §8a industry-module binding principle; Q7.1 closed.
- *2026-06-07 (later)* — **Adopted the Database Base Standards** (3 bases, org-first ownership, generic JSONB version history, vector sidecar, LIKE+triggers+RLS+CI lint, prefixes→bounded-context schemas). **Naming:** durable values are **attributes**, not "context." **Org-first** moved from deferred to adopted (within-org visibility still later). Association cut re-scoped as **Wave 2** of a staged rebuild on a Supabase **persistent branch**. See the two new companion docs. Refinements & the missing `entity_types` registry captured in the review doc.
