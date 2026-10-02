-- draft: ONE-HOME DD-063 NOT YET APPLIED to production — clone-proven 2026-10-02; runs only in a 01:00-04:00 PT window after the manager's review of v6/RENAME-PLAN-ONE-HOME.md, in the same pass as the code edits it lists
-- chair-step: lane ONE-HOME wave 3, DD-063 — the retired-tables schema is renamed graveyard -> deprecated
-- (Data Doctrine §1.1, §1.8, R16: one name, renamed completely in one pass).
-- What moves, in one transaction:
--   1. ALTER SCHEMA graveyard RENAME TO deprecated. Tables, sequences, triggers, policies, grants, column
--      defaults (regclass) and publications follow by OID; nothing is copied or rewritten.
--   2. The two functions whose NAME carries the word are renamed (_graveyard_takes_no_writes,
--      _graveyard_outbound_fk_guard); triggers and event triggers point at them by OID.
--   3. Every function body that says graveyard is re-created with the word replaced (graveyard / Graveyard /
--      GRAVEYARD -> deprecated / Deprecated / DEPRECATED). Bodies are text; they do NOT follow the rename.
--   4. Registry rows that name the schema as text follow (entity_types, schemas, provision_generate_target,
--      excluded_schema, deprecated_relations refs). Logs and audit history are left as written.
--   5. PostgREST's schema list drops graveyard (no client grant exists there — DD-136c) and reloads.
-- Live readers: none by design (anon/authenticated hold no privilege on the schema; writes refused by trigger).
-- Locks: namespace object lock for the rename; pg_proc row locks for bodies; row locks on ~25 registry rows.
--   No relation takes ACCESS EXCLUSIVE. lock_timeout 3s; on a timeout the whole file rolls back — retry.
-- Idempotent: a second run finds no graveyard schema, no body naming it, and no row naming it.
set local lock_timeout = '3s';
set local statement_timeout = '300s';

do $$
begin
  if to_regnamespace('graveyard') is not null and to_regnamespace('deprecated') is not null then
    raise exception 'DD-063: both graveyard and deprecated exist — a half-applied state; stop and inspect';
  end if;
  if to_regnamespace('graveyard') is not null then
    execute 'alter schema graveyard rename to deprecated';
    raise notice 'DD-063: schema graveyard renamed to deprecated';
  else
    raise notice 'DD-063: schema already named deprecated';
  end if;
end $$;

-- 2. function names that carry the word
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, n.nspname, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname ~* 'graveyard'
       and n.nspname not in ('pg_catalog', 'information_schema')
  loop
    execute format('alter function %s rename to %I', r.sig, regexp_replace(r.proname, 'graveyard', 'deprecated', 'gi'));
    raise notice 'DD-063: function %.% renamed', r.nspname, r.proname;
  end loop;
end $$;

-- Body-rewrite helper (session-temporary; gone at disconnect). Re-creates one function from its live
-- definition with a text replacement. A SECURITY DEFINER, non-trigger function with no access decision on
-- record gets one in the same transaction (provision_shape_guard), and ONLY when its live ACL already
-- reaches no client role — the declaration then states today's truth, it changes no access. A definer
-- function a client can call with no door on record stops the file: that is an access decision, not a rename.
-- A body a DDL guard refuses to re-create (a law written after the function was born) is left as it is and
-- listed in pg_temp.onehome_blocked + a WARNING; the contract step refuses while any such body remains.
create temp table if not exists onehome_blocked (fn oid, lane text, why text) on commit drop;
create or replace function pg_temp.onehome_rewrite(p_oid oid, p_new text, p_lane text)
returns boolean language plpgsql as $fn$
declare
  v_def text := pg_get_functiondef(p_oid);
  r record;
