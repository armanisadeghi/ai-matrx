-- DEFINER-7 — THE RED TWIN of scripts/campaign-tests/definer7_green.sql.
--
-- A green suite proves the doors are shut. It does NOT prove that the suite would have noticed
-- them open. So this file puts the state of 2026-09-22 back — the three `fork_shared_*` refusal
-- stubs running with borrowed rights, the platform's list of what an access decision IS without
-- the name of the gate `hr.wf_for_target` asks, `public.dict_resolve` handing its organization
-- array straight through, and `authenticated` holding EXECUTE on the crawl artifact assertion —
-- and REQUIRES every clause the green suite passes to fail.
--
-- It runs as the connected role on purpose: it is not a product test, it is a test of the
-- census, and rebuilding four function bodies is an operator's statement no client door covers.
-- Everything happens inside one transaction that ends in ROLLBACK, so the doors it re-opens are
-- shut again before any other session can reach them.

\set suite 'definer7_red.sql'
\set requires 'function:public.fork_shared_flashcard_set|function:public.dict_resolve|function:public.hr_wf_for_target|function:web.assert_crawl_artifact_file_reused|function:platform.definer_body_lint_findings'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- ── put the seven back, exactly as migrations/inverse/…_down.sql does ──────────────────────
\i migrations/inverse/definer7_seven_client_doors_decide_or_stop_being_doors_down.sql

do $$
declare
  v_census text[];
  v_n int;
  v_excused text[];
  v_door text;
begin
  -- 1 — the census must climb back to SEVEN, and name every door by name.
  select array_agg(object_ref order by object_ref), count(*)
    into v_census, v_n
    from platform.definer_body_lint_findings();
  if v_n <> 7 then
    raise exception 'RED 1: the census reads % with the pre-DEFINER-7 bodies restored — it must read 7, or clause 7 of the green suite proves nothing: %',
      v_n, v_census;
  end if;
  foreach v_door in array array[
    'public.fork_shared_quiz(', 'public.fork_shared_flashcard_set(', 'public.fork_shared_conversation(',
    'public.hr_wf_for_target(', 'public.dict_resolve(', 'public.record_guest_execution(',
    'web.assert_crawl_artifact_file_reused(']
  loop
    if not exists (select 1 from unnest(v_census) c where c like v_door || '%') then
      raise exception 'RED 1: the census does not name % with its pre-DEFINER-7 body restored', v_door;
    end if;
  end loop;

  -- 2 — the platform must once again be blind to the gate hr.wf_for_target asks on every row.
  if platform.definer_body_decides_access('public.hr_wf_for_target(text,uuid)'::regprocedure::oid) then
    raise exception 'RED 2: the ONE list still sees hr._wf_instance_visible after the name was removed from it — clause 5 of the green suite would pass either way';
  end if;
  if platform.definer_body_decides_access('public.dict_resolve(boolean,boolean,uuid[],uuid[],uuid[])'::regprocedure::oid) then
    raise exception 'RED 2: dict_resolve still reaches a decision the platform can read after the narrowing was removed';
  end if;

  -- 3 — the three refusal stubs run with borrowed rights again.
  select array_agg(p.oid::regprocedure::text order by p.proname) into v_census
    from pg_proc p
   where p.prosecdef
     and p.oid in ('public.fork_shared_quiz(uuid,text)'::regprocedure,
                   'public.fork_shared_flashcard_set(uuid,text)'::regprocedure,
                   'public.fork_shared_conversation(uuid,text)'::regprocedure);
  if coalesce(array_length(v_census, 1), 0) <> 3 then
    raise exception 'RED 3: only % of the three stubs went back to SECURITY DEFINER, so clause 1 of the green suite is not load-bearing: %',
      coalesce(array_length(v_census, 1), 0), v_census;
  end if;

  -- 4 — the crawl artifact assertion is reachable from a signed-in seat again.
  if not has_function_privilege('authenticated',
       'web.assert_crawl_artifact_file_reused(uuid,uuid,uuid,text)'::regprocedure::oid, 'EXECUTE') then
    raise exception 'RED 4: authenticated did not get EXECUTE back, so clause 6 of the green suite is not load-bearing';
  end if;

  -- 5 — and the two excusing lists disagree again: the database excuses TWO, the committed
  --     ratchet excuses four, which is the drift aidream/scripts/check_definer_bodies_decide_access.py
  --     now refuses to run through.
  select array_agg(object_ref order by object_ref) into v_excused
    from platform.provision_spec_grandfather
   where lane = 'definer_no_access_decision';
  if coalesce(array_length(v_excused, 1), 0) <> 2 then
    raise exception 'RED 5: the database excuses % door(s) with the inverse applied — it excused 2 on 2026-09-22: %',
      coalesce(array_length(v_excused, 1), 0), v_excused;
  end if;

  raise notice 'definer7_red: every clause of the green suite goes red when the seven doors are re-opened';
end $$;

rollback;
