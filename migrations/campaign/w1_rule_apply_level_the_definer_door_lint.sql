-- target: branch
--
-- LEVEL THE REHEARSAL BRANCH WITH FIVE FUNCTIONS AND ONE TRIGGER PRODUCTION GAINED TONIGHT.
--
-- FOUND OUTSIDE W1-RULE-APPLY'S BRIEF, AND FIXED BECAUSE IT BLOCKS THAT LANE'S EXIT AND
-- EVERY LANE BEHIND IT (rule 20's middle case, rule 36's own remedy). `pnpm
-- check:branch-schema-drift` exited 0 at this lane's entry, 18:45 UTC 2026-09-17. At 19:11
-- UTC it exits 1 on SIX production objects the branch lacks, none of them this lane's and
-- none of them in schema `custom`:
--
--   function iam.is_client_lane()
--   function platform.definer_access_decision_regex()
--   function platform.definer_body_decides_access(p_oid oid, p_depth integer)
--   function platform.definer_body_lint_findings()
--   function platform.door_body_must_decide()
--   trigger  platform.client_callable_door.door_body_must_decide
--
-- They are one shipment: a lint that makes a SECURITY DEFINER door body prove it decides
-- access, plus the constraint trigger that enforces it on `platform.client_callable_door`.
-- Production's release train landed them while this lane was working, which is exactly the
-- class rule 36 exists for — "production moves under the branch every day, so an object
-- production has and the branch lacks makes a lane's branch exit a green nobody can spend".
-- A lane that registers a new door on the branch tonight would rehearse past a refusal
-- production would give it.
--
-- EVERY BODY BELOW IS PRODUCTION'S OWN, VERBATIM. Read 2026-09-17 19:12 UTC inside
-- `begin transaction read only` from `pg_get_functiondef` and `pg_get_triggerdef`, with no
-- edit of any kind — rule 36: levelling is a catalog-derived transplant, never a rewrite and
-- never a migration replay. `CREATE OR REPLACE FUNCTION` is what production itself emits, so
-- applying this twice gives the same result, and `drop trigger if exists` before the trigger
-- makes the trigger half idempotent too (PostgreSQL has no `CREATE TRIGGER IF NOT EXISTS`).
--
-- IT IS `-- target: branch` AND NOTHING ELSE. Production already has all six; this file can
-- never be pointed at it, and the runner refuses it there by header.

set lock_timeout = '2s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION iam.is_client_lane()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- TRUE when a person's identity is on this call (a browser, or our own pool acting as
  -- that person), and TRUE for any PostgREST web session. FALSE only for a server
  -- connection acting as nobody: a sweep, a system job, a migration.
  select (select auth.uid()) is not null
      or not iam.is_trusted_backend()
$function$
;

CREATE OR REPLACE FUNCTION platform.definer_access_decision_regex()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- Every shape that decides "may this caller touch this row?" in this database. It is
  -- deliberately GENEROUS: a body that reaches any of these is left alone, because the
  -- question this guard answers is "does it decide ANYTHING", not "does it decide
  -- correctly" — the second question is what the generated door contract
  -- (db/generate_door_contract_test.py) executes, per argument.
  select '(has_access|has_org_access|has_org_admin|has_org_owner'
      || '|is_org_member|is_org_manager|is_org_owner|is_org_admin|is_member_of_organization'
      || '|is_platform_admin|is_super_admin|is_admin|auth_is_org_admin'
      || '|has_permission|access_level|accessible_entity_ids|discoverable_ids|is_discoverable'
      || '|assert_class_allows|assert_class_read|class_allows'
      || '|can_access_conversation|can_access_run|membership_row_visible|org_readable|my_orgs'
      || '|assoc_side_readable|assoc_members_visible|scraper_visible|client_role_can_read'
      || '|resolve_entity_ref|gsc_assert_[a-z_]+|_tm_map|_tm_site|_tm_topic|_tm_live_topic_id'
      || '|guardian_can_view|guardian_assert_access|dict_assert_access|kg_caller_can_target_scope'
      || '|user_owns_file|user_owns_folder|can_view_chat_conversation'
      || '|can_read_processed_document|can_read_extraction_job|can_curate_library_document'
      || '|user_can_read_data_store_via_grant|user_can_read_via_library_grant|rag_user_can_see_note'
      || '|_edu_access_mode|_edu_can_read_via_assignment|_library_assert_admin|get_resource_access'
      || '|is_trusted_backend|is_client_lane|_container_authz|_meet_actor'
      || '|assert_[a-z_]*(access|member|owner|admin|permission|may)[a-z_]*'
      || '|auth\s*\.\s*uid|request\.jwt\.claims)'
