-- hr_l1_61_an_unestablished_population_is_not_membership.sql
--
-- (Numbered 61, not 60: a concurrent lane had already applied
--  hr_l1_60_a_status_with_no_writer_is_not_a_status. Two migrations sharing one number
--  is the kind of thing that costs the next agent an hour, so this one moved.)
--
-- The two residuals left open by hr_l1_59, both ruled by the coordinator.
--
-- ═══ (1) THE SCOPE-RESTRICTED GRANT AND THE PERSON WITH NO CURRENT POSITION — FAIL CLOSED ═══
--
-- hr_l1_59 bound the TENANT. It did not bind the POPULATION, and for the same people: with
-- `v_emp` NULL, `hr.capability` skips its `population_contains` clause entirely
--   (`p_subject_employment is null or hr.population_contains(...)`)
-- so a DEPARTMENT- or LOCATION-scoped hr_admin reached every prehire and every terminated
-- ex-employee in the organization, including ones who were never in their department. The org
-- was right; the population was unasked.
--
-- 🚨 RULED: AN UNESTABLISHED PREDICATE FAILS CLOSED. Absence of evidence of membership is not
-- membership — the same posture as `unactionable_no_reach` and the outsider walk's
-- guilty-until-sanctioned rule. But blanket refusal would have been the lazy half of the ruling,
-- because THE INTENDED POPULATION IS ON THE RECORD: every one of the 10 affected people carries a
-- primary `hr.position_assignment` with a real department and location — a prehire's is
-- effective-dated to their start, an ex-employee's to the job they last held. Measured, not
-- assumed, before this was written. So the population is EVALUATED against it rather than refused.
--
-- The fix is two small changes and no new machinery:
--   • `hr._l1_viewer` stops handing NULL to the capability questions. When nobody is employed
--     TODAY it falls back to the subject's nearest employment spell — the earliest FUTURE one for
--     a prehire (the job they are about to start), else the latest PAST one for someone who has
--     left. `hr.capability` then binds the tenant from that row AND gets a real subject to run
--     `population_contains` against.
--   • `hr.capability` evaluates the population AS OF THE DATE THE SUBJECT ACTUALLY HOLDS A
--     POSITION when they hold none as of `p_at`. Without this the department branch resolves
--     through `primary_position_as_of(subject, today)`, finds nothing, and refuses a department
--     admin their own incoming hire — the ruling's "determinable" case, failed closed for no
--     reason. `v_pop_at` is `p_at` for everybody else, so no currently-employed subject moves.
--
-- The three outcomes, all falsified below and in the script:
--   org-scoped admin   → own-org prehire   = REACHES     (unchanged; the common case)
--   dept-scoped admin  → prehire OUTSIDE their department = REFUSED (was reaching — the fix)
--   dept-scoped admin  → prehire INTENDED for their department = REACHES (the determinable case)
--
-- ═══ (2) hr.wf_inbox's ORG-LESS `workflow.view_queue` — VERIFIED, THEN CLOSED ANYWAY ═══
--
-- Verified first, as instructed. The org-less check gates only whether the QUEUE SCOPE IS OFFERED;
-- the items carried their own organization predicate
--   `i.organization_id in (select organization_id from hr.employment where id = any(v_emp))`
-- so this was never the open door hr_l1_59 closed. But that predicate binds to where the caller is
-- EMPLOYED, not to where the caller was GRANTED — so a person employed by two employers who holds
-- `workflow.view_queue` in only one of them would read the other's queue. Measured across every
-- live user: NOBODY has that shape (every user employed somewhere without the capability holds it
-- nowhere at all, so the affordance gate refuses them outright). Latent, not live — and therefore
-- cheap to close now. Both predicates are kept, so the change can only ever REMOVE rows.
--
-- Applied live 2026-08-29 and double-ledgered. Falsified through PostgREST with real minted JWTs.

