-- DD-223 — A DOOR IS IDENTIFIED BY ITS CATALOG SIGNATURE, NEVER BY RENDERED TEXT.
-- (B-118, Data Doctrine adoption program, 2026-09-14.)
--
-- THE DEFECT, MEASURED 2026-09-14 AGAINST THE LIVE DATABASE
-- ---------------------------------------------------------
-- `platform.client_callable_door` is the register of what a client may call, and
-- until this file the ONLY thing that identified a row's function was a string:
-- `identity_args`, the output of `pg_get_function_identity_arguments`. That output
-- is not a property of the function. It is a property of WHO IS LOOKING:
-- Postgres renders an argument type BARE when its schema is on the reader's
-- `search_path` and SCHEMA-QUALIFIED when it is not. Measured on `web.create_site`,
-- same oid, same session, one `set search_path` apart:
--
--   under 'platform','public','pg_catalog'  … p_visibility visibility …
--   under "$user", public, extensions       … p_visibility platform.visibility …
--
-- The §6d-4 guard `platform.enforce_definer_client_grants_impl` runs under the
-- first and matched the register with `c.identity_args = <that rendering>`. So a
-- door row written from a session with a different search_path — every psql, every
-- PostgREST connection, every lane that did not know to set one — READS AS
-- UNDECLARED TO THE GUARD, and the guard's answer to an undeclared SECURITY
-- DEFINER function holding a client grant is to REVOKE THE GRANT. Fail-closed and
-- loud, but it breaks the feature.
--
-- PROVEN RED BEFORE THIS FILE WAS WRITTEN, in one transaction that was ROLLED BACK
-- (`scratchpad/b118/red1.sql`): a scratch SECURITY DEFINER function taking an enum
-- that lives in `platform`, a door row spelled the way a default-search_path
-- session renders it (`p_hue platform.dd223_red_hue`), then a GRANT and a
-- CREATE OR REPLACE. The guard's own lookup found 0 rows, `authenticated` lost
-- EXECUTE at the GRANT and again at the replace, and
-- `ddl_guard[definer_client_grant_revoked]` was written three times for a door
-- that was declared, correctly, by somebody who was simply connected differently.
--
-- That is the class DD-210 (B-108 §9.1) and V-83 §4 reported and did not close:
-- 15 of the 28 rows B-108 retired were this exact accident. Retiring the twins
-- removed the instances; this file removes the door.
--
-- WHAT IDENTIFIES A DOOR FROM TODAY
-- ----------------------------------
-- `identity_argtypes oid[]` — the function's `pg_proc.proargtypes`, normalised to
-- a 1-based array by `platform.door_argtypes`. It is the same key
-- `platform.definer_client_grant_grandfather` has keyed on since hr_l3_109, and it
-- cannot be re-rendered by a different reader: an oid is an oid from every
-- connection, under every search_path, in every schema.
--
--   * BACKFILLED FROM THE CATALOG for every existing row, never typed.
--   * NOT NULL, and every element non-null (a shape CHECK), with a BEFORE trigger
--     that fills it from the catalog when a row is inserted without one and
--     REFUSES, in a sentence, any row whose argtypes name no live function of that
--     schema and name. (The catalog match is a trigger and not a CHECK constraint
--     on purpose: a CHECK that reads `pg_proc` is re-evaluated by `pg_restore`
--     against a database where the table exists before the functions do, and every
--     row would then fail its own constraint. The shape is declarative; the
--     catalog match is the trigger, and it speaks.)
--   * UNIQUE on (schema_name, function_name, identity_argtypes) — the same door
--     can no longer be registered twice under two spellings, which is what made
--     fifteen rows possible in the first place.
--
-- `identity_args` STAYS, and becomes what it always honestly was: a DISPLAY
-- column — how the signature reads to a human. Nothing matches on it any more.
--
-- AND THE SECOND HOLE THE SAME GUARD CARRIED (DD-210 §9.2)
-- --------------------------------------------------------
-- The §6d-4 guard read `anonymous_callers` and the mere EXISTENCE of a row. It
-- never read `signed_in_callers`. So `GRANT EXECUTE … TO authenticated` on a door
-- whose register row says NO CLIENT MAY OPEN THIS (`signed_in_callers = false`,
-- `anonymous_callers = false`, a `non_client_lane` naming the service lane that
-- does reach it) was preserved by the guard's capture-and-re-grant arm and caught
-- only by `check:impl-doors` D16a in CI — and CI is a signal, never a gate.
-- PROVEN RED, rolled back (`scratchpad/b118/red3.sql`): the grant stuck, silently.
-- From this file the guard REFUSES that GRANT at grant time, with a sentence that
-- names the lane the row declares and the two ways to proceed.
--
-- WHAT THIS FILE DOES NOT DO. It does not touch `scripts/check-door-rows.ts`
-- (another lane owns it this hour) and it does not regenerate
-- `types/database.types.ts`: the register carries no client grant and no RLS, no
-- TypeScript reads it, and that file is dirty with peers' work in this shared
-- checkout.

