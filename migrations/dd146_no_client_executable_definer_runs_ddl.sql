-- DD-146 — no client-executable SECURITY DEFINER function runs DDL.
-- (B-35, Data Doctrine adoption program, 2026-09-12. SECURITY. DD-110 class.)
--
-- WHAT WAS MEASURED, LIVE, BEFORE ANY CHANGE (brsgrqvjdzwihsvnfqkf, 2026-09-12)
-- -----------------------------------------------------------------------------
-- `platform` IS PostgREST-exposed (it is in the authenticator role's
-- `pgrst.db_schemas`), and `anon`/`authenticated` both hold USAGE on it. So
-- every row below was reachable over HTTP as `/rest/v1/rpc/<name>` with the
-- published anon key:
--
--   fn                                    anon  auth  PUBLIC  gate   dynamic DDL
--   platform.retrofit_entity               yes   yes    no     NONE  alter table … add column / create trigger / drop trigger
--   platform.create_entity_table           yes   yes   yes     NONE  create table / create index / create trigger
--   platform._drop_custom_field_index      yes   yes   yes     NONE  DROP INDEX <oid>::regclass
--   platform.enforce_definer_client_grants yes   yes   yes     NONE  revoke execute … (the §6d-4 guard itself)
--
-- All four are SECURITY DEFINER owned by `postgres`. Proven live as `anon` in a
-- rolled-back transaction before this migration:
--
--   set local role anon;
--   select platform.retrofit_entity('__zz_nonexistent_probe_b35__','x','keep',null,null,null,null);
--   -->  [P0001] retrofit_entity: public.__zz_nonexistent_probe_b35__ not found
--   select platform._drop_custom_field_index('00000000-0000-0000-0000-000000000000');
--   -->  ENTERED BODY, returned with no error
--
-- i.e. the privilege check passed and the body ran; only the deliberately
-- nonexistent argument stopped it. With a real table name an anonymous caller
-- runs `alter table` as `postgres` on any table in `public`. This is DD-110's
-- `public.execute_admin_query` hole in a different shape.
--
-- CALLER CENSUS (why revoking breaks nothing)
-- -------------------------------------------
-- `grep -rn` over aidream, matrx-frontend, matrx-extend and matrx-local for all
-- three provisioner names returns ONLY: `.sql` migrations, prose in docs, and
-- the generated `types/database.types.ts` / `apps/dashboard/src/types/
-- database.types.ts` entries (type generation, not a call site). There is no
-- `.rpc("retrofit_entity")`, `.rpc("create_entity_table")` or
-- `.rpc("_drop_custom_field_index")` anywhere in any client. Migrations run as
-- `postgres` through `pnpm db:apply` / `aidream/db/apply_migrations.py`; the
-- platform-admin provisioning path runs as `service_role`. Both are kept.
--
-- IN-DATABASE CALLERS of platform._drop_custom_field_index, and the one real risk:
--   * platform.demote_custom_field_index  — SECURITY DEFINER owned by postgres,
--     so its nested call runs as postgres and needs no grant. Unaffected.
--   * platform._custom_field_index_state  — the BEFORE trigger on
--     platform.custom_field_definition, and it was SECURITY INVOKER. That table
--     grants INSERT/UPDATE/DELETE to `authenticated`, so the trigger fires as
--     the signed-in user and the nested call IS privilege-checked as
--     `authenticated`. Revoking alone would have broken archiving a custom
--     field for every user. THE FIX IS TO MOVE THE PRIVILEGE, NOT TO KEEP THE
--     DOOR OPEN: the trigger becomes SECURITY DEFINER (its whole body touches
--     only NEW/OLD plus that one call — it queries no table), and then nothing
--     client-side needs EXECUTE on the impl at all.
--
-- platform.enforce_definer_client_grants IS THE §6d-4 GUARD, and DD-110
-- deliberately left its grants alone ("Changing EXECUTE on the DDL guard to save
-- nothing is not a trade worth making"). That reasoning does not survive
-- measurement: `anon` can call it today (proven above — it returns silently
-- because its fail-open handlers swallow the `pg_event_trigger_ddl_commands()`
-- error outside an event-trigger context), and a client-executable definer whose
-- body runs `revoke execute` is exactly the class this migration closes. An
-- event trigger's function is invoked by the event-trigger machinery, which
-- performs no EXECUTE privilege check — PROVEN live before this migration, in a
-- rolled-back direct session: after `revoke all on function
-- platform.enforce_definer_client_grants() from public, anon, authenticated`, a
-- freshly created undeclared SECURITY DEFINER function granted to
-- `authenticated` still had that grant taken back by the guard, with its
-- `ddl_guard_log` rows written. Losing its client EXECUTE costs the guard
-- nothing. (§4g below carries the catalog assertion and the separate finding
-- about which apply paths the guard actually fires on.)
--
-- DD-140 RESIDUAL (V-32 finding V32-1): public.org_admin_remove_member is a
-- legitimate `authenticated` door — the frontend Remove button calls it
-- (features/organizations/admin/service.ts:178) — but it is also granted to
-- `anon` and PUBLIC on a SECURITY DEFINER owned by `postgres`. `anon` cannot
-- pass `is_org_admin`, so there is no live exploit; the grant is simply wider
-- than anything needs. Narrowed here, and the door is DECLARED so the §6d-4
-- guard protects it instead of a grandfather row standing down for it.
--
-- THE CLASS FIX, same as DD-110: every function touched here loses its
-- `platform.definer_client_grant_grandfather` row. A grandfather row on a
-- function that is not a declared door makes the §6d-4 guard stand down for it
-- forever, so any path that re-establishes a client grant re-opens the door
-- silently (DD-098).
--
-- THE GUARD: matrx-frontend `scripts/check-impl-doors.ts` check D7
-- (`pnpm check:impl-doors`), an absolute with no baseline — a client-executable
-- SECURITY DEFINER function whose body contains DDL and whose body carries no
-- platform-admin gate is a finding. It returns exactly the four rows above
-- against the pre-migration database and zero after.
--
-- LEFT OPEN DELIBERATELY, AND WHY (they carry the gate the rule asks for):
--   * public.admin_set_association_enforcement(boolean) — `authenticated`,
--     SECURITY DEFINER, runs `ALTER TABLE platform.associations {ENABLE,DISABLE}
--     TRIGGER trg_associations_enforce_known`. Body opens:
--         IF NOT public.is_super_admin() THEN
--           RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
--         END IF;
--   * public.admin_spend_breakdown(timestamptz,timestamptz,text,jsonb,jsonb) —
--     `authenticated`, SECURITY DEFINER, its only DDL is `CREATE TEMP TABLE
--     spend_fact ON COMMIT DROP` + two `CREATE INDEX ON spend_fact`, i.e. the
--     caller's own temp schema. Body opens `IF NOT public.is_super_admin() THEN
--     RAISE EXCEPTION 'admin_spend_breakdown: super admin only'`.
--   * public.create_new_user_table_dynamic(...) — matched a text census for
--     "create table" only because of its error string
--     `format('Failed to create table: %s', SQLERRM)`. Its two EXECUTEs are
--     `EXECUTE format('SELECT %L::public.field_data_type', …)`. No DDL. Not in
--     this class.
--   * hr.punch_write_path_conformance, platform.adopt_custom_fields,
--     platform.deprecate_relation, platform.sync_association_gc_triggers —
--     dynamic DDL, but already closed to every client role by DD-110.
--
-- COLLATERAL OF THE GRANT/REVOKE STATEMENTS BELOW: none. Every GRANT fires a
-- bounded DB-wide re-sweep inside `platform.enforce_definer_client_grants`, so
-- it is fair to ask what else it would take back. Measured live: exactly 14
-- SECURITY DEFINER functions hold a client grant with neither a
-- `client_callable_door` row nor a `definer_client_grant_grandfather` row, and
-- all 14 are trigger functions (`billing._spend_guardrail_validate`,
-- `iam._guard_organization_delete`, `iam._guard_single_organization_owner`,
-- `mandate.purpose_shortcut_definition_on_insert`, `platform._cascade_soft_delete`,
-- `platform._guard_soft_delete_parent`, `platform._knob_override_audit_tg`,
-- `platform._knob_rung_lock_audit_tg`, `platform._metadata_guard`,
-- `platform.client_directive_notify_feature_knob`,
-- `platform.client_directive_notify_knob_override`,
-- `public._schema_migrations_checksum_guard`, `public._schema_migrations_slot_guard`,
-- `public.client_directive_notify_app_config`). The guard's own body skips them:
--   if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
-- so the re-sweep changes nothing outside this file.
--
-- Applied through `pnpm db:apply` (the one matrx-frontend DDL path; it owns the
-- ledger row).

-- ── 1. The provisioner's index-drop impl stops needing a client grant ─────────
-- The trigger becomes SECURITY DEFINER so the privilege lives with the platform,
-- not with the signed-in user. Body is byte-identical to the live one; only the
-- SECURITY clause and an explicit search_path are added (§6d: a definer always
-- pins its search_path).

CREATE OR REPLACE FUNCTION platform._custom_field_index_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, platform, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.index_state := CASE WHEN NEW.is_indexed THEN 'pending' ELSE 'none' END;
    NEW.index_name  := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_indexed AND NOT OLD.is_indexed THEN
    NEW.index_state := 'pending'; NEW.index_error := NULL; NEW.index_name := NULL;
  ELSIF NEW.is_indexed AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    -- un-archiving a still-flagged field re-queues it rather than leaving it in the limbo
    -- state is_indexed = true / index_state = 'none'
    NEW.index_state := 'pending'; NEW.index_error := NULL; NEW.index_name := NULL;
  ELSIF (NOT NEW.is_indexed AND OLD.is_indexed)
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
     OR (NEW.deleted_at  IS NOT NULL AND OLD.deleted_at  IS NULL) THEN
    -- Drop the physical index HERE and set our OWN columns. Calling
    -- demote_custom_field_index() would UPDATE this row from inside its own BEFORE
    -- trigger, which Postgres refuses with 27000.
    IF OLD.index_state = 'active' THEN
      PERFORM platform._drop_custom_field_index(OLD.id);
    END IF;
    NEW.index_state := 'none'; NEW.index_name := NULL; NEW.index_error := NULL;
  END IF;
  RETURN NEW;
END $function$;

-- ── 2. Close the four doors; declare the one that stays ──────────────────────

do $$
declare
  v_sig text;
begin
  -- platform.retrofit_entity — no client caller anywhere.
  v_sig := 'platform.retrofit_entity(text,text,text,text,text,text,text)';
  execute format('revoke all on function %s from public, anon, authenticated', v_sig);
  execute format('grant execute on function %s to service_role', v_sig);

  -- platform.create_entity_table — no client caller anywhere.
  v_sig := 'platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[])';
  execute format('revoke all on function %s from public, anon, authenticated', v_sig);
  execute format('grant execute on function %s to service_role', v_sig);

  -- platform._drop_custom_field_index — an `_`-prefixed impl, never a door. Its
  -- only client-side reach was through the trigger that §1 just made SECURITY
  -- DEFINER, so it needs no client grant at all.
  v_sig := 'platform._drop_custom_field_index(uuid)';
  execute format('revoke all on function %s from public, anon, authenticated', v_sig);
  execute format('grant execute on function %s to service_role', v_sig);

  -- platform.enforce_definer_client_grants — the §6d-4 event-trigger function.
  -- The event-trigger machinery invokes it with no EXECUTE check (§4 proves it).
  v_sig := 'platform.enforce_definer_client_grants()';
  execute format('revoke all on function %s from public, anon, authenticated', v_sig);

  -- public.org_admin_remove_member — DD-140 residual. `authenticated` STAYS (the
  -- Remove button calls it); anon and PUBLIC go. The door row goes in BEFORE the
  -- grant is re-issued, per §6d-4, so the grant sticks on its own merit instead
  -- of on a grandfather row.
  insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
  select 'public', 'org_admin_remove_member', 'p_org_id uuid, p_user_id uuid, p_reassign_to uuid',
         'Signed-in organization-admin door: the Remove button on /organizations/<id>/admin/users/<id> calls it directly (features/organizations/admin/service.ts). Gated inside on iam.is_org_admin, and its dangerous lane (p_reassign_to not null) raises 42501 with a sentence (DD-140). Never anonymous: anon cannot satisfy is_org_admin, so anon EXECUTE was reach nothing needed.'
  where not exists (
    select 1 from platform.client_callable_door d
    where d.schema_name = 'public' and d.function_name = 'org_admin_remove_member'
      and d.identity_args = 'p_org_id uuid, p_user_id uuid, p_reassign_to uuid');

  v_sig := 'public.org_admin_remove_member(uuid,uuid,uuid)';
  execute format('revoke all on function %s from public, anon', v_sig);
  execute format('grant execute on function %s to authenticated, service_role', v_sig);

  -- platform._custom_field_index_state KEEPS its grants deliberately. It returns
  -- `trigger`, so it is not callable as an RPC at all (`select
  -- platform._custom_field_index_state()` → 0A000 "trigger functions can only be
  -- called as triggers", and PostgREST does not expose trigger-returning
  -- functions), and leaving the grant in place means the archiving path does not
  -- depend on Postgres checking trigger EXECUTE at CREATE TRIGGER time rather
  -- than at fire time. Nothing is gained by narrowing it and a live write path
  -- is risked, so it stays as it is.
end $$;

-- ── 3. The class fix: no grandfather row survives on any of them ─────────────
-- A grandfather row is "the §6d-4 guard stands down here". org_admin_remove_member
-- is protected by its door row from now on; the other four are protected by
-- having no client grant and no door row at all.

delete from platform.definer_client_grant_grandfather g
where (g.schema_name, g.function_name) in (
  ('platform','retrofit_entity'),
  ('platform','create_entity_table'),
  ('platform','_drop_custom_field_index'),
  ('platform','enforce_definer_client_grants'),
  ('platform','_custom_field_index_state'),
  ('public','org_admin_remove_member')
);

-- ── 4. Assertions. A migration that cannot prove its own end state is not a fix ──

do $$
declare
  v_n int; v_bad text;
begin
  -- 4a. None of the four closed functions is reachable by any client role.
  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
          ('platform','retrofit_entity'), ('platform','create_entity_table'),
          ('platform','_drop_custom_field_index'), ('platform','enforce_definer_client_grants'))
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or p.proacl is null
      or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_n > 0 then raise exception 'dd146: % closed function(s) still client-executable, e.g. %', v_n, v_bad; end if;

  -- 4b. service_role KEPT the three provisioner functions (the platform-admin path).
  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
          ('platform','retrofit_entity'), ('platform','create_entity_table'),
          ('platform','_drop_custom_field_index'))
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_n > 0 then raise exception 'dd146: % provisioner function(s) lost service_role EXECUTE, e.g. %', v_n, v_bad; end if;

  -- 4c. org_admin_remove_member: authenticated KEPT, anon and PUBLIC GONE.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='org_admin_remove_member'
    and (not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or p.proacl is null
      or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_n > 0 then raise exception 'dd146: org_admin_remove_member grants are not {authenticated, service_role}'; end if;

  -- 4d. It declares itself, and nothing in this sweep stands on a grandfather row.
  if not exists (select 1 from platform.client_callable_door d
                 where d.schema_name='public' and d.function_name='org_admin_remove_member') then
    raise exception 'dd146: org_admin_remove_member keeps a client grant with no client_callable_door row';
  end if;
  select count(*) into v_n from platform.definer_client_grant_grandfather g
  where (g.schema_name, g.function_name) in (
    ('platform','retrofit_entity'), ('platform','create_entity_table'),
    ('platform','_drop_custom_field_index'), ('platform','enforce_definer_client_grants'),
    ('platform','_custom_field_index_state'), ('public','org_admin_remove_member'));
  if v_n > 0 then raise exception 'dd146: % grandfather row(s) survived the sweep', v_n; end if;

  -- 4d-2. The trigger that carries the privilege now is a definer with no client grant.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='platform' and p.proname='_custom_field_index_state' and not p.prosecdef;
  if v_n > 0 then raise exception 'dd146: platform._custom_field_index_state is not SECURITY DEFINER'; end if;

  -- 4e. THE CLASS IS EMPTY. Same census the D7 guard runs: a client-executable
  --     SECURITY DEFINER whose body contains DDL and no platform-admin gate.
  select count(*), min(fn) into v_n, v_bad from (
    select n.nspname||'.'||p.proname as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
      and n.nspname not in ('pg_catalog','information_schema','pgsodium','pgsodium_masks','extensions',
                            'graphql','graphql_public','vault','auth','storage','realtime',
                            'supabase_functions','supabase_migrations','net','cron','pgbouncer')
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or p.proacl is null
        or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
      and p.prosrc !~* '(is_super_admin|is_platform_admin|admin\.admins|\mis_admin\s*\()'
      and exists (
        select 1 from unnest(string_to_array(p.prosrc, E'\n')) l
        where (l ~* '\mexecute\M' and l ~* '\m(alter|create|drop|truncate)\s+(table|index|trigger|view|policy|schema|type|sequence|materialized|unique|or\s+replace|extension)\M')
           or (l ~* '\mexecute\M' and l ~* '\m(grant|revoke)\s+(execute|all|select|insert|update|delete)\M')
           or (l ~* '^\s*(alter|create|drop|truncate)\s+(table|index|trigger|view|policy|schema|type|sequence|materialized|unique)\M')
           or (l ~* '^\s*(grant|revoke)\s+(execute|all|select|insert|update|delete)\M'))
  ) s;
  if v_n > 0 then raise exception 'dd146: % client-executable definer(s) still run DDL with no platform-admin gate, e.g. %', v_n, v_bad; end if;

  -- 4f. The archiving path that §1 moved: the trigger runs as its OWNER now, so
  --     its nested call into platform._drop_custom_field_index is made by
  --     `postgres`, not by the signed-in user. Asserted here at the catalog
  --     level; the behavioural half (a real `authenticated` JWT archiving a
  --     custom field with the index actually dropped) is proven live in a
  --     rolled-back probe AFTER this migration applies, because `SET ROLE` is
  --     refused inside the applier's own SECURITY DEFINER wrapper (42501,
  --     "cannot set parameter role within security-definer function"), which is
  --     how this file is executed.
  if (select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='platform' and p.proname='_custom_field_index_state')
     <> (select p.proowner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='platform' and p.proname='_drop_custom_field_index') then
    raise exception 'dd146: the definer trigger and the impl it calls have different owners — the nested call would still be privilege-checked';
  end if;

  -- 4g. THE §6d-4 GUARD SURVIVES losing its client EXECUTE. Catalog half here;
  --     the behavioural half is proven in a direct session, NOT from this file —
  --     see the note below, which is a finding in its own right.
  --
  -- 🚨 FINDING (measured 2026-09-12, B-35, and NOT caused by this migration):
  --    `platform.enforce_definer_client_grants` DOES NOT FIRE ON THIS APPLY PATH.
  --    Identical payload, two transports, live:
  --      * direct session (`select public.execute_admin_query($q$ … $q$)`):
  --        create a fresh SECURITY DEFINER function + `grant execute … to
  --        authenticated` → grant revoked, `authenticated` EXECUTE = false, two
  --        `platform.ddl_guard_log` rows written. The guard works.
  --      * `pnpm db:apply` (the same function over PostgREST with
  --        SUPABASE_SECRET_KEY, i.e. how THIS FILE runs) → `authenticated`
  --        EXECUTE = true, proacl still `{=X/postgres,…,authenticated=X/postgres}`,
  --        ddl_guard_log count UNCHANGED (3019 → 3019 → 3019 across CREATE and
  --        GRANT). The guard did nothing and said nothing.
  --    `platform._ddl_guard` DOES fire on the same path (a `create table public.…`
  --    wrote its `no_new_public_tables` row, 3019 → 3020), so event triggers are
  --    not disabled there — this is specific to the §6d-4 guard, which is the one
  --    that is SECURITY DEFINER and is FAIL-OPEN by design (§6d-4: "the per-row
  --    and whole-function handlers swallow every error"). Fail-open plus a path
  --    where it always fails = a guard that has been silently absent from every
  --    matrx-frontend migration. Registered as its own item; fixing the guard is
  --    NOT in DD-146's scope and is not attempted here.
  --    Consequence for this file: asserting the guard's behaviour from inside it
  --    would assert a falsehood about the guard, so this migration asserts only
  --    what is true on this path, and the behavioural proof is run separately.
  if not exists (
    select 1 from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid
    join pg_namespace n on n.oid = p.pronamespace
    where e.evtname = 'enforce_definer_client_grants' and e.evtevent = 'ddl_command_end'
      and e.evtenabled <> 'D' and n.nspname = 'platform'
      and p.proname = 'enforce_definer_client_grants' and p.prosecdef
  ) then
    raise exception 'dd146: the §6d-4 event trigger is missing, disabled, or no longer SECURITY DEFINER — DD-146 must not remove its client grants while it is in that state';
  end if;

  raise notice 'dd146: all assertions passed';
end $$;
