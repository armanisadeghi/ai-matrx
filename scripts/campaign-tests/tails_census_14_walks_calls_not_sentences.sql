-- scripts/campaign-tests/tails_census_14_walks_calls_not_sentences.sql — lane TAILS.
--
-- Census 14 of `pnpm check:store-doors-decide` walks the ladder's call graph with one regex
-- over `pg_get_functiondef`, and a regex cannot tell a CALL from a SENTENCE.
-- `iam.has_access_for_base` only NAMES `platform.audit_carrying_cycles` inside a
-- `raise warning` remedy string, and the walk followed it.
--
-- THIS SUITE RUNS BOTH WALKS SIDE BY SIDE from the same four roots, on the live database,
-- and asserts the three clauses that make the repair STRICTLY BETTER rather than merely
-- smaller — which is the whole difference between fixing a guard and blinding one:
--   A. `iam.has_access` is STILL FOUND. (The naive repair — strip comments and raise prose
--      together — loses it, along with nine others. It is on the path.)
--   B. `platform.audit_carrying_cycles` is GONE.
--   C. Nothing is GAINED, and everything else lost is a function no surviving node calls in
--      code: the false edge's own subtree, which is what removing a false edge means.
--   D. `custom.ladder_replanners()` returns the same verdict as before.
--
-- THE SEAT. PART 0 takes it and proves it. The walk itself then runs as the owner, because
-- `custom._call_text` is deliberately NOT a client door — and that is ASSERTED here rather
-- than claimed, so the day it becomes one this suite says so.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '900s';

-- The walk, with the stripper switched on or off. `p_strip=false` is the shipped-before
-- body's behaviour, character for character.
create or replace function pg_temp.walk(p_strip boolean) returns text[]
language plpgsql stable as $w$
declare
  v_front text[] := array['custom.has_visibility','custom.effective_level',
                          'custom.reaches_directly','custom.visible_set'];
  v_seen  text[] := '{}'::text[];
  v_cur   text; v_head integer := 1; v_body text; rec record;
begin
  while v_head <= coalesce(array_length(v_front,1),0) and v_head <= 1000 loop
    v_cur := v_front[v_head]; v_head := v_head + 1;
    continue when v_seen @> array[v_cur];
    v_seen := v_seen || v_cur;
    select string_agg(pg_catalog.pg_get_functiondef(pr.oid), E'\n') into v_body
      from pg_catalog.pg_proc pr join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname || '.' || pr.proname = v_cur;
    continue when v_body is null;
    if p_strip then v_body := custom._call_text(v_body); end if;
    for rec in
      select distinct mm[1] || '.' || mm[2] as callee
        from pg_catalog.regexp_matches(v_body,
               '(custom|iam|platform|public|history)[.]([a-z0-9_]+)[[:space:]]*[(]', 'g') as mm
    loop
      if not (v_seen @> array[rec.callee]) then v_front := v_front || rec.callee; end if;
    end loop;
  end loop;
  return v_seen;
end $w$;

do $suite$
declare
  v_old text[]; v_new text[]; v_lost text[]; v_gained text[]; v_still text;
begin
  -- ══ PART 0 — THE SEAT ════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role','none', true);

  -- The walk is the STORE'S OWN INTERNALS, not a product surface, and it is asked of the
  -- catalogue. `custom._call_text` holds no client EXECUTE — measured, not asserted in prose.
  if has_function_privilege('authenticated', 'custom._call_text(text)', 'EXECUTE') then
    raise exception 'THE SEAT MOVED: custom._call_text is now callable by a signed-in person, so this suite must ask it from the seat';
  end if;
  raise notice 'PART 0 PASSED — seated and proven; the walk below runs as the owner because no seat can reach it';

  v_old := pg_temp.walk(false);
  v_new := pg_temp.walk(true);
  select array(select unnest(v_old) except select unnest(v_new) order by 1) into v_lost;
  select array(select unnest(v_new) except select unnest(v_old) order by 1) into v_gained;

  -- ══ A — THE EDGE THAT MUST SURVIVE ═══════════════════════════════════════════
  if not (v_new @> array['iam.has_access']) then
    raise exception 'A: iam.has_access fell out of the graph — this repair blinded the guard instead of sharpening it';
  end if;
  raise notice 'A PASSED — iam.has_access is still on the walk (% nodes before, % after)',
    cardinality(v_old), cardinality(v_new);

  -- ══ B — THE FALSE EDGE THAT MUST GO ══════════════════════════════════════════
  if not (v_old @> array['platform.audit_carrying_cycles']) then
    raise exception 'B: the false edge is not in the BEFORE walk, so this suite is not measuring what it claims';
  end if;
  if v_new @> array['platform.audit_carrying_cycles'] then
    raise exception 'B: platform.audit_carrying_cycles is still walked — it is named only in a raise warning remedy string';
  end if;
  raise notice 'B PASSED — the sentence in iam.has_access_for_base is no longer an edge';

  -- ══ C — NOTHING GAINED, AND EVERY LOSS IS THE FALSE EDGE'S OWN SUBTREE ═══════
  if cardinality(v_gained) > 0 then
    raise exception 'C: the strip INVENTED % edge(s): %', cardinality(v_gained), array_to_string(v_gained, ', ');
  end if;
  foreach v_still in array v_lost loop
    if exists (
      select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       -- `pg_get_functiondef` RAISES "array_agg is an aggregate function" on an aggregate
       -- row, and the planner is free to evaluate it before the name filter, so the kind
       -- filter is part of the predicate rather than a tidy-up.
       where p.prokind in ('f', 'p')
         and n.nspname || '.' || p.proname = any (v_new)
         and custom._call_text(pg_catalog.pg_get_functiondef(p.oid))
             ~ ('[^a-z_]' || replace(v_still, '.', '[.]') || '[[:space:]]*[(]')
    ) then
      raise exception 'C: % was dropped although a node still in the graph really calls it', v_still;
    end if;
  end loop;
  raise notice 'C PASSED — gained nothing; the % dropped node(s) are called by nobody left in the graph: %',
    cardinality(v_lost), array_to_string(v_lost, ', ');

  -- ══ D — THE VERDICT THE GUARD ACTUALLY PRINTS IS UNCHANGED ═══════════════════
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
   where n.nspname || '.' || p.proname = any (v_lost)
     and l.lanname = 'sql' and (p.prosecdef or p.proconfig is not null) and p.provolatile <> 'i'
  ) then
    raise exception 'D: a dropped node WAS a replanner, so the guard now finds less than it did';
  end if;
  raise notice 'D PASSED — no dropped node was a replanner, so custom.ladder_replanners() answers exactly as before';

  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;

rollback;
