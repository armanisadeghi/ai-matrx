-- inverse of writeperf_the_page_census_names_only_the_silent.sql
-- WHAT IT DOES NOT UNDO: nothing. It restores the census body that named custom.enrich_due and
-- custom.page_size as silent when neither is, byte for byte as it was first landed.
--
-- WHY THE DOOR ROW IS LIFTED AND PUT BACK AROUND THE REPLACE, which looks like ceremony and is
-- not: schema `custom` carries ALTER DEFAULT PRIVILEGES granting EXECUTE to `authenticated` on
-- every new function, so a CREATE OR REPLACE re-issues that grant, and
-- platform.enforce_definer_client_grants REFUSES a client grant on a function whose
-- platform.client_callable_door row says no client may open it (DD-223). The first landing only
-- warned because the row did not exist yet. Taking the row out, replacing the body and putting
-- the row back is the order the guard is asking for.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'silent_page_doors';
create or replace function custom.silent_page_doors()
returns table(door text, why text)
language sql stable security definer set search_path to ''
as $$
  select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'takes p_limit and still substitutes a page size of its own: ' ||
         coalesce((select string_agg(m[1], ' | ')
                     from regexp_matches(p.prosrc,
                            '((?:least|greatest)\s*\(\s*(?:least|greatest|coalesce)[^)]*p_limit[^;]{0,120})', 'g') m),
                  'p_limit is rewritten without custom.page_size')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and pg_get_function_identity_arguments(p.oid) ~ 'p_limit'
     and p.prosrc !~ 'custom\.page_size'
     and p.prosrc !~ 'trimmed_to'
     and p.prosrc ~ '(least|greatest)\s*\('
   order by 1;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'silent_page_doors', '', array[]::oid[],
   'migrations/inverse/writeperf_the_page_census_names_only_the_silent_down.sql (lane WRITE-PERF)',
   'PAGE-1 census: reads pg_proc and pg_namespace only. It names no organization, no record and no person, and it returns catalogue text about the store''s own doors.',
   'server_only: read by pnpm check:store-doors-decide as the connected operator. It is a census of the store''s shape, not of anybody''s data, and no browser has a reason to ask it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
