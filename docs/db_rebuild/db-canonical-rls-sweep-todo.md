# Canonical RLS Sweep — TODO (live DB work)

> Goal: **every governed table governed by `iam.apply_rls` v2, zero hand-written policies.**
> Mechanism + policy shapes: [`db-canonical-rls.md`](./db-canonical-rls.md). Access meaning: [`db-canonical-access-model.md`](./db-canonical-access-model.md).
>
> **The DB is in active flux** (multiple agents base-retrofitting tables in parallel). Do NOT trust a stale snapshot — **re-check each table's live state immediately before acting**, and apply table-by-table, not in one big migration that could stomp another agent's in-flight retrofit.

## The per-table procedure (run for each, every time)

```sql
-- 0. live state: columns present? current policies? component?
select column_name from information_schema.columns where table_schema=$s and table_name=$t;
select polname, pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid)
  from pg_policy where polrelid = format('%I.%I',$s,$t)::regclass;

-- 1. registry row exists + correct (token, is_component, default_visibility); add composition edge if component
-- 2. base columns present (created_by, organization_id, visibility, deleted_at as applicable) — retrofit FIRST if missing
-- 3. apply
select iam.apply_rls($s, $t, $token, $variant);
-- 4. VERIFY LIVE as a real authenticated user (set request.jwt.claims sub=<owner>; set role authenticated):
--    INSERT ... RETURNING must succeed for owner; a DIFFERENT user must see 0 rows.
-- 5. record in public._schema_migrations if a new migration file was added
```

## DONE
- [x] `iam.apply_rls` v2 built (`migrations/iam_apply_rls_v2_canonical.sql`, ledgered).
- [x] `public.wr_sessions` (war_room) → v2 entity. Verified live.
- [x] `public.wr_threads` (thread) → v2 entity. Verified live (the reported `42501` fix).

## TIER A — standard entities, ready to regenerate (have created_by + org)
Re-check live policy first; many currently carry **legacy-named** or **v1 inline** policies (no `has_access`, no owner short-circuit consistency) — replace with v2.
- [ ] `iam.invitations` (invitation) — note extra `inv_invitee_read`; v2 drops it. Confirm invitee-read is otherwise covered (invitee access belongs in `iam.has_access`/grants, not a bespoke policy) before applying.
- [ ] `iam.memberships` (membership) — v1 std_*. Regenerate.
- [ ] `platform.categories` (category) — legacy `cat_*`. Regenerate.
- [ ] `platform.comments` (comment) — v1 std_*. **Polymorphic parent** (rulebook §8): comment is currently a standard `internal` entity, not a component — keep `entity` variant.
- [ ] `platform.activity_log` (activity) — `ledger` variant (service writes, org read).
- [ ] `public.organizations` (organization), `public.ctx_projects` (project), `public.ctx_scopes` (scope), `public.ctx_scope_types` (scope_type), `public.ctx_context_items` (context_item)
- [ ] `public.cx_conversation` (conversation) — has `is_public` + `visibility`; ensure `is_public`→`visibility` backfilled (rulebook) so the resolver reads the right tier before regenerating.
- [ ] `public.notes` (note), `public.prompts` (prompt), `public.studio_sessions` (studio_session), `public.transcripts` (transcript)
- [ ] `public.aga_apps` (agent_app), `public.agx_agent` (agent), `public.agx_agent_surface` (agent_surface_binding)
- [ ] `public.ctx_tasks` (task) — has `assignee_id` + `is_public`. **Decision needed:** assignee access is not expressed in `iam.has_access` today; regenerating with v2 drops the assignee branch. Either (a) add an assignee concept to the resolver, or (b) grant assignees via `permissions`. Resolve before applying or task assignees lose access.
- [ ] `public.page_extraction_jobs` (page_extraction_job) — likely `ledger`/service; confirm who inserts.

## TIER B — needs a DB change before v2 (verify live; flux may have already fixed)
At last check these lacked `created_by`; minutes later several had gained it (active retrofit). **Re-verify columns live**; if base columns now exist, they move to Tier A.
- [ ] `files.files` (file) — large legacy `cld_files_*` policy set (owner/public/shared/folder). Migrate deliberately: ensure `visibility` + share grants are represented in `permissions`/resolver, THEN regenerate. Highest-traffic table — do last, with care.

## TIER C — components (gate on composition parent; mostly backend-inserted)
- [ ] `public.cx_message` (message → conversation), `public.cx_tool_call` (tool_call → conversation), `public.cx_artifact` (artifact → conversation) — `component` variant. Verify a normal conversation owner can read/insert children via `INSERT…RETURNING`.
- [ ] `runtime.global_execution` (→ global_request), `…_checkpoint` / `…_event` / `global_meter_entry` (→ global_execution) — **backend/service-inserted; coordinate with the server team before changing.** Currently hand-written `std_select` using `has_access` on the parent id (correct shape for components; just confirm full CRUD set + that authenticated even needs write).
- [ ] `runtime.global_request` (global_request) — standard entity, same class as War Room; has the owner-short-circuit bug if any authenticated `INSERT…RETURNING` path exists. Confirm insert path (service vs user) then regenerate as `entity`.
- [ ] `runtime.global_origin` (global_origin) — confirm variant (likely service/ledger).

## CROSS-CUTTING (do alongside the sweep)
- [ ] **Fix `platform._stamp_actor`** to fall back to `(select auth.uid())` so `created_by` auto-stamps over PostgREST (today it only reads `app.user_id`, which PostgREST never sets — inserts work only because clients pass `created_by`). One-line change; makes the canonical insert robust everywhere. **Touches every retrofitted table — coordinate.**
- [ ] **Add `thread → war_room` containment edge** to `platform.entity_relationships` (missing) for War Room sharing.
- [ ] **anon / public-read decision** — canonical policies are `TO authenticated`; decide the public/share read path (see `db-canonical-rls.md` gaps).
- [ ] **Drift cron** (rulebook §9.5) — weekly assert every governed table's live policies equal `iam.apply_rls`'s output; scream on divergence so no table drifts back to hand-written.
- [ ] **App-layer audit** — find code (FE `.from()` writes, Python) that assumes the old policies or hand-rolls access checks instead of `iam.has_access`; migrate to canonical.

## SERVER REPO (aidream) — when schema changes here
Per the changeover contract, any column/shape change to these tables also requires, server-side: regenerate matrx-orm models/types, update any manager that reads the changed columns, and re-verify the Python access path calls `iam.has_access` (never reimplements it). RLS-only changes (like this War Room fix) need **no** server change.
