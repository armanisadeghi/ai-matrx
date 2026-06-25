> ✅ **CURRENT (rationale).** Read `ctx_associations` as `platform.associations`. The `metadata` decision is settled as universal (not opt-in). **Most refinements below are now BUILT** — see the status tags and the wave list at the bottom; this doc is the rationale/why, `db-core-standards-and-automation.md` is the implemented spec.

# DB Base Standards — Review, Refinements & Integration

> My honest assessment of the Base Standards doc, the refinements I'd make, and how it reconciles with the association work. **Verdict: adopted.** ~90% was correct as written; the notes below are refinements (most now implemented), plus the keystone it was missing (now built and central).

## Where I fully agree (adopt as written)
- **3-base tiers** (Standard Entity / Join / Append-only). Clean taxonomy; the rule "a join with real attributes + lifecycle is actually a Base 1 entity" is exactly right and prevents the classic mistake.
- **Org-first ownership, `org_id` as the single tenancy key** (§2). This resolves the user-first/org-first tension we circled earlier. User = principal/actor; org = tenancy boundary; "user's home" = view-layer aggregation. The Notion/Linear/GitHub pattern. Correct.
- **Generic JSONB history + capture-on-every-write + one shared trigger** (§3); reject the typed shadow schema. Schema drift becomes a non-event. Correct.
- **Vector sidecar, not a base column** (§4): `content_hash` to skip re-embeds, `model`/`dim` for side-by-side migration, HNSW, `halfvec` at scale, exclude embeddings from history. All best practice.
- **`LIKE _base INCLUDING ALL` + shared triggers + RLS template + CI lint**; avoid `INHERITS` (§5). The CI lint is the part that makes the standard real instead of aspirational.
- **Prefixes → bounded-context schemas; generic satellites not per-feature** (§6). This is the anti-bloat principle and it's the same one driving the association work.
- **`name`/`description` standard; reserve `label` for tags.** Resolves a real ambiguity (and aligns with the association `label`/`metadata`).
- **UUIDv7 deferred** (§7). Right call — don't add a wrinkle mid-rebuild.

## Refinements I'd make (the honest value-add)

1. **`metadata jsonb` — DECIDED universal (not opt-in).** I'd originally have made this a trait, but the call is made: `metadata` and `updated_at` are universal on Base 1, always present, empty if unused — uniformity wins for a system meant to be never-thought-about ("metadata always ends up handy; rather have it sit empty but consistent"). The discipline moves from "is it present?" to a **documented usage rule**: display hints / provenance only, never queryable business data. (Resolved in the capstone spec §1.)

2. **Split `version` into two roles; ship only the safe one now.** "History anchor" (increment on every write, mirrors `history.row_versions`) is always safe → universal now. "Optimistic lock" (reject writes carrying a stale version) requires the app to send the version and will throw surprising write failures if enabled before the app cooperates. Recommendation: ship the column + auto-increment immediately; enable lock *enforcement* per-table later. Don't conflate them in the trigger.

3. **Name the two-versioning-systems coexistence so no agent "helpfully" collapses them.** `knowledge.attribute_values` already has **domain** versioning (`is_current` cell history — "what was the settlement posture last month," a first-class queryable timeline). `history.row_versions` is **audit/recovery** versioning. Different consumers, both legitimate. A coding agent that sees both will try to unify them and break the queryable attribute timeline. Document: attribute-value versioning stays; it is *not* redundant with audit history.

4. **Define soft-delete propagation for associations + uniqueness.** With `deleted_at` universal: (a) unique constraints become partial (`WHERE deleted_at IS NULL`) so a soft-deleted scope's name is reusable — the doc has this; (b) **add the missing rule**: when a source or target is soft-deleted, its edges in `platform.associations` are treated as dead (filtered on read, or cascade-soft-deleted). Otherwise you accumulate ghost edges pointing at tombstones. Cheap to decide now, ugly to retrofit.

