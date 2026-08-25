-- Rule exclusions — the deterministic "except when" half of a word rule.
--
-- WHY: a word rule is pure SQL, run by seo.fn_evaluate_matchers. `free` as a
-- `word` match hits "gluten-free", "free radical", "freehold" and "free cash
-- flow", because Postgres word boundaries treat the hyphen as a break. There
-- was no way to say "except". Guarding it in an agent's head is not a guard;
-- guarding it in the row is.
--
-- HOW: `exclusions text[]` on the matcher. If the keyword contains ANY listed
-- phrase, that matcher does not fire for it. No AI, no cost, same pass.
-- Idempotent.

alter table seo.dimension_value_matcher
  add column if not exists exclusions text[];

comment on column seo.dimension_value_matcher.exclusions is
  'Phrases that CANCEL this matcher: if the keyword contains any of them, the matcher does not fire. Deterministic, evaluated in the same SQL pass.';

-- Teach the engine, rewritten FROM ITS LIVE DEFINITION so a concurrent edit is
-- preserved rather than overwritten by a stale file.
do $$
declare
  v_def text;
  v_old_m text;
  v_new_m text;
  v_old_join text;
  v_new_join text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'seo' and p.proname = 'fn_evaluate_matchers_internal';
  if v_def is null then
    raise exception 'fn_evaluate_matchers_internal not found';
  end if;

  if position('dm.exclusions' in v_def) > 0 then
    raise notice 'exclusions already wired into the engine; nothing to do';
    return;
  end if;

  -- 1. carry the column into the matcher CTE
  v_old_m := 'SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,';
  v_new_m := 'SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id, dm.exclusions,';
  if position(v_old_m in v_def) = 0 then
    raise exception 'engine shape changed: matcher CTE select not found — inspect before re-running';
  end if;
  v_def := replace(v_def, v_old_m, v_new_m);

  -- 2. cancel a text match when the phrase carries an excluded term
  v_old_join := 'OR (m.kind = ''word''        AND kw.normalized_phrase ~ (''\m'' || m.pattern || ''\M'')))';
  v_new_join := 'OR (m.kind = ''word''        AND kw.normalized_phrase ~ (''\m'' || m.pattern || ''\M'')))'
             || ' AND (m.exclusions IS NULL OR NOT EXISTS ('
             || 'SELECT 1 FROM unnest(m.exclusions) ex '
             || 'WHERE kw.normalized_phrase LIKE ''%'' || seo.gsc_perf_like_escape(ex) || ''%''))';
  if position(v_old_join in v_def) = 0 then
    raise exception 'engine shape changed: text-match join not found — inspect before re-running';
  end if;
  v_def := replace(v_def, v_old_join, v_new_join);

  execute v_def;
  raise notice 'exclusions wired into fn_evaluate_matchers_internal';
end $$;
