-- inverse of writeperf_the_page_census_names_only_the_silent.sql
-- WHAT IT DOES NOT UNDO: nothing. It restores the census body that named custom.enrich_due and
-- custom.page_size as silent when neither is, byte for byte as it was first landed.
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