-- 🚨 This file works under the §6d-4 guard's own search_path, because the BACKFILL
-- reads `identity_args` — the one step that still depends on a rendering. From the
-- end of the backfill onwards nothing in this database depends on one again.
set local search_path = platform, public, pg_catalog;
-- An explicit, stated bound: the register is read by every DDL on this database,
-- so its ACCESS EXCLUSIVE moments are the ones most likely to meet a peer lane's
-- query. 30s is long enough to get behind a gate run and short enough that this
-- file never becomes the thing everyone else is waiting on.
set local lock_timeout = '30s';

-- ─── 1. The normaliser ──────────────────────────────────────────────────────
-- `pg_proc.proargtypes` is an `oidvector`; `::oid[]` renders it with lower bound 0
-- for a function with arguments and as a zero-dimension empty array for one
-- without, and Postgres array equality compares lower bounds — measured:
-- `'[0:1]={1,2}'::int[] = '{1,2}'::int[]` is FALSE. A key that is only sometimes
-- comparable is not a key, so every producer and every consumer goes through here.
create or replace function platform.door_argtypes(p_argtypes oidvector)
returns oid[]
language sql
immutable
parallel safe
as $fn$
  select coalesce(array_agg(t order by ord), '{}'::oid[])
    from unnest(p_argtypes::oid[]) with ordinality as u(t, ord);
$fn$;

comment on function platform.door_argtypes(oidvector) is
  'THE identity of a database function, as an array nothing can re-render: its argument type oids, 1-based so that two of them are always comparable. platform.client_callable_door.identity_argtypes is this; the §6d-4 guard and the anon birth guard look doors up by this; check:impl-doors D2b/D13/D15/D16 join on this. Never compare pg_get_function_identity_arguments text: it renders bare or schema-qualified depending on the reader search_path (DD-223).';

revoke execute on function platform.door_argtypes(oidvector) from public;

-- ─── 2. The column ──────────────────────────────────────────────────────────
alter table platform.client_callable_door
  add column if not exists identity_argtypes oid[];

-- ─── 3. The backfill, from the catalog, in three stated tiers ───────────────
-- Tier A is the rendering under THIS file's search_path — the guard's own, the one
-- 944 of 944 rows already match. B and C exist so that a row written under any
-- other search_path, or one whose spelling drifted, still resolves rather than
-- blocking the file: B strips schema qualifiers from both sides, C accepts a
-- function name that has exactly one overload in its schema. Each tier reports
-- how many rows it claimed, and the file refuses to go on if anything is left.
update platform.client_callable_door c
   set identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where c.identity_argtypes is null
   and n.nspname = c.schema_name
   and p.proname = c.function_name
   and pg_get_function_identity_arguments(p.oid) = c.identity_args;

update platform.client_callable_door c
   set identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where c.identity_argtypes is null
   and n.nspname = c.schema_name
   and p.proname = c.function_name
   and regexp_replace(pg_get_function_identity_arguments(p.oid), '\m[a-z_][a-z0-9_]*\.', '', 'g')
     = regexp_replace(c.identity_args, '\m[a-z_][a-z0-9_]*\.', '', 'g')
   and (select count(*) from pg_catalog.pg_proc p2
          join pg_catalog.pg_namespace n2 on n2.oid = p2.pronamespace
         where n2.nspname = c.schema_name and p2.proname = c.function_name
           and regexp_replace(pg_get_function_identity_arguments(p2.oid), '\m[a-z_][a-z0-9_]*\.', '', 'g')
             = regexp_replace(c.identity_args, '\m[a-z_][a-z0-9_]*\.', '', 'g')) = 1;

update platform.client_callable_door c
   set identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where c.identity_argtypes is null
   and n.nspname = c.schema_name
   and p.proname = c.function_name
   and (select count(*) from pg_catalog.pg_proc p2
          join pg_catalog.pg_namespace n2 on n2.oid = p2.pronamespace
         where n2.nspname = c.schema_name and p2.proname = c.function_name) = 1;

do $$
declare v_left int; v_names text;
begin
  select count(*), coalesce(string_agg(schema_name || '.' || function_name, ', '), '')
    into v_left, v_names
    from platform.client_callable_door where identity_argtypes is null;
  if v_left > 0 then
    raise exception
      'DD-223: % door row(s) name no live function under any of the three resolution tiers, so they cannot be given a catalog identity: %. Retire them (platform.client_callable_door_retirement) or correct the schema/function name, then re-run this file.',
      v_left, v_names;
  end if;
  raise notice 'DD-223: every door row now carries the catalog identity of its function.';
end $$;

alter table platform.client_callable_door
  alter column identity_argtypes set not null;

alter table platform.client_callable_door
  add constraint door_identity_argtypes_is_an_argument_list
  check (array_position(identity_argtypes, null::oid) is null);

