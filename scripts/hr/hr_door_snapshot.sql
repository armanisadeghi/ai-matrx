-- Regenerate scripts/hr/hr-door-snapshot.json — the offline truth the HR RPC
-- conformance guard (scripts/hr/hrb026_rpc_conformance.ts) diffs client call
-- sites against.
--
-- WHY A SNAPSHOT AND NOT A LIVE QUERY. The hr-guards CI job is deliberately
-- STATIC/MOCK-BACKED — no database, no secrets — so that it runs on every push
-- and can never report UNMEASURED. Same doctrine as scripts/schema-check:
-- a committed pull of live truth, refreshed on demand, is what the offline
-- checks read. This file IS the pull.
--
-- READ-ONLY. It touches pg_proc, platform.entity_types and hr._door_spec and
-- writes nothing.
--
-- HOW TO REFRESH (one of):
--   psql "$DATABASE_URL" -At -f scripts/hr/hr_door_snapshot.sql \
--     | python3 -m json.tool --sort-keys > scripts/hr/hr-door-snapshot.json
--   or run it through the Supabase MCP `execute_sql` tool and save the
--   `snapshot` column, formatted the same way.
--
-- WHAT IT CAPTURES, per public.hr_* door:
--   args           — every declared argument and whether it is REQUIRED (no DEFAULT)
--   jsonb_params   — for every jsonb argument: the set of payload keys the body
--                    actually READS (`p_x ->> 'k'`, `-> 'k'`, `#>> '{k,…}'`), and
--                    `analyzable` — false when the parameter is referenced
--                    anywhere OUTSIDE a literal key access (forwarded to another
--                    function, merged with ||, expanded by jsonb_populate_record,
--                    …). `analyzable:false` means the read-set below is a LOWER
--                    BOUND and the guard must not fail a call site on it.
--   door_expected_tier — the tier a token-taking door demands ('restricted' /
--                    'confidential'), read out of the wrapper's own body.
--   tokens         — every hr_* entity token, its audited tier, and whether
--                    hr._door_spec grants it a door at all.
with fns as (
  select p.proname as name, p.oid, pg_get_function_identity_arguments(p.oid) as ident_args,
         pg_get_function_arguments(p.oid) as full_args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'hr\_%'
), args as (
  select f.name, a.ord,
         trim(split_part(a.arg, ' ', 1)) as pname,
         (a.arg ~ ' DEFAULT ') as has_default
  from fns f, unnest(string_to_array(f.full_args, ', ')) with ordinality as a(arg, ord)
  where f.full_args <> ''
), jparams as (
  select f.oid, f.name, f.prosrc, trim(split_part(a.arg, ' ', 1)) as pname
  from fns f, unnest(string_to_array(f.ident_args, ', ')) as a(arg)
  where a.arg ~ ' jsonb$'
), scored as (
  select name, pname,
    (select count(*) from regexp_matches(prosrc, '\m' || pname || '\M', 'g')) as total_refs,
    (select count(*) from regexp_matches(prosrc, '\m' || pname || '\s*(?:->>|->|#>>|#>)\s*''[^'']+''', 'g')) as key_refs,
    coalesce((select array_agg(distinct m[1] order by m[1])
       from regexp_matches(prosrc, '\m' || pname || '\s*(?:->>|->|#>>|#>)\s*''([^'']+)''', 'g') m), '{}') as keys
  from jparams
), doorargs as (
  select name, jsonb_object_agg(pname, jsonb_build_object('required', not has_default, 'ord', ord)) as a
  from args group by name
), doorjson as (
  select name, jsonb_object_agg(pname, jsonb_build_object(
      -- `analyzable` requires BOTH that every reference is a literal key access
      -- AND that there is at least one. A body that never names the parameter is
      -- not a body that reads no keys: the SQL-language wrappers forward theirs
      -- positionally (`select hr.x($1, $2)`), and asserting "key never read"
      -- against those would fail correct call sites. Zero named reads ⇒ unknown.
      'reads', to_jsonb(keys), 'analyzable', (total_refs = key_refs and key_refs > 0),
      'unresolved_refs', total_refs - key_refs)) as j
  from scored group by name
), tokens as (
  select jsonb_object_agg(t.token, jsonb_build_object('tier', s.tier, 'has_door', (s.caps is not null))) as tk
  from (select distinct token from platform.entity_types where token like 'hr\_%') t
  left join lateral hr._door_spec(t.token) s on true
), tierdoors as (
  select jsonb_object_agg(f.name, m[1]) as td
  from fns f, lateral regexp_matches(f.prosrc, 'hr\._door_(?:list|get)\([^)]*''(restricted|confidential)''\s*\)') m
)
select jsonb_build_object(
  'generated_at', now(),
  'source', 'pg_proc / hr._door_spec / platform.entity_types on db.matrxserver.com (project brsgrqvjdzwihsvnfqkf)',
  'regenerate', 'pnpm hr:door-snapshot  (scripts/hr/hr_door_snapshot.sql)',
  'doors', (select jsonb_object_agg(coalesce(da.name, dj.name),
              jsonb_build_object('args', coalesce(da.a, '{}'::jsonb), 'jsonb_params', coalesce(dj.j, '{}'::jsonb)))
            from doorargs da full join doorjson dj on dj.name = da.name),
  'doors_with_no_args', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from fns where full_args = ''),
  'door_expected_tier', (select coalesce(td, '{}'::jsonb) from tierdoors),
  'tokens', (select tk from tokens)
)::text as snapshot;