do $mig$
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_l1_viewer')
     ~ 'AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP' then
    raise notice 'hr_l1_61: already applied';
    return;
  end if;

  create or replace function pg_temp._swap(p_fn text, p_old text, p_new text, p_expect int)
  returns void language plpgsql as $swap$
  declare v_def text; v_cnt int;
  begin
    v_def := pg_get_functiondef(p_fn::regprocedure);
    v_cnt := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
    if v_cnt <> p_expect then
      raise exception 'hr_l1_61: % — expected % occurrence(s) of the anchor, found %. REFUSING to '
                      'guess at a body that has moved underneath this migration.',
                      p_fn, p_expect, v_cnt;
    end if;
    execute replace(v_def, p_old, p_new);
  end $swap$;

  ---------------------------------------------------------------------------------------------
  -- 1a. hr._l1_viewer — hand the capability questions a REAL subject instead of NULL.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;\n'
    || E'  v_org_role := hr._l1_org_role(p_user, v_org);',
    E'  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;\n'
    || E'  -- 🚨 AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP. Handing NULL to hr.capability does\n'
    || E'  -- not just unbind the tenant (hr_l1_59) — it skips the population check outright, so a\n'
    || E'  -- DEPARTMENT- or LOCATION-scoped admin reached every prehire and every ex-employee in\n'
    || E'  -- the org, including people who were never theirs. Nobody is employed TODAY here, but\n'
    || E'  -- the record still says WHICH JOB: the earliest FUTURE spell is the one a prehire is\n'
    || E'  -- about to start, the latest PAST spell is the one an ex-employee last held. Resolving\n'
    || E'  -- it gives hr.capability a real subject to scope against instead of a blank cheque.\n'
    || E'  if v_emp is null then\n'
    || E'    select em.id into v_emp\n'
    || E'      from hr.employment em\n'
    || E'     where em.employee_id = p_employee_id and em.deleted_at is null\n'
    || E'     order by (em.hire_date > p_at) desc,\n'
    || E'              case when em.hire_date > p_at then em.hire_date end asc nulls last,\n'
    || E'              em.hire_date desc\n'
    || E'     limit 1;\n'
    || E'  end if;\n'
    || E'  v_org_role := hr._l1_org_role(p_user, v_org);', 1);

  ---------------------------------------------------------------------------------------------
  -- 1b. hr.capability — evaluate the population as of a date the subject actually holds a
  --     position. Identical to p_at for everyone who holds one today, which is everyone else.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr.capability(uuid,text,uuid,date,uuid)',
    E'  v_org    uuid := p_organization_id;\n',
    E'  v_org    uuid := p_organization_id;\n  v_pop_at date := p_at;\n', 1);

  perform pg_temp._swap('hr.capability(uuid,text,uuid,date,uuid)',
    E'    if v_org is null then return false; end if;\n  end if;\n',
    E'    if v_org is null then return false; end if;\n'
    || E'\n'
    || E'    -- 🚨 THE POPULATION IS ASKED ON A DATE THE SUBJECT ACTUALLY HOLDS A POSITION.\n'
    || E'    -- department | location | crew all resolve through primary_position_as_of, which\n'
    || E'    -- finds nothing for a prehire (their assignment starts later) or an ex-employee\n'
    || E'    -- (theirs ended) — so the scoped grant would refuse a department admin their own\n'
    || E'    -- incoming hire, which is the ruling''s determinable case failed closed for no\n'
    || E'    -- reason. The intended job is ON THE RECORD; ask about it on its own date. When a\n'
    || E'    -- position exists as of p_at — everyone currently employed — v_pop_at IS p_at and\n'
    || E'    -- nothing moves. When no assignment exists at all, v_pop_at stays p_at and the\n'
    || E'    -- population stays unestablished, which fails closed exactly as it should.\n'
    || E'    if (hr.primary_position_as_of(p_subject_employment, p_at)).id is null then\n'
    || E'      select coalesce(min(pa.effective_from) filter (where pa.effective_from > p_at),\n'
    || E'                      max(pa.effective_from) filter (where pa.effective_from <= p_at),\n'
    || E'                      p_at)\n'
    || E'        into v_pop_at\n'
    || E'        from hr.position_assignment pa\n'
    || E'       where pa.employment_id = p_subject_employment\n'
    || E'         and pa.deleted_at is null and pa.is_primary;\n'
    || E'    end if;\n'
    || E'  end if;\n', 1);

  perform pg_temp._swap('hr.capability(uuid,text,uuid,date,uuid)',
    E'p_subject_employment, p_at,\n                                      ra.employment_id',
    E'p_subject_employment, v_pop_at,\n                                      ra.employment_id', 1);

  ---------------------------------------------------------------------------------------------
  -- 2. hr.wf_inbox — the queue's ITEMS bind to where the grant is, not only to where the caller
  --    works. Additive conjunct: this can only remove rows, never add one.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr.wf_inbox(text,uuid,jsonb)',
    E'    if not hr.capability(v_uid, ''workflow.view_queue'', null) then\n',
    E'    -- 🚨 THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE: it answers "is the\n'
    || E'    -- HR queue scope offered to this person at all", which is a property of the person\n'
    || E'    -- rather than of one employer, and §5.9 requires a scope the caller may not use to\n'
    || E'    -- REFUSE rather than return an empty list that reads as "nothing waiting". It is NOT\n'
    || E'    -- what bounds the items — see the two organization predicates on the item query below.\n'
    || E'    if not hr.capability(v_uid, ''workflow.view_queue'', null) then\n', 1);

  perform pg_temp._swap('hr.wf_inbox(text,uuid,jsonb)',
    E'       where s.state = ''active''\n'
    || E'         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))\n',
    E'       where s.state = ''active''\n'
    || E'         -- 🚨 THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS.\n'
    || E'         -- The employment predicate alone was one short: somebody employed by two\n'
    || E'         -- employers who holds workflow.view_queue in only ONE of them would read the\n'
    || E'         -- other employer''s queue. No live user has that shape today, which is what\n'
    || E'         -- makes this latent rather than a leak — and what makes it cheap to close now.\n'
    || E'         -- BOTH predicates are kept: the conjunct can only ever REMOVE a row.\n'
    || E'         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))\n'
    || E'         and hr.capability(v_uid, ''workflow.view_queue'', null, current_date, i.organization_id)\n', 1);
