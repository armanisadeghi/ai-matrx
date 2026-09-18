-- DD-202 — A NEW FUNCTION IS CLOSED TO `anon` AT BIRTH.
-- (B-94, Data Doctrine adoption program, 2026-09-13. SECURITY.
--  Residue of DD-196/DD-197, reported by B-89 and re-measured here.)
--
-- THE DEFECT
-- ----------
-- PostgreSQL gives EVERY new function `EXECUTE` to PUBLIC, and PUBLIC reaches
-- every role there is — including `anon`. So a function created in a
-- PostgREST-exposed schema is callable by a signed-out visitor over
-- `/rest/v1/rpc/<name>` FROM THE MOMENT IT EXISTS, before any grant, any policy
-- and any door row. DD-197 closed 66 such functions after the fact; D9
-- (`pnpm check:impl-doors`) catches the next one after the fact too. This file
-- closes the door instead of reporting it open.
--
-- MEASURED, ROLLED BACK, ON brsgrqvjdzwihsvnfqkf 2026-09-13 — AND THE BRIEFED
-- PRIMARY FIX DOES NOT WORK
-- --------------------------------------------------------------------------
-- The obvious instrument is `ALTER DEFAULT PRIVILEGES`, the one that closed a
-- new TABLE at birth in DD-196. It cannot close a function. Three probes in
-- `public`, in one rolled-back transaction, each created immediately after the
-- statement above it:
--
--   step  statement just executed                                      new function's proacl                                   anon
--   s0    (none)                                                       =X/postgres|postgres=X|anon=X|authenticated=X|service_role=X  t
--   s1    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--           REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC                     unchanged — `=X/postgres` still there                   t
--   s2    ... REVOKE EXECUTE ON FUNCTIONS FROM anon                     `anon=X` gone, `=X/postgres` still there                t
--
-- The `=X/postgres` item is PUBLIC's EXECUTE, and it does not come from a
-- default ACL at all — it is PostgreSQL's HARD-WIRED default for functions
-- (`acldefault`), which a schema-scoped `ALTER DEFAULT PRIVILEGES` merges on top
-- of and therefore cannot remove. Revoking from `anon` removes only the explicit
-- `anon=X` item that Supabase's own default privileges put there; `anon` still
-- executes, through PUBLIC. B-89 reported exactly this and it is re-proven here
-- with the correctly-scoped `FOR ROLE … IN SCHEMA …` form.
--
-- The ONE form that does remove PUBLIC is the GLOBAL, all-schemas one
-- (`ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM
-- PUBLIC`, no `IN SCHEMA`): a probe in `agent` then came out `postgres=X/postgres`
-- with anon FALSE. IT IS NOT SHIPPED, and the measurement says why in one line:
-- the same probe showed `authenticated` and `service_role` FALSE too. That form
-- is DB-wide, every schema, every team, vendor schemas included, and in the ~50
-- schemas that carry no schema-level default ACL it would silently strip
-- SIGNED-IN execute from every function created from then on. The failure would
-- appear at call time, not at create time, in somebody else's feature. A blunt
-- instrument that narrows signed-in access to close an anonymous one is not the
-- fix; the brief's own rule — do not widen or narrow signed-in EXECUTE here —
-- rules it out.
--
-- SO THE EVENT TRIGGER IS THE PRIMARY FIX, NOT THE BELT.
--
-- WHAT THIS FILE INSTALLS
-- -----------------------
-- 1. `close_new_functions_to_anon` — a `ddl_command_end` event trigger on
--    CREATE FUNCTION / CREATE PROCEDURE. For each new SECURITY INVOKER function
--    in a PostgREST-exposed schema it REVOKEs EXECUTE from PUBLIC and from
--    `anon`, then re-GRANTs EXECUTE to every signed-in role that held it a
--    moment earlier (`authenticated`, `service_role`, `dashboard_user`,
--    `svc_seo`). Nothing but `anon` loses anything — that is the DD-197 pattern.
--    It ANNOUNCES every revoke with a NOTICE naming the remedy.
--
--    Per db-rules §6d-4 / DD-151 the event-trigger function is SECURITY INVOKER
--    — a SECURITY DEFINER one does not fire at all when `session_user =
--    authenticator`, i.e. on every `pnpm db:apply` — and it delegates the
--    privileged work to a SECURITY DEFINER `_impl` with no client EXECUTE.
--
--    SECURITY DEFINER functions are deliberately NOT touched: the §6d-4 guard
--    `enforce_definer_client_grants` already revokes public/anon/authenticated
--    from an undeclared definer at CREATE FUNCTION. The two guards partition the
--    space; doing both would make every new definer log a spurious
--    `definer_client_grant_revoked` row for a grant this trigger had just made.
--
-- 2. `platform.anon_function_birth_grandfather` — the population that already
--    existed. Measured 2026-09-13: 272 SECURITY INVOKER functions in exposed
--    schemas are `anon`-executable today and are not declared anonymous doors
--    (DD-169's residue on the invoker axis; DD-197 closed the WRITERS among
--    them, these are the rest). Without this snapshot the first peer to
--    `CREATE OR REPLACE` one of them would silently lose its `anon` grant — the
--    exact reason §6d-4 needed a grandfather. Measured and stated: NONE of them
--    is named in an RLS policy expression on an `anon`-readable relation (0
--    rows), so no signed-out READ depends on one. The table may only shrink: a
--    BEFORE INSERT trigger refuses a new row, so this cannot become the place a
--    future function hides.
--
-- 3. The `anon` EXECUTE DEFAULT PRIVILEGES in `public` and `files` are revoked
--    anyway. They do not close anything on their own (s2 above) — they are
--    removed so the DECLARED default stops promising a grant the guard takes
--    back one statement later, and so `pnpm check:db-guards` can assert that no
--    default privilege anywhere names `anon` on functions. `storage`,
--    `graphql`, `graphql_public` are vendor-managed and excluded by name, the
--    same boundary B-87/B-89 drew.
--
-- FAIL-OPEN, NEVER SILENT (§6d-4). This trigger fires on every team's CREATE
-- FUNCTION DB-wide, so it must never abort somebody else's DDL: every per-object
-- step is wrapped, and a failure raises a WARNING saying the guard is sick.
-- It writes NO `platform.ddl_guard_log` row: unlike the §6d-4 guard, which fires
-- only on the rare undeclared definer, this one fires on EVERY new function, and
-- a log with an acknowledgement contract would gain an unacked row per migration
-- and train its readers to ack unread.
--
-- §5 PROVES IT ON THIS PATH, IN THIS FILE: a probe function born in `public` and
-- one in `agent` must come out `anon` FALSE with `authenticated` TRUE, and a
-- probe declared as an anonymous door must keep `anon`. The file ROLLS BACK with
-- no ledger row if any of that is untrue.

