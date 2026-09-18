-- dd248_one_stamping_door_for_context_cells — ONE WAY INTO A CELL, AND IT NAMES THE AUTHOR ITSELF
-- (DD-248 / B-139. SECURITY / PROVENANCE. db-rules §6d. This file changes TABLE GRANTS, one
--  FUNCTION EXECUTE grant, and the body of the grant GENERATOR. It creates, alters and drops no
--  policy, and changes no table's access-lane shape.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-15 ══════════════════════════════════════════
-- `context.context_item_values` holds every scope cell in the platform — append-only, one row per
-- version, `authored_by` saying who produced it and `source_type` saying whether a person typed it
-- or an agent enriched it. A signed-in caller who is an editor of a scope had FOUR ways to write a
-- row there, and the platform had written down only two of them:
--
--   DECLARED, and honest (all SECURITY DEFINER, owned by `postgres`, each checks the scope and
--   each delegates to the one writer with the actor taken from `auth.uid()`):
--     public.set_context_value(jsonb)                the agent/server door, {ok,error} envelope
--     public.set_scope_context_value(...)            the client door the drawer and autosave use
--     public.scope_system_apply(...)                 org-admin bulk door
--     context.provision_scope_dataset(...)           template provisioning, actor = scope owner
--
--   UNDECLARED, and forgeable:
--     context.write_context_value(...)   SECURITY INVOKER. `authenticated` held EXECUTE and
--       `context` is in `pgrst.db_schemas`, so this was an HTTP endpoint on the public API. Its
--       `p_actor` and `p_source_type` are ARGUMENTS: whatever the caller sent became `authored_by`
--       and the provenance stamp — another user's id, or null, or `manual` for an agent's edit.
--       It performs no scope check of its own; nothing outside the four doors was meant to reach it.
--     the table itself.                  `authenticated` held INSERT, UPDATE and DELETE
--       (`relacl` = `arwd`), with an RLS `std_insert` policy admitting any scope editor. A plain
--       `POST /rest/v1/context_item_values` set every column by hand — no version discipline, no
--       reference validation, no reverse index, `authored_by` whatever the body said. `DELETE` on
--       an append-only version chain is a second defect on the same grant.
--
-- MEASURED REFUSALS BEFORE THIS FILE RAN, as test@test.com with that user's real JWT claims,
-- `role authenticated`, inside a rolled-back transaction (`pnpm check:stamped-write-doors`):
--   a direct INSERT                    -> P0001 "context_item_id … does not exist"
--   context.write_context_value(...)   -> 22023 "context item … not found"
-- Neither is a privilege refusal. Both callers were INSIDE the body, stopped by an accident of the
-- data — a real item id would have made both succeed. That is the finding.
--
-- RLS WAS NEVER WRONG, AND THAT IS WHY THIS NEEDED CLOSING RATHER THAN NOTING. Every path refuses
-- a caller who is not an editor of the scope, so nothing was stolen and nothing leaked. What was
-- lost is the MEANING OF THE COLUMN: on two of the four paths the row recorded what the writer
-- CHOSE to say about itself, so "who filled this cell" and "was this AI or a person" were
-- decoration. A privilege standing beside a closed policy is the safe path next to the unsafe one
-- (DD-181): the day a predicate widens, or a caller sends a real id, it is the write that lands.
--
-- ═══ WHY THE GENERATOR, AND NOT A REVOKE ══════════════════════════════════════════════════════
-- These grants are GENERATED. `iam.apply_table_grants(schema, table, variant)` issues
-- `grant select, insert, update, delete … to authenticated` for every variant except `ledger`,
-- and this table is declared `component` — which is CORRECT and must stay: `is_component` is what
-- makes a cell's read access flow from its parent scope (`hr_p3_privacy_wall_entity_read_expr`,
-- `ctx_scope_access_membrane_b7_fix1` both branch on it), and `entity_types_component_flag_consistent`
-- ties that flag to the variant. Re-declaring the table a `ledger` to get read-only grants would
-- have changed its access-lane shape to fix a privilege — the wrong lever.
--
-- So the REGISTER outranks the variant. `platform.stamped_write_table` (DD-248, the sibling
-- migration) names the tables whose rows carry a stamp only a door may set, and this file teaches
-- the generator to read it: a registered table gets the read-only client grant whatever variant it
-- is called with, and says so out loud. A hand-written `revoke` would have lasted exactly until
-- the next regeneration of this table, with nothing anywhere to notice — which is the same defect
-- again, on a timer.
--
-- ═══ WHAT THIS FILE DOES ══════════════════════════════════════════════════════════════════════
-- 1. Corrects the register row seeded by dd248_stamped_write_register: the declared variant is
--    `component` (the truth), and it is the REGISTER, not the variant, that withholds DML.
-- 2. Replaces `iam.apply_table_grants` — byte-for-byte the live body, plus the register check and
--    its notice. Every other rail (the RLS/policy refusal, the column-exclusion design, the
--    `restricted` branch, service_role's full reach) is unchanged.
-- 3. REGENERATES this table's grants through that generator, so the closed state is the
--    generator's own output rather than something standing beside it.
-- 4. REVOKES EXECUTE on `context.write_context_value` from `authenticated`, `anon` and PUBLIC. It
--    keeps `service_role` (the server's lane), `svc_seo` and `dashboard_user` — `authenticator`
--    cannot become either, so neither is reachable from a browser — and `postgres`, which owns it.
--    The four doors are SECURITY DEFINER owned by `postgres` and execute it as `postgres`: proven
--    untouched by the live probe after this file ran.
-- 5. VERIFIES all of it and RAISES if anything is still open, so this migration cannot be ledgered
--    over a surface it did not actually close.
--
-- ═══ WHAT KEEPS WORKING — THE CALL-SITE CENSUS (five repos, 2026-09-15) ═══════════════════════
--   matrx-frontend  features/scopes/service/scopesService.ts        rpc set_context_value
--                   features/scope-system/redux/scopeValuesSlice.ts rpc set_scope_context_value
--                   features/scopes/service/scopesService.ts        4x .from("context_item_values")
--                                                                   .select(…) — READS, untouched
--   aidream         services/conversation_context/context_writeback.py → set_context_value, over a
--                   direct matrx-orm pool connection as `postgres`, not a client role
--                   db/migrations 0190, 0196, 0522, ctx_matter_qme_report_reference,
--                   ctx_reference_legacy_scope_backfill: SQL callers of write_context_value, all
--                   inside SECURITY DEFINER functions owned by `postgres`
--   matrx-sandbox / matrx-extend / matrx-local / matrx-ship: no call site of any of the three.
-- NOT ONE client call site calls `context.write_context_value` or writes the table directly. Both
-- grants closed here were reach nobody was using.
--
-- ═══ WHAT THIS DOES NOT DO ════════════════════════════════════════════════════════════════════
-- The RLS policies `std_insert` / `std_update` / `std_delete` still name `authenticated`. A policy
-- without a privilege admits nobody — they are inert — and regenerating the policy set belongs to
-- `iam.apply_rls`, which would also rewrite this table's large bespoke `std_select`; a grant
-- migration has no business doing that on its way past. The register and the generator are now
-- what stand between those policies and a privilege.
--
-- WIDER, NOT CLOSED HERE: 102 SECURITY INVOKER functions in PostgREST-exposed schemas still carry
-- `authenticated` EXECUTE and write in their bodies (measured 2026-09-15). DD-197 closed that class
-- for `anon` on 66 of them and deliberately re-granted every one to `authenticated`; the signed-in
-- half of that axis has never been triaged. This file closes the one that reaches a table whose
-- rows name their author, and the guard fails on the next one that does.
--
-- GUARD: `pnpm check:stamped-write-doors` (scripts/check-stamped-write-doors.ts). Seven findings
-- against the live database before this file; zero after.

-- ── 1. the register says what is true: the variant stays `component` ───────────────────────────
update platform.stamped_write_table
   set rls_variant = 'component',
       reason = 'Every scope cell in the platform, append-only, one row per version. `authored_by` is who the platform names when somebody asks who filled a cell, and `source_type` is how it tells an AI enrichment from a person typing. context.write_context_value is the ONE writer that sets them; public.set_context_value, public.set_scope_context_value, public.scope_system_apply and context.provision_scope_dataset are its declared SECURITY DEFINER doors and each derives the actor from auth.uid(). The `component` variant is correct and stays — it is what makes a cell''s read access flow from its parent scope — so it is THIS REGISTER, read by iam.apply_table_grants, that withholds the client write privilege.'
 where schema_name = 'context' and table_name = 'context_item_values';

comment on column platform.stamped_write_table.rls_variant is
  'The variant this table is declared with in platform.entity_types, recorded so a change to its access-lane shape is visible here. It is NOT what withholds the write privilege — membership of this register is, and iam.apply_table_grants reads it (DD-248).';

-- ── 2. the generator reads the register ────────────────────────────────────────────────────────
-- based-on: iam.apply_table_grants(text, text, text) 8fcdb83b80b625ed2a0c76e0a887dd297b6eaf45fa660d5e45f099d33122d88c
CREATE OR REPLACE FUNCTION iam.apply_table_grants(p_schema text, p_table text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $atg$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_declared text[];
  v_missing text;
  v_excluded_now text;
  v_kept text;
  v_override text;
  v_column text;
  v_stamped boolean;
begin
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if v_n_pol = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.',
      p_schema, p_table;
  end if;
  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.
  -- A table in `platform.stamped_write_table` carries a column that says who produced
  -- the row (`context.context_item_values.authored_by`). That is worth nothing unless
  -- exactly ONE code path can set it, and a client DML grant is a second path with no
  -- code in it at all. Such a table gets the read-only client grant whatever variant it
  -- is called with, so this generator can never be the thing that re-opens it: B-139
  -- found the cell table declared `component`, which grants insert/update/delete, and
  -- correcting that by hand would have lasted exactly until the next regeneration.
  -- The variant still decides everything else about the table (its access-lane shape as
  -- a component, its policies) — only the write privilege is withheld here.
  select exists (
    select 1 from platform.stamped_write_table s
     where s.schema_name = p_schema and s.table_name = p_table
  ) into v_stamped;

  if p_variant = 'restricted' and not exists (
    select 1 from information_schema.columns where table_schema=p_schema and table_name=p_table and column_name='visibility'
  ) then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
    end loop;
    execute format('grant all on %s to service_role', v_tbl);
    return;
  end if;

  -- ── THE COLUMN-EXCLUSION DESIGN (db-rules §6d-2) ─────────────────────────
  -- Declared in the registry, never inferred from the catalog. `ADD COLUMN`
  -- leaves attacl NULL, so a new column and a deliberately-excluded one are
  -- indistinguishable in the ACLs; inferring the set would silently hide every
  -- future column from clients (proven live, 2026-08-21). The declaration is
  -- the intent; the ACLs are only its artifact.
  select et.client_excluded_columns into v_declared
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;

  if v_declared is not null and cardinality(v_declared) = 0 then
    v_declared := null;
  end if;

  -- A declared name that is not a live column is a stale declaration, and a
  -- stale declaration is how an exclusion quietly stops excluding anything.
  if v_declared is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_declared) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x
                         and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_excluded_columns that do not exist: % — fix or clear the declaration (db-rules §6d-2).',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- The override means, and has always meant, DELIBERATELY RETIRE this design.
  begin
    v_override := current_setting('iam.allow_column_grant_override', true);
  exception when others then
    v_override := null;
  end;

  if v_declared is not null
     and coalesce(v_override, '') in ('on', 'true', '1', 'yes') then
    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being RETIRED for this call; table-level grants replace it. Clear entity_types.client_excluded_columns to make that permanent.',
      p_schema, p_table, array_to_string(v_declared, ', ');
    v_declared := null;
  end if;

  -- An UNDECLARED design still refuses, exactly as the rail did before — that
  -- is the lane protecting every table not yet migrated to a declaration.
  if v_declared is null then
    select count(*),
           count(*) filter (where a.attacl::text like '%authenticated=%')
      into v_live_cols, v_granted_cols
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

    if v_granted_cols > 0 and v_granted_cols < v_live_cols
       and coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      select string_agg(a.attname, ', ' order by a.attnum) into v_excluded_now
      from pg_attribute a
      where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
        and (a.attacl is null or a.attacl::text not like '%authenticated=%');
      raise exception
        'apply_table_grants: %.% runs an UNDECLARED column-level grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. Declare it: UPDATE platform.entity_types SET client_excluded_columns = ARRAY[...] WHERE schema_name=%L AND table_name=%L; then re-run. To retire the design instead: set local iam.allow_column_grant_override = ''on''; (db-rules §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded_now, p_schema, p_table;
    end if;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  if p_variant = 'ledger' or v_stamped then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    if v_stamped and p_variant <> 'ledger' then
      raise notice
        'apply_table_grants: %.% is a STAMPED-WRITE table (platform.stamped_write_table) — issuing the READ-ONLY client grant instead of the % variant''s write grants. Its writes belong to its declared SECURITY DEFINER doors, which stamp the author from the caller (DD-248).',
        p_schema, p_table, p_variant;
    end if;
    if v_declared is null then
      execute format('grant select on %s to authenticated', v_tbl);
    else
      execute format('grant select (%s) on %s to authenticated',
                     iam._client_grant_column_list(v_rel, v_declared), v_tbl);
    end if;
  else
    if v_declared is null then
      execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
    else
      v_kept := iam._client_grant_column_list(v_rel, v_declared);
      -- DELETE has no column form and needs none: removing a row you are
      -- already permitted to remove reveals nothing about an excluded column.
      execute format('grant select (%1$s), insert (%1$s), update (%1$s) on %2$s to authenticated',
                     v_kept, v_tbl);
      execute format('grant delete on %s to authenticated', v_tbl);
    end if;
  end if;

  if v_declared is not null then
    raise notice
      'apply_table_grants: %.% column-exclusion design PRESERVED (withheld from authenticated: %).',
      p_schema, p_table, array_to_string(v_declared, ', ');
  end if;

  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
end;
$atg$;

-- ── 3. the closed state is the generator's own output ──────────────────────────────────────────
select iam.apply_table_grants('context', 'context_item_values', 'component');

-- ── 4. the undeclared invoker door loses its client reach ──────────────────────────────────────
revoke execute on function context.write_context_value(
  p_item_id uuid, p_scope_id uuid, p_value_text text, p_value_number numeric,
  p_value_boolean boolean, p_value_json jsonb, p_value_date date, p_value_document_url text,
  p_value_timestamp timestamp with time zone, p_value_time time without time zone,
  p_change_summary text, p_source_type text, p_actor uuid
) from authenticated, anon, public;

comment on function context.write_context_value(
  uuid, uuid, text, numeric, boolean, jsonb, date, text,
  timestamp with time zone, time without time zone, text, text, uuid
) is
  'THE ONE WRITER for context.context_item_values: validates references, inserts (version/is_current owned by trg_ctx_version_context_item_value), rebuilds the reverse index, and stamps authored_by + source_type FROM ITS ARGUMENTS. Because it takes the actor as an argument it is NOT a door, and no client role may execute it (DD-248): its callers are public.set_context_value, public.set_scope_context_value, public.scope_system_apply and context.provision_scope_dataset — each SECURITY DEFINER, each checking the scope, each passing auth.uid(). Never insert into context_item_values directly anywhere else.';

-- ── 5. the migration proves its own claim ──────────────────────────────────────────────────────
do $verify$
declare
  v_open text;
begin
  select string_agg(format('%s %s', role_name, priv), ', ')
    into v_open
  from (
    select r as role_name, p as priv
      from unnest(array['anon','authenticated','public']) r
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
     where has_table_privilege(r, 'context.context_item_values'::regclass, p)
  ) x;
  if v_open is not null then
    raise exception
      'dd248: context.context_item_values is STILL client-writable without a door (%). The generated grants did not close it — do not ledger this migration over an open surface.', v_open;
  end if;

  if has_function_privilege('authenticated',
       'context.write_context_value(uuid, uuid, text, numeric, boolean, jsonb, date, text, timestamp with time zone, time without time zone, text, text, uuid)'::regprocedure,
       'EXECUTE') then
    raise exception
      'dd248: `authenticated` can STILL execute context.write_context_value — the revoke missed a grant held through PUBLIC or through role membership (DD-194).';
  end if;

  if not has_table_privilege('authenticated', 'context.context_item_values'::regclass, 'SELECT') then
    raise exception
      'dd248: `authenticated` lost SELECT on context.context_item_values — the register withholds WRITES only. Four client read sites in matrx-frontend depend on this.';
  end if;

  if not has_function_privilege('service_role',
       'context.write_context_value(uuid, uuid, text, numeric, boolean, jsonb, date, text, timestamp with time zone, time without time zone, text, text, uuid)'::regprocedure,
       'EXECUTE') then
    raise exception
      'dd248: service_role lost EXECUTE on context.write_context_value — the server writes cells through it.';
  end if;
end $verify$;
