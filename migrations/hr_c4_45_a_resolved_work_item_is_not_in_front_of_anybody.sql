-- HR domain C4 — migration 45 (register item HRB-008; found while re-proving hr_c4_43/44).
--
-- 🚨 A CLOSED WORK ITEM WAS STILL SUPPRESSING THE FLAG.
--
-- `hr._wf_not_attested` decides whether to send the close-time flag by asking whether the failure
-- lane already owns this step:
--
--     select exists (select 1 from hr.workflow_failure wf
--                     where wf.workflow_step_id = p_step
--                       and wf.failure_class = 'unactionable_no_reach') into v_owned;
--
-- That matches a failure in ANY state — including `resolved` and `abandoned`. A resolved work item
-- is not in front of anybody: somebody already worked it and closed it. If the step later becomes
-- reachable and closes again, the flag is the only signal there is, and this suppressed it on the
-- strength of a work item that no longer exists as work.
--
-- The whole point of hr_c4_43's check was "the human already HAS this in their queue". `open` and
-- `retrying` are the states where that is true; the other two are the states where it is not.
--
-- RD 1. THIS IS THE SAME SHAPE AS THE BUG IT FIXES. hr_c4_43 correctly decided to look at the
-- failure table rather than infer from the reason — but looked at the wrong question, asking "did
-- this ever happen" where it meant "is this open now". Reading a record is only as honest as the
-- predicate you read it with.
--
-- RD 2. IT MATCHES THE IDEMPOTENCE GUARD, WHICH ALREADY GOT THIS RIGHT. `hr.wf_activate_step`'s
-- raise suppression reads `wf.state in ('open','retrying')`. The two predicates now agree, which
-- they must: one decides whether to CREATE the work item, the other whether to rely on it existing.
--
-- Applied live as `hr_c4_45_a_resolved_work_item_is_not_in_front_of_anybody`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_45_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  select exists (select 1 from hr.workflow_failure wf
                  where wf.workflow_step_id = p_step
                    and wf.failure_class = 'unactionable_no_reach')
    into v_owned;$o$;
  v_new constant text := $o$  -- 🚨 OPEN work, not work that ONCE existed (hr_c4_45). A resolved or abandoned failure is not in
  -- front of anybody, so it must not suppress the only other signal. This predicate now matches the
  -- one hr.wf_activate_step uses to decide whether to RAISE the work item — they answer two halves
  -- of one question and must not disagree.
  select exists (select 1 from hr.workflow_failure wf
                  where wf.workflow_step_id = p_step
                    and wf.failure_class = 'unactionable_no_reach'
                    and wf.state in ('open','retrying'))
    into v_owned;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('OPEN work, not work that ONCE existed' in v_def) > 0 then
    raise notice 'hr_c4_45: the check already asks whether the work item is open';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_45: hr._wf_not_attested does not carry the expected check — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_45: only an OPEN work item suppresses the close-time flag';
  end if;
end
$mig$;

do $$
begin
  update hr.function_contract
     set must_contain = must_contain || array['wf.state in (''open'',''retrying'')'],
         reason = reason || ' hr_c4_45: the ownership check must ask whether the work item is OPEN — a resolved failure is not in front of anybody, and suppressing the flag on its strength leaves a reachable employee''s close with no signal at all. This predicate must keep matching hr.wf_activate_step''s raise guard.'
   where schema_name = 'hr' and function_name = '_wf_not_attested' and home_migration = 'hr_c4_44'
     and not (must_contain @> array['wf.state in (''open'',''retrying'')']);
end $$;

do $$
declare v_bad integer; v_before integer; v_res jsonb;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_not_attested')
     !~ 'wf\.state in \(''open'',''retrying''\)' then
    raise exception 'hr_c4_45: the ownership check is not scoped to open work';
  end if;
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_45: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_45: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_45_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_45: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
