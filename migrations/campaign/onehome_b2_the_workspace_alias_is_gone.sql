-- chair-step: lane ONE-HOME wave 3, DD-067 CONTRACT — the temporary `workspace` alias schema (security_invoker views
-- created by onehome_b) is dropped and PostgREST stops exposing it. After this, the retired word names no schema.
-- Preconditions, each checked here and refused by name:
--   · schema projects exists and schema workspace holds ONLY views (nothing else was ever put in the alias);
--   · no function body or search_path still names workspace.<member> (the bodies a DDL guard refused to re-create
--     in onehome_b must have been fixed by their owners first — they read through the alias today);
--   · no view outside the alias reads it.
-- Locks: DROP VIEW takes ACCESS EXCLUSIVE on each alias view only (never on a projects table); a reader still on
--   an alias queues the drop behind it, so lock_timeout 3s and retry. Idempotent: no alias schema -> nothing to do.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$
declare
  v_members text;
  v_offenders text;
begin
  if to_regnamespace('workspace') is null then
    raise notice 'DD-067 contract: no workspace alias left — nothing to do';
    return;
  end if;
  if to_regnamespace('projects') is null then
    raise exception 'DD-067 contract: schema projects does not exist — onehome_b has not run';
  end if;
  if exists (select 1 from pg_class c where c.relnamespace = 'workspace'::regnamespace and c.relkind <> 'v')
     or exists (select 1 from pg_proc p where p.pronamespace = 'workspace'::regnamespace)
     or exists (select 1 from pg_type t where t.typnamespace = 'workspace'::regnamespace and t.typrelid = 0
                and not exists (select 1 from pg_type e where e.oid = t.typelem and e.typrelid <> 0)) then
    raise exception 'DD-067 contract: schema workspace holds something other than the alias views — stop and inspect';
  end if;
  select string_agg(c.relname, '|') into v_members from pg_class c where c.relnamespace = 'projects'::regnamespace;
  select string_agg(p.oid::regprocedure::text, ', ') into v_offenders
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
     and (p.prosrc ~* ('(\mworkspace|"workspace")\.("?)(' || v_members || ')\M') or p.proconfig::text ~ '\mworkspace\M');
  if v_offenders is not null then
    raise exception 'DD-067 contract: these bodies still read through the workspace alias: %', v_offenders
      using hint = 'Re-create each naming projects (its owner fixes whatever DDL guard refused it in onehome_b), then run this again.';
  end if;
  select string_agg(distinct d.refobjid::regclass::text || ' <- ' || v.oid::regclass::text, ', ') into v_offenders
    from pg_depend d join pg_rewrite rw on rw.oid = d.objid join pg_class v on v.oid = rw.ev_class
   where d.classid = 'pg_rewrite'::regclass
     and d.refobjid in (select oid from pg_class where relnamespace = 'workspace'::regnamespace)
     and v.relnamespace <> 'workspace'::regnamespace;
  if v_offenders is not null then
    raise exception 'DD-067 contract: views outside the alias read it: %', v_offenders;
  end if;
  execute 'drop schema workspace cascade';
  raise notice 'DD-067 contract: the workspace alias schema is dropped';
end $$;

do $$
declare v_cur text; v_new text;
begin
  select substring(c from '^pgrst\.db_schemas=(.*)$') into v_cur
    from pg_roles, unnest(rolconfig) c where rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is null then return; end if;
  select string_agg(s, ',' order by o) into v_new
    from (select trim(s) s, o from unnest(string_to_array(v_cur, ',')) with ordinality u(s, o)) x
   where s <> 'workspace';
  if v_new is distinct from v_cur then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_new);
    raise notice 'DD-067 contract: pgrst.db_schemas no longer lists workspace';
  end if;
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
