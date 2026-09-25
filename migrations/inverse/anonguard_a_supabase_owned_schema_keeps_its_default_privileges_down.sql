-- chair-step: the inverse of STORE-SMALLS' anon-key guard fix — puts back 0896's hand list (storage, graphql, graphql_public) in iam.anon_key_needs_a_class_lane(), which re-refuses every GRANT on any database carrying a Supabase-owned schema not on that list (the rehearsal branch's supabase_functions). Body only; no grant, no data.
-- based-on: iam.anon_key_needs_a_class_lane() 40614096fc9e7d3953048ebbdb50a3158916f70a309f854f242d4fb045681d16
--
-- Inverse of migrations/campaign/anonguard_a_supabase_owned_schema_keeps_its_default_privileges.sql.
-- Restores the body live on production before it, byte for byte as pg_get_functiondef gave
-- it on 2026-09-23 (sha256 395a89da…aa5ea). It reintroduces the defect; it exists so rule 27
-- (up -> inverse -> up) can prove the fix against its own prior state.

set lock_timeout = '2s';

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
  -- Supabase's own schemas, which ship with an anon default ACL on tables (0896).
  c_default_acl_grandfathered constant text[] := array['storage', 'graphql_public', 'graphql'];
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
       and (d.defaclnamespace = 0
            or not (n.nspname = any (c_default_acl_grandfathered)))
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