-- One door, one row. The fifteen duplicate-spelling rows DD-210 retired could not
-- have been written with this in place.
create unique index if not exists client_callable_door_catalog_identity_key
  on platform.client_callable_door (schema_name, function_name, identity_argtypes);

comment on column platform.client_callable_door.identity_argtypes is
  'THE IDENTITY OF THIS DOOR: the function argument type oids (pg_proc.proargtypes through platform.door_argtypes). Every lookup — the §6d-4 guard, the anon birth guard, check:impl-doors — matches on (schema_name, function_name, identity_argtypes) and on nothing else. Filled from the catalog by a trigger when a row arrives without one. DD-223 (B-118).';
comment on column platform.client_callable_door.identity_args is
  'DISPLAY ONLY: how this function signature reads to a human. NOT an identity — pg_get_function_identity_arguments renders an argument type bare or schema-qualified depending on the reader search_path, so the same door reads as declared or undeclared depending on who asks (that is how fifteen duplicate rows were born and how web.create_site nearly lost its grant). Match on identity_argtypes. DD-223 (B-118).';

-- ─── 4. The row says what the catalog says, or it is refused ────────────────
create or replace function platform.door_identity_is_the_catalogs()
returns trigger
language plpgsql
set search_path to 'platform', 'public', 'pg_catalog'
as $fn$
declare
  v_candidates int;
  v_render     text;
begin
  if new.identity_argtypes is null then
    -- A row written by a lane that predates this column, or by hand. Resolve it
    -- from the catalog the same way the backfill did, and say so.
    select count(*) into v_candidates
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name
       and pg_get_function_identity_arguments(p.oid) = new.identity_args;
    if v_candidates = 1 then
      select platform.door_argtypes(p.proargtypes) into new.identity_argtypes
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name
         and pg_get_function_identity_arguments(p.oid) = new.identity_args;
      return new;
    end if;
    select count(*) into v_candidates
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name;
    if v_candidates = 1 then
      select platform.door_argtypes(p.proargtypes) into new.identity_argtypes
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name;
      return new;
    end if;
    raise exception
      'platform.client_callable_door: cannot register a door for %.% — the identity_args you gave (%) name no live function of that name under this session search_path (%), and % overload(s) exist, so the row cannot be resolved to one. Register the door from a migration that runs under the same search_path as the function definition, or pass identity_argtypes yourself: platform.door_argtypes(proargtypes) of the function you mean. (DD-223.)',
      new.schema_name, new.function_name, new.identity_args,
      current_setting('search_path'), v_candidates
      using errcode = '23514';
  end if;

  if not exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = new.schema_name and p.proname = new.function_name
         and platform.door_argtypes(p.proargtypes) = new.identity_argtypes) then
    select coalesce(string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', '), '(no function of that name)')
      into v_render
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = new.schema_name and p.proname = new.function_name;
    raise exception
      'platform.client_callable_door: the identity_argtypes on this row name no live function %.% — the catalog holds: %. A door row is a stand-down for the §6d-4 guard, so it may only name a function that exists. (DD-223.)',
      new.schema_name, new.function_name, v_render
      using errcode = '23514';
  end if;
  return new;
end $fn$;

comment on function platform.door_identity_is_the_catalogs() is
  'Every platform.client_callable_door row carries the catalog identity of the function it declares: filled from the catalog when absent, refused in a sentence when it names nothing live. This is a trigger rather than a CHECK constraint because a CHECK that reads pg_proc is re-evaluated by pg_restore before the functions exist. DD-223 (B-118).';

drop trigger if exists door_identity_is_the_catalogs on platform.client_callable_door;
create trigger door_identity_is_the_catalogs
  before insert or update on platform.client_callable_door
  for each row execute function platform.door_identity_is_the_catalogs();

