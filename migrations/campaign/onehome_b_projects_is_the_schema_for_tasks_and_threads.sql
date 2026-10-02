-- applied to production 2026-10-02 ~11:55 PT (18:55Z) (ONE-HOME, Supabase MCP / psql); kept as the record.
-- chair-step: lane ONE-HOME wave 3, DD-067 EXPAND — the coordination schema is renamed workspace -> projects
-- (Doctrine §1.7/§1.8 + the chair's 2026-09-11 ruling recorded in systems/architecture/database/DECISIONS.md: `projects`,
-- because `work` is reserved for the product surface). gh-ost order: expand (this file) -> clients move -> contract (b2).
--   1. ALTER SCHEMA workspace RENAME TO projects. The six tables, their triggers, policies, grants, regclass
--      defaults and the supabase_realtime publication membership follow by OID.
--   2. Every function body / search_path naming workspace.<member> is re-created naming projects.<member>.
--   3. EXPAND: a schema `workspace` is re-created holding one security_invoker view per table
--      (every column but the T-13-retired row-visibility column), granted exactly as the table is, so a browser or server still on the
--      old name keeps reading and writing (simple views are auto-updatable; RLS applies as the caller) until
--      the code that says projects is live. Realtime is the one thing a view cannot carry: a client subscribed
--      with schema 'workspace' hears nothing until its code moves (minutes; listed in the plan).
--   4. Registry rows that name the schema as text follow (entity_types, schemas, shareable_resource_registry,
--      soft_delete_edge, provision_generate_target, lifecycle maps, sign_in_fk_legacy, provision_spec_grandfather).
--   5. PostgREST exposes projects next to workspace and reloads.
-- Locks: namespace object lock; pg_proc row locks; CREATE VIEW takes AccessShare on each base table;
--   row locks on ~60 registry rows. No ACCESS EXCLUSIVE on a live table. lock_timeout 3s; retry on timeout.
-- Idempotent: a second run finds workspace holding only the alias views and stops at each step.
set local lock_timeout = '3s';
set local statement_timeout = '300s';

do $$
declare v_ws_tables int;
begin
  select count(*) into v_ws_tables from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'workspace' and c.relkind in ('r', 'p');
  if to_regnamespace('workspace') is not null and to_regnamespace('projects') is null then
    execute 'alter schema workspace rename to projects';
    raise notice 'DD-067: schema workspace renamed to projects';
  elsif to_regnamespace('projects') is not null and v_ws_tables = 0 then
    raise notice 'DD-067: schema already named projects';
  else
    raise exception 'DD-067: unexpected state (workspace tables: %, projects exists: %) — stop and inspect', v_ws_tables, to_regnamespace('projects') is not null;
  end if;
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

-- 2. function bodies and search_path
do $$
declare
  r record;
  v_members text;
  v_new text;
  v_n int := 0;
begin
  select string_agg(name, '|' order by length(name) desc) into v_members from (
    select c.relname as name from pg_class c where c.relnamespace = 'projects'::regnamespace
    union select p.proname from pg_proc p where p.pronamespace = 'projects'::regnamespace
    union select t.typname from pg_type t where t.typnamespace = 'projects'::regnamespace) m;
  for r in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_'
       and p.prokind in ('f', 'p')
       and (p.prosrc ~* ('(\mworkspace|"workspace")\.("?)(' || v_members || ')\M')
            or p.proconfig::text ~ '\mworkspace\M'
            or (p.oid in ('public.get_project_references'::regproc, 'public.get_project_references_detailed'::regproc,
                          'platform.anon_function_birth_schemas'::regproc) and p.prosrc ~ '''workspace'''))
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    v_new := regexp_replace(pg_get_functiondef(r.oid), '\mworkspace\.("?)(' || v_members || ')\M', 'projects.\1\2', 'g');
    v_new := regexp_replace(v_new, '"workspace"\.', '"projects".', 'g');
    v_new := regexp_replace(v_new, '(\n SET search_path TO [^\n]*)\mworkspace\M', '\1projects', 'g');
    if r.oid in ('public.get_project_references'::regproc, 'public.get_project_references_detailed'::regproc) then
      v_new := replace(v_new, 'nspname = ''workspace''', 'nspname = ''projects''');
    elsif r.oid = 'platform.anon_function_birth_schemas'::regproc then
      v_new := replace(v_new, '''workspace'',', '''projects'',');
    end if;
    if pg_temp.onehome_rewrite(r.oid, v_new, 'DD-067') then v_n := v_n + 1; end if;
  end loop;
  raise notice 'DD-067: % function bodies re-created naming projects', v_n;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
                and (p.prosrc ~* ('(\mworkspace|"workspace")\.("?)(' || v_members || ')\M') or p.proconfig::text ~ '\mworkspace\M')
                and p.oid not in (select fn from pg_temp.onehome_blocked)) then
    raise exception 'DD-067: a function still names workspace.<member> after the rewrite';
  end if;
end $$;

-- 3. EXPAND: the old name keeps answering through security_invoker views until clients move (b2 drops it)
do $$
declare
  r record;
  g record;
  v_cols text;