5. **`platform.associations` carries `org_id NOT NULL` and uses the canonical org policy.** Concrete improvement the Base doc surfaces for our association table: since associations never cross orgs, the edge has a well-defined org → RLS becomes the uniform `iam.has_org_access(org_id)` instead of the polymorphic `ctx_can_access_target` helper from Phase-1 SQL. Simpler and faster. (Finer within-org visibility is a separate later layer.) Folded into the architecture doc §2.

6. **Do NOT over-generalize membership.** Invitations-generic, associations-generic, history-generic — yes. But `*_members`/`*_assignments` carry `role` + lifecycle, so by the doc's own rule they are **Base 1 entities, not joins** — keep them per-domain (`iam.memberships`, `work.task_assignments`), do not fold them into `platform.associations`. Affirming this boundary so the "unify everything" reflex doesn't over-reach.

7. **Sequence the schema move as its own wave with `public` compat views.** Renaming `public.ctx_*` → `knowledge.*`/`platform.*` breaks every RPC, policy, FK, app reference, typegen output, and PostgREST exposure at once. It's the right destination, but it's the highest-coordination item. Do it as a discrete wave, and during transition leave **updatable views in `public`** pointing at the new schema (the same shim trick as the association compat views) so app code migrates incrementally instead of in one blast.

## The keystone it was missing: a canonical `entity_type` registry — ✅ BUILT
You had **four** places storing a string pointer to "which entity/table": `platform.associations` (`source_type`/`target_type`), `history.row_versions` (discriminator), `embeddings` (`source_table`), and generic `iam.invitations` (`target_type`). If those vocabularies drift, *everything silently mis-joins* — and you had live drift (`message` vs `cx_message`). **`platform.entity_types` is now built and seeded** (scope/scope_type/context_item/project/task/note/agent/file→cld_files/conversation/prompt/thread/war_room/studio_session/transcript/category) and is the keystone every polymorphic token references:
```
platform.entity_types (
  token        text primary key,     -- canonical: 'note','agent','file','category','thread',...
  schema_name  text not null,
  table_name   text not null,
  label        text not null,
  is_versioned boolean not null default true,
  soft_delete  boolean not null default true
)
```
Tokens are validated against it (FK/check enforcement is the remaining step). One source of truth for "what tables exist and how they behave." **Highest-leverage addition in the whole rebuild — done first, as recommended.**

## How the association work folds in (sequencing + STATUS)
The association cut is **Wave 2** of the staged rebuild, not a standalone outage task:
- **Wave 0 — entity_types registry** — ✅ DONE (the keystone; everything references it).
- **Wave 1 — base scaffolding:** templates, `history.row_versions` infra, `_touch`/`_stamp`/`_version_capture` triggers, **canonical RLS system (`iam.apply_rls` + `has_org_access`/`access_level`/`shared_with_me`/`shared_by_me`, three variants)** — ✅ DONE (CI lint still pending).
- **Wave 2 — association unification** (`org_id` + canonical RLS): `platform.associations` live, war-room/thread mechanisms consolidated, **33 mirror triggers** auto-syncing project/task FK writes — ✅ DONE. Also built on top: `platform.categories` + `platform.user_entity_state`.
- **Wave 3 — base retrofit:** add audit/`version`/`deleted_at`/`org_id` uniformly across existing Base-1 tables; backfill `org_id`; enforce `NOT NULL`; `apply_rls` + version-capture per table — 🔜 NEXT (sequence table-by-table with reconciliation between each).
- **Wave 4 — schema reorg + rename** (`ctx_*`→`knowledge`/`work`/`platform`; "context values" → `knowledge.attribute_values`; `ctx_war_room_tiles`→threads), with `public` compat views — ⏳ pending.
- **Wave 5 — cleanup:** graveyard dead tables, drop litter columns, retire compat shims + 5 legacy war-room tables — ⏳ pending (destructive; PITR on + move-don't-drop).

Each wave is independently verifiable. Destructive waves use the move-to-graveyard pattern. See `db-staging-and-cutover-plan.md`.