-- ─── 5. The §6d-4 guard matches on the catalog identity, and reads BOTH flags ──
-- Changes against the body recorded in the based-on line above this statement:
--   * every `client_callable_door` lookup keys on
--     (schema_name, function_name, identity_argtypes) — three in the per-object
--     pass and the GRANT re-sweep — never on the rendered `identity_args`;
--   * `signed_in_callers` is read beside `anonymous_callers`, and a client grant
--     on a door row that declares NO client lane is REFUSED at grant time;
--   * the fail-open handler moved one level in so that refusal can leave the
--     function. Everything it protects is unchanged: a guard failure is still a
--     warning and never an abort. Only a deliberate refusal aborts.
-- based-on: platform.enforce_definer_client_grants_impl(oid[], boolean, text) 66495fa335e60c65e7f18e89d9876dce150aa8a4cc6ccfea5ad40e891f67572c
create or replace function platform.enforce_definer_client_grants_impl(p_objids oid[], p_grant boolean, p_tag text)
returns void
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $function$
declare
  r_oid oid;
  fn record;
  v_detail text;
  v_revoked boolean;
  v_anon_door boolean;
  v_signed_in_door boolean;
  v_lane text;
  v_keep text[];
  v_role text;
  v_refusals text[] := '{}'::text[];
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
begin
  -- 🚨 THE FAIL-OPEN BLOCK. Everything the guard DOES lives in here, so a guard
  -- failure is still a warning and never an abort (DD-151). A REFUSAL is not a
  -- failure: it is collected and raised below, outside this handler, because a
  -- refusal that this block swallowed would be a rule nobody obeys (DD-223).
  begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
             p.proargtypes::text as argtypes,
             platform.door_argtypes(p.proargtypes) as argtype_oids,
             pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig,
             p.oid as oid
        into fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = r_oid;
      if not found then continue; end if;
      if not fn.prosecdef then continue; end if;
      if fn.prokind not in ('f','p') then continue; end if;
      if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
      if fn.sch = any(v_exempt) then continue; end if;
      if exists (select 1 from pg_depend d where d.objid = r_oid and d.deptype = 'e') then continue; end if;
      -- 🚨 GRANDFATHER MATCH BY ARG-TYPE OIDs — search-path-independent (hr_l3_109 fix).
      if exists (select 1 from platform.definer_client_grant_grandfather g
                  where g.schema_name = fn.sch and g.function_name = fn.nm and g.argtypes = fn.argtypes) then continue; end if;

      -- 🚨 DD-223: THE DOOR ROW IS FOUND BY THE CATALOG'S IDENTITY, never by the
      -- rendered signature. `identity_args` renders bare or schema-qualified
      -- depending on the reader's search_path, so a correctly declared door read
      -- as UNDECLARED here and this guard revoked its grant (proven, rolled back).
      -- DD-212b: the row's FLAGS, not merely its existence. NULL = no row.
      select bool_or(c.anonymous_callers), bool_or(c.signed_in_callers),
             max(c.non_client_lane)
        into v_anon_door, v_signed_in_door, v_lane
        from platform.client_callable_door c
       where c.schema_name = fn.sch and c.function_name = fn.nm
         and c.identity_argtypes = fn.argtype_oids;

      -- 🚨 DD-223: a row that declares NO CLIENT LANE is a refusal, not a
      -- stand-down. Until today the guard re-granted `authenticated` here and
      -- only CI noticed — and CI is a signal, never a gate.
      if v_anon_door is false and v_signed_in_door is false
         and has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
        v_refusals := v_refusals || format(
          '%s is registered in platform.client_callable_door as a door NO CLIENT may open (signed_in_callers = false, anonymous_callers = false). The lane its row names is: %s. A client EXECUTE grant on it is refused. Either grant it to the role that lane names instead of to authenticated/anon, or — if a signed-in caller really is meant to reach it — change its row to signed_in_callers = true with a reason saying who that caller is, in the SAME migration, BEFORE the grant.',
          fn.sig, coalesce(v_lane, '(the row names no lane)'));
        continue;
      end if;

      if v_anon_door is true then
        -- A DECLARED anonymous door keeps every grant it has. That is what the flag means.
        continue;
      elsif v_anon_door is false then
        -- A DECLARED SIGNED-IN door: signed-in callers keep everything, anon loses its reach.
        if not (has_function_privilege('anon', fn.oid, 'EXECUTE')
                or has_function_privilege('public', fn.oid, 'EXECUTE')) then continue; end if;
        select coalesce(array_agg(x.rolname), '{}'::text[])
          into v_keep
          from pg_roles x
         where x.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
           and has_function_privilege(x.rolname, fn.oid, 'EXECUTE');
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        foreach v_role in array v_keep
        loop
          execute format('grant execute on function %s to %I', fn.sig, v_role);
        end loop;
        begin
          v_detail := platform.definer_guard_anon_revoke_notice(
                        fn.sch, fn.nm, fn.ia, fn.sig, array_to_string(v_keep, ', '));
          raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: %', v_detail;
          insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
          values ('warn', 'declared_signed_in_door_anon_revoked',
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
        exception when others then
          raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
        end;
        continue;
      end if;

      -- No door row at all — the §6d-4 contract, unchanged.
      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      execute format('revoke execute on function %s from authenticated', fn.sig);
      -- 🚨 THE ANNOUNCEMENT (hr_l3_110) — its OWN subtransaction, so a logging failure can never
      -- roll the revoke above back, and `raise warning` can never abort the DDL.
      begin
        v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
        raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
        insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        values ('warn', 'definer_client_grant_revoked',
                format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
      exception when others then
        raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
      end;
    exception when others then null;
    end;
  end loop;

  if p_grant then
    for fn in
      select p.oid::regprocedure::text as sig, n.nspname as sch, p.proname as nm,
             pg_get_function_identity_arguments(p.oid) as ia, p.oid as oid,
             -- 🚨 DD-212b/DD-223: carried out of the filter so the loop body knows
             -- WHICH revoke to make, and matched on the catalog identity.
             (select bool_or(c.signed_in_callers) from platform.client_callable_door c
               where c.schema_name = n.nspname and c.function_name = p.proname
                 and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as signed_in_flag,
             (select max(c.non_client_lane) from platform.client_callable_door c
               where c.schema_name = n.nspname and c.function_name = p.proname
                 and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as lane,
             exists (select 1 from platform.client_callable_door c
                      where c.schema_name = n.nspname and c.function_name = p.proname
                        and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as declared
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.prokind in ('f','p')
         and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
         and not (n.nspname = any(v_exempt))
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')
           or has_function_privilege('public', p.oid, 'EXECUTE'))
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         -- 🚨 same argtypes match — the re-sweep MUST respect the grandfather (the hr_l3_108 bug).
         and not exists (select 1 from platform.definer_client_grant_grandfather g
                          where g.schema_name = n.nspname and g.function_name = p.proname
                            and g.argtypes = p.proargtypes::text)
         -- 🚨 DD-212b: only a door declared ANONYMOUS is exempt from the sweep. A declared
         -- SIGNED-IN door now enters it and loses anon/PUBLIC — a bare `GRANT … TO anon`
         -- on one used to fire nothing at all.
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_argtypes = platform.door_argtypes(p.proargtypes)
                            and c.anonymous_callers)
         and (not exists (select 1 from platform.client_callable_door c
                           where c.schema_name = n.nspname and c.function_name = p.proname
                             and c.identity_argtypes = platform.door_argtypes(p.proargtypes))
              or has_function_privilege('anon', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE')
              -- 🚨 DD-223: a both-flags-false door holding an `authenticated` grant
              -- never entered this sweep at all, which is exactly why nothing
              -- refused it. It enters now, and the refusal is below.
              or exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_argtypes = platform.door_argtypes(p.proargtypes)
                            and not c.signed_in_callers and not c.anonymous_callers))
    loop
      v_revoked := false;
      if fn.declared and fn.signed_in_flag is false
         and has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
        -- 🚨 DD-223: declared, and declared UNREACHABLE by any client.
        v_refusals := v_refusals || format(
          '%s is registered in platform.client_callable_door as a door NO CLIENT may open (signed_in_callers = false, anonymous_callers = false). The lane its row names is: %s. A client EXECUTE grant on it is refused. Either grant it to the role that lane names instead of to authenticated/anon, or — if a signed-in caller really is meant to reach it — change its row to signed_in_callers = true with a reason saying who that caller is, in the SAME migration, BEFORE the grant.',
          fn.sig, coalesce(fn.lane, '(the row names no lane)'));
      elsif fn.declared then
        -- Declared SIGNED-IN door: take back anon/PUBLIC, hand every signed-in role back.
        begin
          select coalesce(array_agg(x.rolname), '{}'::text[])
            into v_keep
            from pg_roles x
           where x.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
             and has_function_privilege(x.rolname, fn.oid, 'EXECUTE');
          execute format('revoke execute on function %s from public', fn.sig);
          execute format('revoke execute on function %s from anon', fn.sig);
          foreach v_role in array v_keep
          loop
            execute format('grant execute on function %s to %I', fn.sig, v_role);
          end loop;
          v_revoked := true;
        exception when others then v_revoked := false;
        end;
        if v_revoked then
          begin
            v_detail := platform.definer_guard_anon_revoke_notice(
                          fn.sch, fn.nm, fn.ia, fn.sig, array_to_string(v_keep, ', '));
            raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: %', v_detail;
            insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
            values ('error', 'declared_signed_in_door_anon_revoked',
                    format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
          exception when others then
            raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
          end;
        end if;
      else
        begin
          execute format('revoke execute on function %s from public', fn.sig);
          execute format('revoke execute on function %s from anon', fn.sig);
          execute format('revoke execute on function %s from authenticated', fn.sig);
          v_revoked := true;
        exception when others then v_revoked := false;
        end;
        -- 🚨 severity 'error' on this path: reaching it means somebody just GRANTed an undeclared
        -- definer and the guard took it straight back. Announced only when the revoke happened.
        if v_revoked then
          begin
            v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
            raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
            insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
            values ('error', 'definer_client_grant_revoked',
                    format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
          exception when others then
            raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
          end;
        end if;
      end if;
    end loop;
  end if;
  exception
    when others then
      -- fail-open, but NEVER silent (DD-151): the old body swallowed into `null`.
      raise warning 'ddl_guard[definer_client_grant_revoked]: THE GUARD FAILED (%) — an undeclared client EXECUTE grant may have survived. The guard needs repair.', sqlerrm;
  end;

  -- 🚨 DD-223: OUTSIDE the fail-open handler. A refusal is a decision, not a
  -- failure, and it aborts the command that caused it.
  if coalesce(array_length(v_refusals, 1), 0) > 0 then
    raise exception 'ddl_guard[client_grant_on_a_non_client_door]: %', array_to_string(v_refusals, ' || ')
      using errcode = '42501',
            hint = 'platform.client_callable_door is the register of what a client may call. A row with signed_in_callers = false and anonymous_callers = false says, in the database, that no browser session of any kind reaches this function. §6d-4 now enforces that at grant time instead of leaving it to CI. (DD-223.)';
  end if;
end;
$function$;

-- ─── 5b. The event-trigger wrapper lets a REFUSAL through ───────────────────
-- 🚨 Without this the refusal above is worth nothing. The wrapper's own
-- `exception when others then raise warning` — correct for a guard FAILURE, which
-- must never abort a deployment — would have turned the deliberate refusal into a
-- warning too, and the GRANT would have committed anyway. A refusal carries
-- errcode 42501 and is re-raised; everything else still degrades to a warning.
-- based-on: platform.enforce_definer_client_grants() 06c041b5653b534701ad0d1a8686d67bac414a54f036c6fc6af3ada8c6b36569
create or replace function platform.enforce_definer_client_grants()
returns event_trigger
language plpgsql
set search_path to 'platform', 'public', 'pg_catalog'
as $function$
declare
  v_objids oid[];
  v_grant  boolean;
begin
  -- CREATE FUNCTION reports object_type 'function' with a real objid.
  -- GRANT reports object_type 'FUNCTION' with objid NULL (Postgres gives no
  -- objid for a GRANT), which is what triggers the bounded DB-wide re-sweep.
  select coalesce(array_agg(c.objid) filter (
             where c.objid is not null and c.objid <> 0 and lower(c.object_type) = 'function'),
           '{}'::oid[]),
         coalesce(bool_or(upper(c.object_type) = 'FUNCTION'
                          and (c.objid is null or c.objid = 0)), false)
    into v_objids, v_grant
    from pg_event_trigger_ddl_commands() c;

  perform platform.enforce_definer_client_grants_impl(v_objids, v_grant, tg_tag);
exception
  -- 🚨 DD-223: a DELIBERATE REFUSAL (errcode 42501, raised by the impl outside its
  -- own fail-open handler) is a decision and travels. A guard that swallowed its
  -- own refusal would be a rule nobody obeys.
  when insufficient_privilege then
    raise;
  when others then
    raise warning 'ddl_guard[definer_client_grant_revoked]: THE §6d-4 GUARD DID NOT RUN (%) — an undeclared client EXECUTE grant may have survived this statement. The guard needs repair.', sqlerrm;
end;
$function$;

-- ─── 6. The anon birth guard matches the same way ───────────────────────────
-- Same class, same table, same rendered-string lookup: `close_new_functions_to_anon_impl`
-- asked whether a new function's door row carries `anonymous_callers`, and asked it
-- with `c.identity_args = fn.ia`. A declared anonymous door written from a session
-- with a different search_path would have lost its anon grant at birth for exactly
-- the reason above. One line, the same fix — fix the class, not the instance.
-- based-on: platform.close_new_functions_to_anon_impl(oid[], text) 713269fc6cfb305a629cfa47d4e97428ca89a7dc13160c6f5b83d01c1e941f5e
create or replace function platform.close_new_functions_to_anon_impl(p_objids oid[], p_tag text)
returns void
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $function$
declare
  r_oid oid;
  fn record;
  v_keep text[];
  v_role text;
  v_detail text;
begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
             p.proargtypes::text as argtypes,
             platform.door_argtypes(p.proargtypes) as argtype_oids,
             pg_get_function_identity_arguments(p.oid) as ia,
             p.oid::regprocedure::text as sig, p.oid as oid
        into fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = r_oid;
      if not found then continue; end if;
      -- SECURITY DEFINER belongs to the §6d-4 guard; two guards, one job each.
      if fn.prosecdef then continue; end if;
      if fn.prokind not in ('f','p') then continue; end if;
      -- A trigger / event-trigger function is never called by a client.
      if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
      if not (fn.sch = any (platform.anon_function_birth_schemas())) then continue; end if;
      if exists (select 1 from pg_depend d where d.objid = r_oid and d.deptype = 'e') then continue; end if;
      -- 🚨 DD-212: a DECLARED anonymous door keeps its grant, and it is DECLARED
      -- by the flag. Until 2026-09-14 this read `reason ~* '(anonymous|signed[- ]out|
      -- guest|kiosk|outsider)'`, so a row saying "SIGNED-IN door … No anonymous
      -- caller exists" opened the birth door — proven live, in this file's header.
      -- 🚨 DD-223: and the row is found by the catalog's identity, never by the
      -- rendered signature, which depends on the reader's search_path.
      if exists (select 1 from platform.client_callable_door c
                  where c.schema_name = fn.sch and c.function_name = fn.nm
                    and c.identity_argtypes = fn.argtype_oids
                    and c.anonymous_callers) then continue; end if;
      -- The population that was already open when this guard shipped (DD-202 §3).
      if exists (select 1 from platform.anon_function_birth_grandfather g
                  where g.schema_name = fn.sch and g.function_name = fn.nm
                    and g.argtypes = fn.argtypes) then continue; end if;
      -- Nothing to take back.
      if not (has_function_privilege('anon', fn.oid, 'EXECUTE')
              or has_function_privilege('public', fn.oid, 'EXECUTE')) then continue; end if;

      -- Remember every SIGNED-IN role that can execute it RIGHT NOW, so the revoke
      -- below costs exactly one role its reach: anon.
      select coalesce(array_agg(r.rolname), '{}'::text[])
        into v_keep
        from pg_roles r
       where r.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
         and has_function_privilege(r.rolname, fn.oid, 'EXECUTE');

      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      foreach v_role in array v_keep
      loop
        execute format('grant execute on function %s to %I', fn.sig, v_role);
      end loop;

      -- The announcement, in its OWN subtransaction placed AFTER the revoke, so a
      -- failure to speak can never roll the revoke back (§6d-4's rule).
      begin
        v_detail := platform.anon_function_birth_notice(fn.sch, fn.nm, fn.ia, fn.sig);
        raise notice 'ddl_guard[anon_function_execute_closed_at_birth]: %', v_detail;
      exception when others then
        raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
      end;
    exception when others then
      raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: could not close one function (%) — a new function may be executable by a signed-out caller. The guard needs repair.', sqlerrm;
    end;
  end loop;
exception when others then
  raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: THE DD-202 GUARD FAILED (%) — a new function may be executable by a signed-out caller. The guard needs repair.', sqlerrm;
end;
$function$;

-- ─── 7. The forcing proofs, in this file, on the sanctioned path ────────────
-- Each one is planted and torn down inside this transaction, and the apply FAILS
-- if any of them does not behave. A guard nobody has seen fire is not a guard.
do $$
declare
  v_before text;
  v_guard_matches int;
  v_default_matches int;
  v_refused boolean;
  v_msg text;
begin
  -- (a) A RE-SPELLING OF `identity_args` NO LONGER MOVES ANYTHING. Rewrite
  --     web.create_site's display string to the other rendering and prove the
  --     catalog lookup is untouched from both search_paths.
  select identity_args into v_before from platform.client_callable_door
   where schema_name = 'web' and function_name = 'create_site';

  update platform.client_callable_door
     set identity_args = 'p_deliberately re-spelled, DD-223 proof (a)'
   where schema_name = 'web' and function_name = 'create_site';

  select count(*) into v_guard_matches
    from platform.client_callable_door c
    join pg_proc p on p.proname = c.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = c.schema_name
   where c.schema_name = 'web' and c.function_name = 'create_site'
     and c.identity_argtypes = platform.door_argtypes(p.proargtypes);
  if v_guard_matches <> 1 then
    raise exception 'DD-223 proof (a) FAILED: a re-spelling of identity_args changed the catalog lookup (% matches, expected 1).', v_guard_matches;
  end if;

  set local search_path to 'public', 'extensions';
  select count(*) into v_default_matches
    from platform.client_callable_door c
    join pg_catalog.pg_proc p on p.proname = c.function_name
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = c.schema_name
   where c.schema_name = 'web' and c.function_name = 'create_site'
     and c.identity_argtypes = platform.door_argtypes(p.proargtypes);
  set local search_path to 'platform', 'public', 'pg_catalog';
  if v_default_matches <> 1 then
    raise exception 'DD-223 proof (a) FAILED: web.create_site resolves under the guard search_path but not under the default one (% matches, expected 1).', v_default_matches;
  end if;

  update platform.client_callable_door set identity_args = v_before
   where schema_name = 'web' and function_name = 'create_site';
  raise notice 'DD-223 proof (a) GREEN: a re-spelled identity_args changes no match, and web.create_site resolves 1:1 under both search_paths.';

  -- (b) A ROW WHOSE identity_argtypes NAME NOTHING IS REFUSED, IN A SENTENCE.
  v_refused := false;
  begin
    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
    values ('web','create_site','(DD-223 proof b)', array[2950,2950]::oid[],
            'DD-223 proof (b): a door row whose catalog identity names no live function must be refused.', 'DD-223 proof');
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;
  if not v_refused then
    raise exception 'DD-223 proof (b) FAILED: a door row naming no live function was accepted.';
  end if;
  raise notice 'DD-223 proof (b) GREEN: %', left(v_msg, 160);

  -- (c) THE SAME DOOR CANNOT BE REGISTERED TWICE UNDER TWO SPELLINGS.
  v_refused := false;
  begin
    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, reason, declared_by)
    select 'web','create_site',
           regexp_replace(c.identity_args, '\m[a-z_][a-z0-9_]*\.', '', 'g') || ' ',
           'DD-223 proof (c): the second spelling of a door already declared must be refused.', 'DD-223 proof'
      from platform.client_callable_door c
     where c.schema_name = 'web' and c.function_name = 'create_site';
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;
  if not v_refused then
    raise exception 'DD-223 proof (c) FAILED: the same door was registered twice under two spellings.';
  end if;
  raise notice 'DD-223 proof (c) GREEN: %', left(v_msg, 160);
end $$;

do $$
declare
  v_refused boolean := false;
  v_msg text;
  v_still_granted boolean;
begin
  -- (d) A CLIENT GRANT ON A DOOR THAT DECLARES NO CLIENT LANE IS REFUSED AT
  --     GRANT TIME. Planted on a probe function, in this transaction, and torn
  --     down below — with the teardown asserted, so no probe can survive.
  execute 'create schema dd223_proof';
  execute 'create function dd223_proof.probe(p_id uuid) returns text language sql security definer as $p$ select ''x''::text $p$';
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, reason, declared_by,
     signed_in_callers, anonymous_callers, non_client_lane)
  select 'dd223_proof','probe', pg_get_function_identity_arguments(p.oid),
         'DD-223 proof (d): a register row for a function no client of any kind may open.',
         'DD-223 proof', false, false,
         'the service-key lane only: a server process holding the service role calls this, never a browser session.'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'dd223_proof' and p.proname = 'probe';

  begin
    execute 'grant execute on function dd223_proof.probe(uuid) to authenticated';
  exception when others then
    v_refused := true; v_msg := sqlerrm;
  end;

  select has_function_privilege('authenticated','dd223_proof.probe(uuid)'::regprocedure,'EXECUTE')
    into v_still_granted;
  if not v_refused then
    raise exception 'DD-223 proof (d) FAILED: GRANT EXECUTE … TO authenticated on a both-flags-false door was not refused (authenticated executes = %).', v_still_granted;
  end if;
  if v_still_granted then
    raise exception 'DD-223 proof (d) FAILED: the GRANT was refused but the privilege survived.';
  end if;
  raise notice 'DD-223 proof (d) GREEN: %', left(v_msg, 200);

  delete from platform.client_callable_door where schema_name = 'dd223_proof';
  execute 'drop schema dd223_proof cascade';
  if exists (select 1 from pg_namespace where nspname = 'dd223_proof')
     or exists (select 1 from platform.client_callable_door where schema_name = 'dd223_proof') then
    raise exception 'DD-223 proof (d) FAILED: the probe survived its own teardown.';
  end if;
  -- The guard's own log rows about the probe are ACKNOWLEDGED, never deleted: the
  -- guard did speak, about an object that no longer exists, and a deleted record
  -- of a guard firing is indistinguishable from a guard that never fired.
  update platform.ddl_guard_log
     set acknowledged_at = now(),
         ack_reason = 'DD-223 proof (d): written by the guard about a probe function this migration created, used to prove the grant-time refusal fires, and dropped inside the same transaction. The object does not exist.',
         acknowledged_by = 'DD-223 (B-118)'
   where object_ref like 'dd223_proof.probe%' and acknowledged_at is null;
  raise notice 'DD-223 proofs (a)-(d) each went RED then GREEN; 0 probes survive.';
end $$;

-- ─── 8. The end state this file asserts before it is allowed to commit ──────
do $$
declare
  v_null int; v_unresolved int; v_dupe int; v_standing int;
begin
  select count(*) into v_null from platform.client_callable_door where identity_argtypes is null;
  select count(*) into v_unresolved
    from platform.client_callable_door c
   where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = c.schema_name and p.proname = c.function_name
             and platform.door_argtypes(p.proargtypes) = c.identity_argtypes) <> 1;
  select count(*) into v_dupe from (
    select 1 from platform.client_callable_door
     group by schema_name, function_name, identity_argtypes having count(*) > 1) d;
  if v_null <> 0 or v_unresolved <> 0 or v_dupe <> 0 then
    raise exception 'DD-223 end state FAILED: % row(s) with no catalog identity, % that resolve to other than exactly one live function, % duplicate doors.',
      v_null, v_unresolved, v_dupe;
  end if;
  if not has_function_privilege('authenticated', 'web.create_site(uuid, text, text, text, jsonb, jsonb, platform.visibility, uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'DD-223 end state FAILED: web.create_site lost its authenticated EXECUTE inside this file.';
  end if;
  -- 🚨 The refusal in §5 runs DB-WIDE on every GRANT. If any live function were
  -- already in the state it refuses, the next GRANT anywhere would be refused and
  -- the platform would stop taking migrations. Measured 0 before this file was
  -- written; asserted here so it can never ship non-zero.
  select count(*) into v_standing
    from platform.client_callable_door c
    join pg_proc p on p.proname = c.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = c.schema_name
   where platform.door_argtypes(p.proargtypes) = c.identity_argtypes
     and not c.signed_in_callers and not c.anonymous_callers
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_standing <> 0 then
    raise exception 'DD-223 end state FAILED: % live door row(s) already declare no client lane while authenticated holds EXECUTE. Shipping the grant-time refusal in that state would refuse every later GRANT on this database. Resolve them first.', v_standing;
  end if;
  raise notice 'DD-223: % door rows, every one keyed on the catalog, 0 unresolved, 0 duplicates, web.create_site still open to a signed-in caller.',
    (select count(*) from platform.client_callable_door);
end $$;