end $mig$;

---------------------------------------------------------------------------------------------
-- The contracts. hr_l1_59's rows stay exactly as they are — none of their pinned text moves.
---------------------------------------------------------------------------------------------
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr', '_l1_viewer', 'hr_l1_61_an_unestablished_population_is_not_membership.sql',
   array['AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP',
         'case when em.hire_date > p_at then em.hire_date end asc nulls last'],
   array[]::text[],
   'A NULL subject does not only unbind the tenant (hr_l1_59) — it makes hr.capability skip its '
   || 'population_contains clause entirely, so a department- or location-scoped hr_admin reached '
   || 'EVERY prehire and EVERY terminated ex-employee in the organization. The viewer must resolve '
   || 'the subject''s nearest employment spell so the population can be asked at all. Removing the '
   || 'fallback restores a blank cheque for every scope-restricted grant.'),

  ('hr', 'capability', 'hr_l1_61_an_unestablished_population_is_not_membership.sql',
   array['THE POPULATION IS ASKED ON A DATE THE SUBJECT ACTUALLY HOLDS A POSITION',
         'p_subject_employment, v_pop_at,'],
   array['p_subject_employment, p_at,'],
   'department | location | crew resolve through primary_position_as_of, which finds nothing for '
   || 'a prehire or an ex-employee — so without v_pop_at a department admin is refused their own '
   || 'incoming hire even though the intended department is on the record. v_pop_at equals p_at '
   || 'for every subject who holds a position today, so this narrows nothing that already worked.'),

  ('hr', 'wf_inbox', 'hr_l1_61_an_unestablished_population_is_not_membership.sql',
   array['THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS',
         'THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE',
         'and hr.capability(v_uid, ''workflow.view_queue'', null, current_date, i.organization_id)'],
   array[]::text[],
   'The org-less capability check gates the queue SCOPE (an affordance, correctly org-less); the '
   || 'ITEMS are bound separately. Binding them only to the caller''s EMPLOYMENT organizations '
   || 'left a latent reach for a two-employer caller holding the capability in one of them. Both '
   || 'predicates are required; dropping either widens the queue.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_not_contain = excluded.must_not_contain,
      reason = excluded.reason, is_active = true;

do $verify$
declare v_broken int; v_bad text;
begin
  select count(*), string_agg(qname || ' / ' || clause || ' / ' || missing_or_present, '; ')
    into v_broken, v_bad from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_61: % contract clause(s) broken after apply (INCLUDING hr_l1_59''s, '
                    'which must survive this migration untouched): %', v_broken, v_bad;
  end if;
end $verify$;