-- ─── 1. The schema list the guard governs ───────────────────────────────────
-- The PostgREST-exposed schemas, minus `graphql_public` (vendor, owned by
-- supabase_admin). Kept as a function so `pnpm check:db-guards` can compare it
-- against POSTGREST_EXPOSED_SCHEMAS in lib/security/public-exposure.ts and fail
-- when the two drift.
create or replace function platform.anon_function_birth_schemas()
returns text[]
language sql
immutable
as $$
  select array[
    'api','public','rag','scraper','workflow','files','legal','knowledge','agent','ai','app','chat',
    'context','skill','tool','workspace','work','admin','billing','browser','canvas','code',
    'communication','content_ir','crm','dictionary','docproc','education','extend','graveyard','growth',
    'hindsight','history','iam','interview','marketing','meta','ops','pdf','plan','platform','podcast',
    'research','runtime','scheduler','seo','transcripts','ui','users','web','workbench','assignment',
    'audit','batch','mandate','commerce'
  ]::text[]
$$;
revoke execute on function platform.anon_function_birth_schemas() from public;
revoke execute on function platform.anon_function_birth_schemas() from anon;
revoke execute on function platform.anon_function_birth_schemas() from authenticated;

-- ─── 2. The announcement — ONE wording, so the NOTICE can never drift ────────
create or replace function platform.anon_function_birth_notice(
  p_schema text, p_name text, p_identity_args text, p_signature text)
returns text
language sql
immutable
as $$
  select format(
    'EXECUTE for PUBLIC and anon was REVOKED from %s at creation. PostgreSQL gives every new '
    'function EXECUTE to PUBLIC and PUBLIC reaches anon, so without this a signed-out visitor '
    'could call it over /rest/v1/rpc before any grant, policy or door row existed. Every '
    'signed-in role that could execute it a moment ago still can, explicitly — only anon lost '
    'anything. If a SIGNED-OUT caller is meant to reach it, declare the door in the SAME '
    'migration, BEFORE the grant: INSERT INTO platform.client_callable_door (schema_name, '
    'function_name, identity_args, reason) VALUES (%L, %L, %L, ''why an ANONYMOUS, signed-out '
    'caller may safely call this''); the reason must say the caller may have no account '
    '(anonymous / signed-out / guest / kiosk / outsider), then re-issue GRANT EXECUTE ON '
    'FUNCTION %s TO anon. If it is NOT meant to be reachable signed-out, nothing to do — this '
    'is the guard working. (DD-202; common-docs /systems/platform/db-rules/FEATURE.md §6d-4.)',
    p_signature, p_schema, p_name, p_identity_args, p_signature)
$$;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from public;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from anon;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from authenticated;