$function$
;

CREATE OR REPLACE FUNCTION platform.definer_body_decides_access(p_oid oid, p_depth integer DEFAULT 5)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_rx text := platform.definer_access_decision_regex();
  v_seen oid[] := array[]::oid[];
  v_frontier oid[] := array[p_oid];
  v_next oid[];
  v_o oid;
  v_src text;
  v_i integer := 0;
begin
  if p_oid is null then
    return false;
  end if;
  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_i < p_depth loop
    v_i := v_i + 1;
    v_next := array[]::oid[];
    foreach v_o in array v_frontier loop
      if v_o = any(v_seen) then continue; end if;
      v_seen := v_seen || v_o;
      select p.prosrc into v_src from pg_proc p where p.oid = v_o;
      if v_src is null then continue; end if;
      if v_src ~* v_rx then
        return true;
      end if;
      -- The callees this body could possibly name: match on the identifiers the source
      -- actually writes before a '(', by NAME equality, never by running one regex per
      -- function in the database (3,000 regexes a node is not a guard, it is a timeout).
      with tok as (
        select distinct lower(m[1]) as nm
          from regexp_matches(v_src, '([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'g') m
      )
      select coalesce(array_agg(distinct p2.oid), array[]::oid[])
        into v_next
        from pg_proc p2
        join pg_namespace n2 on n2.oid = p2.pronamespace
       where lower(p2.proname) in (select nm from tok)
         and n2.nspname not in ('pg_catalog', 'information_schema')
         and p2.oid <> all(v_seen)
         and p2.prolang <> (select l.oid from pg_language l where l.lanname = 'internal');
      v_frontier := v_frontier || v_next;
    end loop;
    -- everything reachable at this level is now in v_frontier; the visited set stops
    -- the walk from ever revisiting a node.
    v_frontier := array(select distinct unnest(v_frontier) except select unnest(v_seen));
  end loop;
  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.definer_body_lint_findings()
 RETURNS TABLE(object_ref text, schema_name text, function_name text, identity_args text, id_arguments text[], grandfathered boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select format('%s.%s(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_ref,
         n.nspname::text,
         p.proname::text,
         pg_get_function_identity_arguments(p.oid)::text,
         a.id_args,
         exists (select 1 from platform.provision_spec_grandfather g
                  where g.lane = 'definer_no_access_decision'
                    and g.object_ref = format('%s.%s(%s)', n.nspname, p.proname,
                                              pg_get_function_identity_arguments(p.oid)))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral (
      select coalesce(array_agg(coalesce(p.proargnames[t.ord], 'arg' || t.ord)), array[]::text[]) as id_args
        from unnest(p.proargtypes) with ordinality as t(typ, ord)
       where t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype)
    ) a
   where p.prosecdef
     and p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions','graphql',
                           'graphql_public','pgbouncer','realtime','_realtime','storage','auth',
                           'cron','net','vault','pgsodium','pgsodium_masks','supabase_functions',
                           'supabase_migrations','dashboard','pgtle','tiger','tiger_data','topology')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE'))
     and coalesce(array_length(a.id_args, 1), 0) > 0
     and not platform.definer_body_decides_access(p.oid)
   order by 1
$function$
;

CREATE OR REPLACE FUNCTION platform.door_body_must_decide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  fn record;
  v_ref text;
  v_ids text[];
begin
  -- Only a row that OPENS a client lane makes the promise this guard enforces.
  if not (new.signed_in_callers or new.anonymous_callers) then
    return new;
  end if;

  select p.oid, p.prosecdef, p.prorettype,
         pg_get_function_identity_arguments(p.oid) as ia
    into fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = new.schema_name
     and p.proname = new.function_name
     and platform.door_argtypes(p.proargtypes) = new.identity_argtypes
   limit 1;
  if not found or not fn.prosecdef then
    -- DD-223 already owns "the door names no function"; a SECURITY INVOKER function is
    -- bounded by RLS and is not this guard's business.
    return new;
  end if;
  if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then
    return new;
  end if;

  select coalesce(array_agg(coalesce(pr.proargnames[t.ord], 'arg' || t.ord)), array[]::text[])
    into v_ids
    from pg_proc pr, unnest(pr.proargtypes) with ordinality as t(typ, ord)
   where pr.oid = fn.oid
     and t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype);
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return new;   -- takes no id: there is no row for a caller to name
  end if;

  if platform.definer_body_decides_access(fn.oid) then
    return new;
  end if;

  v_ref := format('%s.%s(%s)', new.schema_name, new.function_name, fn.ia);
  if exists (select 1 from platform.provision_spec_grandfather g
              where g.lane = 'definer_no_access_decision' and g.object_ref = v_ref) then
    return new;   -- excused, counted, and shrink-only
  end if;

  raise exception
    'ddl_guard[definer_no_access_decision]: % is SECURITY DEFINER, this row opens it to a '
    'client, and it takes the id(s) % — but neither its body nor anything it calls reaches an '
    'access decision. A door row is not a door check: seo.keyword_value_map had a truthful door '
    'row and returned 114,686 rows of another tenant''s data to a non-member (2026-09-17). '
    'Decide access in the body BEFORE the first read — iam.has_access(token, id, level), the '
    'shared assert helper for that entity, or an auth.uid() ownership test that is lawful for '
    'this row — and decide it before existence, so a foreign id and an invented one answer '
    'identically.',
    v_ref, array_to_string(v_ids, ', ')
    using errcode = '42501',
          hint = 'platform.definer_body_lint_findings() lists every function in this state; '
                 'platform.definer_access_decision_regex() is what "an access decision" means here. '
                 'If this really is the rare body whose decision none of those shapes can express, '
                 'the shrink-only list platform.provision_spec_grandfather (lane '
                 'definer_no_access_decision) is seeded from introspection, never by hand.';
