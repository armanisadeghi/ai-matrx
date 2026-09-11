# Canonical Associations — Recipe A + Recipe A-DB (replace a bespoke M2M)

Companion to [`SKILL.md`](./SKILL.md) — read it first: the load-bearing boundary, the token rule, and the edge-direction rule govern every step here.

## Recipe A — Replace a bespoke M2M / association RPC with `associationsService`

1. **Identify the edge.** What two entities does the junction/RPC relate, and which is the container? Map both to canonical tokens.
2. **Replace writes:**
   - attach → `associationsService.add({ sourceType, sourceId, targetType, targetId, orgId?, label?, role? })`
   - detach → `associationsService.remove({ sourceType, sourceId, targetType, targetId, role? })`
   - "make the set exactly these" → `associationsService.setTargets({ sourceType, sourceId, targetType, targetIds, orgId? })`
   - entity deleted → `associationsService.removeForEntity(type, id)` (purges both directions)
3. **Replace reads:**
   - one entity's edges (both directions) → `associationsService.listForEntity(type, id)`
   - many containers at once → `associationsService.listForTargets(targetType, targetIds)`
   - many sources at once (e.g. scope tags of every visible row) → `associationsService.listForSources(sourceType, sourceIds, targetType?)`
4. **Prefer the hooks** in React: `useAssociations({ type, id })` (entity-centric) or `useContainerLinks({ containerType, containerId, orgId })` (container-centric: `countFor` / `attachedIdsFor` / `linksFor` / `totalCount` / `attach` / `detach`). Never call the service or `assoc_*` RPC directly from a component, and never dispatch `appContextSlice` from association code (durable relationships are not the user's active working context — see `features/scopes/FEATURE.md`).
5. **Retire the old path:** delete the bespoke RPC caller. On the DB side, collapse + graveyard the junction via **Recipe A-DB** below (during the 2026 downtime the DB collapse ships in the SAME change as this FE repoint — no soak, no compat shim). Add a `dead-relations.json` entry the moment you stop reading a table.

---

## Recipe A-DB — collapse the junction in the DB (2026 downtime SOP)

Take the old shape DOWN and bring the new one UP in ONE migration — no FE-soak, no passthrough view (that's what downtime is for). The FE repoint (Recipe A) ships in the same change.

**The audit toolkit tells you exactly what to touch** — all re-runnable; `SELECT audit.refresh()` rebuilds every snapshot:
- `iam.verify_canonical(schema,table,token)` → every failing conformance check; `iam.canonical_certify_ok(schema,table,token)` → the boolean "done" gate (zero FAIL/WARN + no broken dependents).
- `audit.m2m_candidates` → **genuine junctions ONLY** (gated on `audit.is_m2m_shape`: a table is a junction iff a unique/PK key IS its entity-FK pair ± ordering; an entity that merely has 2 FKs never appears). A shape-true-but-semantically-not-a-link table (config entity / grant / KG edge) → `SELECT meta.exempt('m2m_candidate', schema, table, reason)`. **Every check consults `meta.audit_exemption` — one `meta.exempt(check,schema,table,reason)` call kills a false positive forever; never hard-code an exception into a function.**
- `audit.table_impact(schema,table)` → every dependent **Postgres fn** + the exact columns each touches + `currently_broken`. Run BEFORE editing. **It does NOT see the frontend** — `grep -rn '"<table>"' features/ lib/ app/` for `.from()`/embeds separately (that is step 2/3 of Recipe A, and it is what actually breaks the app).

**The migration — atomic, idempotent, count-verified:**
1. Both endpoint tokens registered + active in `platform.entity_types`. Missing → register + `pnpm tsx scripts/generate-entity-types.ts`.
2. `INSERT INTO platform.associations (source_type,source_id,target_type,target_id,organization_id,role,position,metadata,created_at) SELECT …` — org from the source (or target) entity; `role`/`position` per the edge; `metadata` = edge props + `legacy_table` + `legacy_id` (composite PK → `jsonb_build_object(...)`). `ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING`.
3. **Count-verify or ROLLBACK:** `IF (SELECT count(*) FROM <junction>) <> (SELECT count(*) FROM platform.associations WHERE metadata->>'legacy_table'='<junction>') THEN RAISE EXCEPTION …`. Wrap the whole block in `IF to_regclass('<schema>.<junction>') IS NOT NULL THEN … END IF` (idempotent — a re-run after graveyard is a no-op).
4. **Repoint every fn from `table_impact`** in the SAME migration: `CREATE OR REPLACE` each, swapping `FROM <junction>` for `JOIN platform.associations a ON a.source_id=… AND a.source_type='<src>' AND a.target_type='<tgt>' AND a.role='<role>'` (position → `a.position`, edge props → `a.metadata->>'…'`). While in a fn, fix any pre-existing break it carries (e.g. an unqualified type that needs `SET search_path TO 'public'`).
5. De-register (only if the junction itself was registered): `DELETE FROM platform.entity_relationships WHERE child_type='<token>'`; `DELETE FROM platform.entity_types WHERE token='<token>'`.
6. Retire, never DROP: `ALTER TABLE <schema>.<junction> SET SCHEMA graveyard`; `INSERT INTO platform.deprecated_relations(old_ref,new_ref,reason,archived_as)`.
7. `SELECT audit.refresh()` → confirm the junction left `m2m_candidates` and no fn landed in `audit.broken_functions`; `iam.canonical_certify_ok(...)` where applicable.
8. Apply with `pnpm db:apply migrations/<name>.sql` — the ONE path; it ledgers the file itself with the SHA-256 of the bytes it executed, so you never write that row. Then `pnpm db-types` + aidream `python db/generate.py`.

**Then the FE (Recipe A) in the same change.** Before calling it done, run an **adversarial sweep** (see the campaign workflow in [`SKILL.md`](./SKILL.md)) — a fresh agent greps BOTH repos for any surviving old-shape usage (`.from("<junction>")`, the old RPC, the old column, the PostgREST embed). Old stuff must ERROR, never pass through.