-- ─── 3. The pre-existing population — snapshot, and it may only SHRINK ───────
create table if not exists platform.anon_function_birth_grandfather (
  schema_name   text not null,
  function_name text not null,
  argtypes      text not null,
  reason        text not null,
  recorded_at   timestamptz not null default now(),
  primary key (schema_name, function_name, argtypes)
);
alter table platform.anon_function_birth_grandfather enable row level security;
revoke all on table platform.anon_function_birth_grandfather from public;
revoke all on table platform.anon_function_birth_grandfather from anon;
revoke all on table platform.anon_function_birth_grandfather from authenticated;

insert into platform.anon_function_birth_grandfather
      (schema_name, function_name, argtypes, reason)
select n.nspname, p.proname, p.proargtypes::text,
       'Pre-existing and anon-executable on 2026-09-13, when DD-202 closed the birth door. '
       'DD-169''s residue on the SECURITY INVOKER axis; DD-197 closed the writers among them. '
       'Exempt so a CREATE OR REPLACE cannot silently take a grant this file did not grant. '
       'Retiring these is its own campaign — this table may only shrink.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = any (platform.anon_function_birth_schemas())
   and not p.prosecdef
   and p.prokind in ('f','p')
   and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and has_function_privilege('anon', p.oid, 'execute')
on conflict do nothing;

create or replace function platform.anon_function_birth_grandfather_is_closed()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'platform.anon_function_birth_grandfather is CLOSED — it may only shrink.',
    detail  = format('Refused a new row for %I.%I(%s).', new.schema_name, new.function_name, new.argtypes),
    hint    = 'This table is the snapshot of functions that were already anon-executable when '
              'DD-202 shipped. A function created after that date is closed to anon at birth by '
              'design. If an anonymous caller must reach it, declare it in '
              'platform.client_callable_door with a reason that says the caller may have no '
              'account (anonymous / signed-out / guest / kiosk / outsider) and then GRANT EXECUTE '
              'TO anon — that is the one sanctioned way, and check:impl-doors D9 reads it.';
end;
$$;

drop trigger if exists anon_function_birth_grandfather_is_closed
  on platform.anon_function_birth_grandfather;
create trigger anon_function_birth_grandfather_is_closed
  before insert on platform.anon_function_birth_grandfather
  for each row execute function platform.anon_function_birth_grandfather_is_closed();

-- ─── 4. The guard itself — SECURITY DEFINER impl + SECURITY INVOKER wrapper ──
create or replace function platform.close_new_functions_to_anon_impl(p_objids oid[], p_tag text)
returns void
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $$
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
      -- A DECLARED anonymous door keeps its grant. The reason must say out loud that the
      -- caller may have no account — the same literal reading check:impl-doors D9 uses.
      if exists (select 1 from platform.client_callable_door c
                  where c.schema_name = fn.sch and c.function_name = fn.nm
                    and c.identity_args = fn.ia
                    and c.reason ~* '(anonymous|signed[- ]out|guest|kiosk|outsider)') then continue; end if;
      -- The population that was already open when this guard shipped (§3).
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
$$;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from public;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from anon;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from authenticated;

-- 🚨 SECURITY INVOKER, per db-rules §6d-4 / DD-151: a SECURITY DEFINER event-trigger
-- function does not fire at all when session_user = authenticator, which is every
-- PostgREST session. An INVOKER wrapper fires and hands the privileged work to the
-- DEFINER _impl above.
create or replace function platform.close_new_functions_to_anon()
returns event_trigger
language plpgsql
set search_path to 'platform', 'public', 'pg_catalog'
as $$
declare
  v_objids oid[];
begin
  select coalesce(array_agg(c.objid) filter (
             where c.objid is not null and c.objid <> 0 and lower(c.object_type) = 'function'),
           '{}'::oid[])
    into v_objids
    from pg_event_trigger_ddl_commands() c;

  perform platform.close_new_functions_to_anon_impl(v_objids, tg_tag);
exception when others then
  raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: THE DD-202 GUARD DID NOT RUN (%) — a new function may be executable by a signed-out caller. The guard needs repair.', sqlerrm;
end;
$$;
revoke execute on function platform.close_new_functions_to_anon() from public;
revoke execute on function platform.close_new_functions_to_anon() from anon;
revoke execute on function platform.close_new_functions_to_anon() from authenticated;

drop event trigger if exists close_new_functions_to_anon;
create event trigger close_new_functions_to_anon
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function platform.close_new_functions_to_anon();

-- ─── 5. The DECLARED default stops promising a grant the guard takes back ────
-- Proven above not to close anything on its own; it is removed so that "no
-- default privilege on this database grants anon EXECUTE on a function" becomes
-- a true sentence a gate can assert. Vendor schemas (storage, graphql,
-- graphql_public) are left alone by name.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema files  revoke execute on functions from anon;