end;
$function$

;

drop trigger if exists door_body_must_decide on platform.client_callable_door;
CREATE CONSTRAINT TRIGGER door_body_must_decide AFTER INSERT OR UPDATE ON platform.client_callable_door DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION platform.door_body_must_decide();

-- AND THE TWO DOOR ROWS PRODUCTION CARRIES FOR THEM, verbatim from the same read. They are
-- not decoration: production's new constraint trigger (above) refuses a SECURITY DEFINER
-- function that reaches COMMIT with no access decision declared, so the levelling is these
-- two INSERTs or it is nothing. Copied from `platform.client_callable_door` on production,
-- 2026-09-17 19:12 UTC, inside `begin transaction read only`.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform','definer_body_decides_access','p_oid oid, p_depth integer',
   array['oid'::regtype,'integer'::regtype]::oid[],
   'SERVER-ONLY. Reads pg_proc.prosrc for a function and everything it calls. Takes no entity id; answers a question about the CATALOGUE, not about any tenant''s rows.',
   'the 0805 body lint',
   'server_only: platform.door_body_must_decide, platform.definer_body_lint_findings, repo migrations and scripts/check_definer_bodies_decide_access.py — all of which run as postgres',
   false, false),
  ('platform','definer_body_lint_findings','', array[]::oid[],
   'SERVER-ONLY. The live census of client-callable SECURITY DEFINER functions that take an id and decide nothing — i.e. a list of where to attack. It takes no entity id and is never a client surface.',
   'the 0805 body lint',
   'server_only: the 0805 grandfather seed, scripts/check_definer_bodies_decide_access.py and the release gate, all of which run as postgres',
   false, false)
on conflict do nothing;