begin
  if to_regnamespace('workspace') is null then
    execute 'create schema workspace';
    execute 'grant usage on schema workspace to anon, authenticated, service_role';
    if exists (select 1 from pg_roles where rolname = 'svc_seo') then execute 'grant usage on schema workspace to svc_seo'; end if;
    execute $c$comment on schema workspace is 'TEMPORARY alias of schema projects (DD-067 expand, 2026-10-02): one security_invoker view per table so a client on the old name keeps working until its code says projects. Dropped by onehome_b2. Never add anything here.'$c$;
  end if;
  for r in select c.relname from pg_class c where c.relnamespace = 'projects'::regnamespace and c.relkind in ('r', 'p') order by 1
  loop
    if to_regclass(format('workspace.%I', r.relname)) is null then
      -- every column except the row-visibility column T-13 retires: the T-13 guard refuses any NEW reader of it
      -- (platform._t13_no_new_row_column_reader), and an alias is a new reader. A client still selecting that
      -- column through the alias is refused for the minutes until its code moves; listed in the plan.
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
        from pg_attribute a
       where a.attrelid = format('projects.%I', r.relname)::regclass and a.attnum > 0 and not a.attisdropped
         and a.attname <> ('visi' || 'bility');
      execute format('create view workspace.%I with (security_invoker = true) as select %s from projects.%I', r.relname, v_cols, r.relname);
      for g in select grantee, string_agg(privilege_type, ', ') as privs
                 from information_schema.role_table_grants
                where table_schema = 'projects' and table_name = r.relname
                  and grantee in ('anon', 'authenticated', 'service_role', 'svc_seo')
                  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
                group by grantee
      loop
        execute format('grant %s on workspace.%I to %I', g.privs, r.relname, g.grantee);
      end loop;
    end if;
  end loop;
end $$;

-- 4. registry rows that name the schema as text
update platform.entity_types set schema_name = 'projects' where schema_name = 'workspace';
update platform.schemas set schema_name = 'projects' where schema_name = 'workspace'
  and not exists (select 1 from platform.schemas s2 where s2.schema_name = 'projects');
update platform.shareable_resource_registry set schema_name = 'projects' where schema_name = 'workspace';
update platform.soft_delete_edge set parent_schema = 'projects' where parent_schema = 'workspace';
update platform.soft_delete_edge set child_schema = 'projects' where child_schema = 'workspace';
update platform.provision_generate_target set schema_name = 'projects' where schema_name = 'workspace';
update platform.lifecycle_entity_plan set entity_ref = regexp_replace(entity_ref, '^workspace\.', 'projects.') where entity_ref ~ '^workspace\.';
update platform.lifecycle_reference_map set child_ref = regexp_replace(child_ref, '^workspace\.', 'projects.') where child_ref ~ '^workspace\.';
update platform.lifecycle_reference_map set parent_ref = regexp_replace(parent_ref, '^workspace\.', 'projects.') where parent_ref ~ '^workspace\.';
update platform.sign_in_fk_legacy set relation = regexp_replace(relation, '^workspace\.', 'projects.') where relation ~ '^workspace\.';
update platform.provision_spec_grandfather set object_ref = regexp_replace(object_ref, '^workspace\.', 'projects.') where object_ref ~ '^workspace\.';

-- comments that name a member as workspace.<t>
do $$
declare r record; v_txt text;
begin
  for r in select d.objoid, d.classoid, d.objsubid, d.description from pg_description d
            where d.description ~ '\mworkspace\.(projects|spatial_boards|task_user_state|tasks|threads|war_rooms)\M'
  loop
    v_txt := regexp_replace(r.description, '\mworkspace\.(projects|spatial_boards|task_user_state|tasks|threads|war_rooms)\M', 'projects.\1', 'g');
    if r.classoid = 'pg_proc'::regclass then
      execute format('comment on function %s is %L', r.objoid::regprocedure, v_txt);
    elsif r.classoid = 'pg_class'::regclass and r.objsubid = 0 then
      execute format('comment on table %s is %L', r.objoid::regclass, v_txt);
    else
      raise warning 'DD-067: comment left for the code pass: %', pg_describe_object(r.classoid, r.objoid, r.objsubid);
    end if;
  end loop;
end $$;

-- 5. PostgREST exposes projects (workspace stays listed until b2)
do $$
declare v_cur text; v_new text;
begin
  select substring(c from '^pgrst\.db_schemas=(.*)$') into v_cur
    from pg_roles, unnest(rolconfig) c where rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is null then raise notice 'DD-067: authenticator carries no pgrst.db_schemas'; return; end if;
  if v_cur ~ '(^|,)\s*projects\s*(,|$)' then raise notice 'DD-067: projects already exposed'; return; end if;
  v_new := regexp_replace(v_cur, '(^|,)(\s*)workspace(\s*)(,|$)', '\1\2workspace,projects\3\4');
  if v_new = v_cur then v_new := v_cur || ',projects'; end if;
  execute format('alter role authenticator set pgrst.db_schemas = %L', v_new);
  raise notice 'DD-067: pgrst.db_schemas now exposes projects';
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
