-- additive: yes
-- lane: STORE-SMALLS
-- based-on: iam.anon_key_needs_a_class_lane() 395a89da8142bd26f18df4f285b5e0d3a1b3af7868807a9f0acf8f5eaecaa5ea
-- supersedes-function: iam.anon_key_needs_a_class_lane
--
-- STORE-SMALLS — A SCHEMA SUPABASE OWNS KEEPS ITS OWN DEFAULT PRIVILEGES.
--
-- `iam.anon_key_needs_a_class_lane()` (aidream 0895–0897) refuses any GRANT or ALTER DEFAULT
-- PRIVILEGES after which a default ACL anywhere in the database hands `anon` SELECT on future
-- tables. Its part 1 scans EVERY pg_default_acl row, not only the one the statement touched,
-- and exempted Supabase's own schemas by a hand list: storage, graphql, graphql_public. The
-- rehearsal branch carries a fourth — `supabase_functions`, Supabase's database-webhooks
-- schema (since 2026-09-15), owned by `supabase_admin`, whose default ACL keys anon and which
-- `postgres` can neither alter nor drop — so with this guard attached the branch refused
-- EVERY GRANT, on any table, to any role (PROGRESS-BRANCH-REFRESH Round 5, declared skip in
-- scripts/night/branch-carry-database-objects.sh). A hand list is the defect's class: the
-- next schema Supabase ships does the same to production.
--
-- THE FIX, and only this: part 1 exempts a schema whose OWNER is a superuser role this
-- definer cannot become, read from the catalogue. On production and the clone that is
-- exactly the old list (storage, graphql, graphql_public are the only schemas with an anon
-- default ACL, and all three are owned by supabase_admin), so production behaviour does not
-- move. Part 2 (a key to a table whose class emits no anon lane) is byte-for-byte unchanged,
-- and a default ACL in any schema `postgres` owns, or database-wide, is still refused.
--
-- Same signature, same owner, same SECURITY DEFINER, same search_path, same messages.
-- The inverse is migrations/inverse/anonguard_a_schema_supabase_owns_keeps_its_own_default_privileges_down.sql.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION iam.anon_key_needs_a_class_lane()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  -- Pre-existing per-table contradictions as of 2026-09-18 (0895). NOT a list to grow.
  c_grandfathered constant text[] := array[
    'app', 'canvas_item', 'category', 'heatmap_save', 'learn_doc',
    'message_template', 'note', 'ui_surface_agent_pref', 'ui_surface_config', 'wbx_capture'];
  r record;
begin
  -- ── 1. a STANDING instruction to key every future table in a schema ────────
  -- Checked first: it is the wider hole of the two.
  for r in
    select coalesce(n.nspname, '(every schema)') as sch,
           d.defaclrole::regrole::text as owner,
           (select string_agg(distinct coalesce(nullif(g.grantee, 0)::regrole::text, 'PUBLIC'), ', ')
              from aclexplode(d.defaclacl) g
             where g.privilege_type = 'SELECT'
               and (g.grantee = 0 or g.grantee = 'anon'::regrole::oid)) as grantees
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
     where d.defaclobjtype = 'r'
       and exists (select 1 from aclexplode(d.defaclacl) g
                    where g.privilege_type = 'SELECT'
                      and (g.grantee = 0 or g.grantee = 'anon'::regrole::oid))
       -- A SCHEMA SUPABASE OWNS keeps its own default privileges (STORE-SMALLS, 2026-09-23).
       -- Asked of the catalogue by OWNER, never a list of names: the schema belongs to a
       -- superuser role this definer cannot become, so Supabase created it, a table in it is
       -- Supabase's and never a platform table, and a refusal about it only refuses whatever
       -- GRANT happened to fire this trigger. 0896's hand list (storage, graphql, graphql_public)
       -- is exactly that set on production; the rehearsal branch also carries Supabase's
       -- webhooks schema `supabase_functions`, and the list's absence of it refused EVERY
       -- GRANT there. A schema the platform owns (every one `postgres` owns) is judged, and
       -- so is a database-wide default (defaclnamespace = 0).
       and (d.defaclnamespace = 0
            or not exists (select 1 from pg_roles o
                            where o.oid = n.nspowner
                              and o.rolsuper
                              and not pg_has_role(o.oid, 'USAGE')))
     limit 1
  loop
    raise exception using errcode = '22023',
      message = format(
        'A DEFAULT PRIVILEGE now gives %s SELECT on every table created in %s from now on (owner %s). That is a standing key for an anonymous reader, handed out before any of those tables exists and before any class can say whether a stranger is welcome. It was rolled back.',
        r.grantees, r.sch, r.owner),
      hint = 'Do not key a schema in advance. If a specific table really is public-facing, set platform.entity_types.data_class = ''public'' on its token with a data_class_reason naming the anonymous surface it serves, then grant on THAT table — `public` is the one class whose lane set includes anon. If the readers are meant to be signed in, use `authenticated`. A column grant, a grant to PUBLIC and a default privilege are all keys; has_any_column_privilege(''anon'', <table>, ''SELECT'') is the per-table question.';
  end loop;

  -- ── 2. a key to a table that exists now (0895) ─────────────────────────────
  for r in
    with keyed as materialized (
      select et.token, et.schema_name, et.table_name, c.oid
        from platform.entity_types et
        join pg_class c on c.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
       where et.is_active
         and c.relkind = 'r'
         and et.rls_variant not in ('component','ledger','personal','system')
         and has_any_column_privilege('anon', c.oid, 'SELECT')
    )
    select k.token, k.schema_name, k.table_name,
           (iam.class_lanes(k.token)).resolved_class as resolved_class
      from keyed k
     where not (iam.class_lanes(k.token)).anon_lane
       and not (k.token = any (c_grandfathered))
     limit 1
  loop
    raise exception using errcode = '22023',
      message = format(
        '`anon` now holds a key to %I.%I (token %s), but its class %s emits NO anonymous lane. An anonymous reader is either welcome on this table or not, and this grant says yes while the class says no. The grant was rolled back.',
        r.schema_name, r.table_name, r.token, r.resolved_class),
      hint = 'Three legal fixes. (1) The table really is public-facing: set platform.entity_types.data_class = ''public'' with a data_class_reason naming the anonymous surface it serves, then re-issue the grant — `public` is the one class whose lane set includes anon. (2) The reader is meant to be signed in: grant to `authenticated` instead. (3) The grant is not wanted: do not make it. A column grant, a grant to PUBLIC and a default privilege are all keys — has_any_column_privilege(''anon'', <table>, ''SELECT'') is the question.';
  end loop;
end
$function$
;
