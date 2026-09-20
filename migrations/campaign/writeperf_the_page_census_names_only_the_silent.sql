-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.silent_page_doors() e7b5a6295941510e048f06528d599c75557d6412fc5fa5accfa0d1e8657e67b1
--
-- WRITE-PERF — THE CENSUS NAMES ONLY THE DOORS THAT ARE ACTUALLY SILENT.
--
-- Its first run named two doors that are not the defect, and a census with a false name in it
-- is a census nobody reads:
--
--   * `custom.enrich_due` SAYS what its ceiling did — it returns a `trimmed_to` column that is
--     non-null exactly when the ceiling fired. That is the honest shape the whole class was
--     rewritten towards. The first version looked for `trimmed_to` in the BODY; the word lives
--     in the RETURNS TABLE clause, which is not in prosrc.
--   * `custom.page_size` is the decision itself. Of course it rewrites p_limit: that is its job.
--
-- Nothing else moves. The rule the census enforces is unchanged: a door with a page size either
-- asks `custom.page_size` or says out loud what it trimmed.

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
     -- THE DECISION ITSELF. custom.page_size is what every other door asks; it is not a door.
     and p.proname <> 'page_size'
     -- A DOOR THAT SAYS WHAT IT TRIMMED IS NOT SILENT. custom.enrich_due returns a
     -- `trimmed_to` column that is non-null exactly when its ceiling fired — the shape this
     -- census exists to spread. The word is in the RETURNS clause, not the body.
     and (pg_get_function_result(p.oid) !~ 'trimmed_to' and p.prosrc !~ 'trimmed_to')
     -- A door that hands p_limit straight through to another door inherits that door's
     -- contract and decides nothing itself.
     and p.prosrc ~ '(least|greatest)\s*\('
   order by 1;
$$;
comment on function custom.silent_page_doors() is
  'PAGE-1 census. Any custom door that takes p_limit and neither asks custom.page_size nor says out loud what it trimmed. Empty is the only passing answer.';