do $$
declare v_left text;
begin
  select string_agg(format('%s (grantor %s)', coalesce(n.nspname,'<all schemas>'),
                           pg_get_userbyid(d.defaclrole)), ', ')
    into v_left
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
   where d.defaclobjtype = 'f'
     and coalesce(n.nspname,'') = any (platform.anon_function_birth_schemas())
     and exists (select 1 from unnest(d.defaclacl) a
                  where (a::text like 'anon=%' or a::text like '=%')
                    and a::text like '%X%');
  if v_left is not null then
    raise exception 'DD-202 incomplete: a FUNCTION default privilege still grants anon or PUBLIC EXECUTE in: %', v_left;
  end if;
end $$;

-- ─── 6. THE FORCING PROOF, on this path, in this file ───────────────────────
do $$
declare
  v_anon boolean; v_auth boolean; v_svc boolean;
begin
  -- (a) a plain new function in `public` — the RED this file closes
  execute 'create function public.b94_birth_probe() returns void language sql as $b$ select 1 $b$';
  select has_function_privilege('anon','public.b94_birth_probe()','execute'),
         has_function_privilege('authenticated','public.b94_birth_probe()','execute'),
         has_function_privilege('service_role','public.b94_birth_probe()','execute')
    into v_anon, v_auth, v_svc;
  if v_anon then raise exception 'DD-202 FAILED: a new function in public is still executable by anon'; end if;
  if not v_auth then raise exception 'DD-202 FAILED: a new function in public lost authenticated EXECUTE — this file must not narrow signed-in access'; end if;
  if not v_svc then raise exception 'DD-202 FAILED: a new function in public lost service_role EXECUTE'; end if;

  -- (b) a schema with NO default ACL of its own, where anon reached only through PUBLIC
  execute 'create function agent.b94_birth_probe() returns void language sql as $b$ select 1 $b$';
  select has_function_privilege('anon','agent.b94_birth_probe()','execute'),
         has_function_privilege('authenticated','agent.b94_birth_probe()','execute')
    into v_anon, v_auth;
  if v_anon then raise exception 'DD-202 FAILED: a new function in agent is still executable by anon'; end if;
  if not v_auth then raise exception 'DD-202 FAILED: a new function in agent lost authenticated EXECUTE'; end if;

  -- (c) a DECLARED anonymous door keeps anon
  insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
  values ('public','b94_birth_door','',
          'DD-202 self-test: proves a declared ANONYMOUS, signed-out door keeps its anon EXECUTE at birth.');
  execute 'create function public.b94_birth_door() returns void language sql as $b$ select 1 $b$';
  select has_function_privilege('anon','public.b94_birth_door()','execute') into v_anon;
  if not v_anon then raise exception 'DD-202 FAILED: a DECLARED anonymous door lost anon EXECUTE at birth'; end if;

  -- (d) a SECURITY DEFINER function is left to the §6d-4 guard, which closes it harder
  execute 'create function public.b94_birth_definer() returns void language sql security definer as $b$ select 1 $b$';
  select has_function_privilege('anon','public.b94_birth_definer()','execute') into v_anon;
  if v_anon then raise exception 'DD-202 FAILED: a new SECURITY DEFINER function is executable by anon — the §6d-4 guard did not fire'; end if;

  -- teardown: nothing of this file's proof survives it
  execute 'drop function public.b94_birth_probe()';
  execute 'drop function agent.b94_birth_probe()';
  execute 'drop function public.b94_birth_door()';
  execute 'drop function public.b94_birth_definer()';
  delete from platform.client_callable_door
   where schema_name = 'public' and function_name = 'b94_birth_door';
  -- probe (d) makes the §6d-4 guard write its own durable row; this file's proof
  -- must not leave an unacknowledged entry in somebody else's triage lane.
  delete from platform.ddl_guard_log
   where rule = 'definer_client_grant_revoked'
     and object_ref = 'public.b94_birth_definer()';

  raise notice 'DD-202 proven on the sanctioned path: new functions in public and agent are born closed to anon with signed-in EXECUTE intact; a declared anonymous door keeps anon; a definer is closed by §6d-4.';
end $$;

comment on function platform.close_new_functions_to_anon() is
  'DD-202 event-trigger wrapper (SECURITY INVOKER per §6d-4/DD-151, so it fires on pnpm db:apply). Closes every new SECURITY INVOKER function in a PostgREST-exposed schema to PUBLIC and anon at creation, preserving every signed-in role that could already execute it.';
comment on table platform.anon_function_birth_grandfather is
  'DD-202: the SECURITY INVOKER functions that were already anon-executable on 2026-09-13. Exempt from the birth guard so a CREATE OR REPLACE cannot silently strip a grant this guard did not make. CLOSED — a BEFORE INSERT trigger refuses new rows; it may only shrink.';