begin
  if p_new is not distinct from v_def then return false; end if;
  select p.oid, n.nspname, p.proname, p.prosecdef, p.prorettype, p.proacl,
         pg_get_function_identity_arguments(p.oid) as ident,
         array(select t::oid from unnest(p.proargtypes) t)::oid[] as argtypes
    into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = p_oid;
  begin
    if r.prosecdef and r.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = r.nspname and d.function_name = r.proname and d.identity_args = r.ident) then
      if r.proacl is null
         or exists (select 1 from aclexplode(r.proacl) a
                     where a.privilege_type = 'EXECUTE'
                       and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))) then
        raise exception '%: %.%(%) is SECURITY DEFINER, reachable by a client role, and has no access decision on record — declaring one is an access decision, not part of a rename', p_lane, r.nspname, r.proname, r.ident
          using errcode = 'P0001';
      end if;
      insert into platform.client_callable_door
        (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
      values (r.nspname, r.proname, r.ident, r.argtypes,
              'Declared by the ' || p_lane || ' rename while its body was re-created; the declaration records the live grants (postgres/service_role only) and changes no access.',
              'onehome rename manifest ' || p_lane,
              'server_only: its live EXECUTE grant reaches only postgres and service_role, so no browser, extension or desktop client can call it; recorded during the ' || p_lane || ' rename.',
              false, false);
      raise notice '%: declared %.%(%) server_only (its live grants already were)', p_lane, r.nspname, r.proname, r.ident;
    end if;
    execute p_new;
  exception when check_violation then
    -- A DDL guard (event trigger) refuses to re-create a body that breaks a law written after it was born
    -- (e.g. the ddl_guard on organization-assigning trigger functions). Fixing that defect is that law's
    -- owner's work, not this rename's: record it, keep the old body, carry on.
    insert into pg_temp.onehome_blocked values (p_oid, p_lane, sqlerrm);
    raise warning '%: %.%(%) NOT rewritten — a DDL guard refuses its re-creation: %', p_lane, r.nspname, r.proname, r.ident, sqlerrm;
    return false;
  end;
  return true;
end
$fn$;

-- 3. function bodies
do $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_'
       and p.prokind in ('f', 'p')
       and p.prosrc ~* 'graveyard'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    if pg_temp.onehome_rewrite(r.oid,
         replace(replace(replace(pg_get_functiondef(r.oid), 'graveyard', 'deprecated'), 'Graveyard', 'Deprecated'), 'GRAVEYARD', 'DEPRECATED'),
         'DD-063') then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'DD-063: % function bodies re-created without the retired word', v_n;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and p.prosrc ~* 'graveyard'
                and p.oid not in (select fn from pg_temp.onehome_blocked)) then
    raise exception 'DD-063: a function body still names graveyard after the rewrite (case the replace did not cover)';
  end if;
end $$;

-- 4. registry rows that name the schema as text
update platform.entity_types set schema_name = 'deprecated' where schema_name = 'graveyard';
update platform.schemas set schema_name = 'deprecated' where schema_name = 'graveyard'
  and not exists (select 1 from platform.schemas s2 where s2.schema_name = 'deprecated');
update platform.provision_generate_target set schema_name = 'deprecated' where schema_name = 'graveyard';
update meta.excluded_schema set schema_name = 'deprecated' where schema_name = 'graveyard'
  and not exists (select 1 from meta.excluded_schema s2 where s2.schema_name = 'deprecated');
update platform.deprecated_relations set new_ref = regexp_replace(new_ref, '^graveyard\.', 'deprecated.') where new_ref ~ '^graveyard\.';
update platform.deprecated_relations set old_ref = regexp_replace(old_ref, '^graveyard\.', 'deprecated.') where old_ref ~ '^graveyard\.';

-- comments that name the word (COMMENT ON, by object kind)
do $$
declare r record; v_txt text; v_n int := 0;
begin
  for r in select d.objoid, d.classoid, d.objsubid, d.description from pg_description d where d.description ~* 'graveyard'
  loop
    v_txt := replace(replace(replace(r.description, 'graveyard', 'deprecated'), 'Graveyard', 'Deprecated'), 'GRAVEYARD', 'DEPRECATED');
    if r.classoid = 'pg_proc'::regclass then
      execute format('comment on function %s is %L', r.objoid::regprocedure, v_txt);
    elsif r.classoid = 'pg_namespace'::regclass then
      execute format('comment on schema %I is %L', (select nspname from pg_namespace where oid = r.objoid), v_txt);
    elsif r.classoid = 'pg_class'::regclass and r.objsubid > 0 then
      execute format('comment on column %s.%I is %L', r.objoid::regclass, (select attname from pg_attribute where attrelid = r.objoid and attnum = r.objsubid), v_txt);
    elsif r.classoid = 'pg_class'::regclass then
      execute format('comment on %s %s is %L',
        case (select relkind from pg_class where oid = r.objoid) when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' else 'table' end,
        r.objoid::regclass, v_txt);
    else
      raise warning 'DD-063: a % comment names the word and is left for the code pass: %', r.classoid::regclass, pg_describe_object(r.classoid, r.objoid, r.objsubid);
      continue;
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'DD-063: % catalog comments rewritten', v_n;
end $$;

-- 5. PostgREST: graveyard leaves the exposed list (it never had a client grant); deprecated is not exposed either.
do $$
declare v_cur text; v_new text;
begin
  select substring(c from '^pgrst\.db_schemas=(.*)$') into v_cur
    from pg_roles, unnest(rolconfig) c where rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is null then raise notice 'DD-063: authenticator carries no pgrst.db_schemas — nothing to change'; return; end if;
  select string_agg(s, ',' order by o) into v_new
    from (select trim(s) s, o from unnest(string_to_array(v_cur, ',')) with ordinality u(s, o)) x
   where s <> 'graveyard';
  if v_new is distinct from v_cur then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_new);
    raise notice 'DD-063: pgrst.db_schemas no longer lists graveyard';
  end if;
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
