-- hr_l1_62_a_scoped_grant_gets_a_scoped_queue.sql
--
-- 🚨 THE THIRD RULING: A DEPARTMENT-SCOPED GRANT OPENED THE WHOLE ORGANIZATION'S QUEUE.
--
-- hr_l1_61 bound the queue's items to the organization where the grant lives. It left the
-- POPULATION unasked, so a department-scoped hr_admin — who legitimately has a queue — read
-- workflow items about every person in the employer, including people who were never theirs.
-- The same disclosure hr_l1_61 closed one rung down for subject reads, still open one rung up.
--
-- 🚨 AND THE DOCUMENTED RULE DOES NOT MOVE. `hr._punch_capability` states the org-rung form —
-- "the role must be in this org", not "the role must be org-scoped" — and that is about the
-- AFFORDANCE: may I open a queue at all. It stays exactly as written, and the gate above the item
-- query keeps its org-less shape. What never followed from it is that the queue's CONTENTS are
-- org-wide. SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE.
--
-- THE WHOLE FIX IS ONE ARGUMENT, AND DELIBERATELY SO:
--     hr.capability(v_uid, 'workflow.view_queue', null,                    current_date, i.organization_id)
--  →  hr.capability(v_uid, 'workflow.view_queue', i.subject_employment_id, current_date, i.organization_id)
-- The item asks THE SAME PREDICATE the subject doors ask, about the person the item is about.
-- Nothing is re-derived here: a second implementation of the population rule would drift from
-- hr.capability on the first change, which is this program's most-repeated lesson. It also means
-- hr_l1_61's `v_pop_at` carries straight through, so a prehire's and an ex-employee's items
-- RESOLVE to their intended / last-held department instead of vanishing.
--
--   org-scoped grant        → population_contains('org') is true → queue UNCHANGED
--   department-scoped grant → items about that department only, prehires and leavers included
--   instance with NO subject→ nothing to evaluate → stays on the affordance rung, still visible
--
-- 🚨 THAT LAST LINE IS A DELIBERATE ASYMMETRY WITH THE SUBJECT DOORS, AND IT IS THE RIGHT WAY
-- ROUND. A subject read with an unestablished population fails CLOSED (hr_l1_61) because the cost
-- of being wrong is disclosure. A work item with no subject at all has no population to be wrong
-- about, and failing it closed would stranded it — nobody but an org-scoped admin could ever pick
-- it up, which is `unactionable_no_reach` rebuilt on purpose. Measured before shipping: every
-- active workflow instance on the system carries a subject, and no active item loses its last
-- viewer under the new predicate (viewers before == viewers after, per item).
--
-- Applied live 2026-08-29 and double-ledgered. Falsified three ways through PostgREST.

do $mig$
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_inbox')
     ~ 'SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE' then
    raise notice 'hr_l1_62: already applied';
    return;
  end if;

  create or replace function pg_temp._swap(p_fn text, p_old text, p_new text, p_expect int)
  returns void language plpgsql as $swap$
  declare v_def text; v_cnt int;
  begin
    v_def := pg_get_functiondef(p_fn::regprocedure);
    v_cnt := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
    if v_cnt <> p_expect then
      raise exception 'hr_l1_62: % — expected % occurrence(s) of the anchor, found %. REFUSING to '
                      'guess at a body that has moved underneath this migration.',
                      p_fn, p_expect, v_cnt;
    end if;
    execute replace(v_def, p_old, p_new);
  end $swap$;

  perform pg_temp._swap('hr.wf_inbox(text,uuid,jsonb)',
    E'         -- BOTH predicates are kept: the conjunct can only ever REMOVE a row.\n'
    || E'         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))\n'
    || E'         and hr.capability(v_uid, ''workflow.view_queue'', null, current_date, i.organization_id)\n',
    E'         -- BOTH predicates are kept: the conjunct can only ever REMOVE a row.\n'
    || E'         --\n'
    || E'         -- 🚨 AND SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE (hr_l1_62). The\n'
    || E'         -- gate above answers "may this person open a queue at all" and is org-less on\n'
    || E'         -- purpose; it never followed that the CONTENTS are org-wide. A department-scoped\n'
    || E'         -- admin was reading items about every person in the employer. Passing the item''s\n'
    || E'         -- own subject asks THE SAME PREDICATE the subject doors ask — never a second copy\n'
    || E'         -- of the population rule, which would drift on the first change — and hr_l1_61''s\n'
    || E'         -- v_pop_at carries through it, so a prehire''s and a leaver''s items resolve to\n'
    || E'         -- their intended / last-held department instead of vanishing.\n'
    || E'         --\n'
    || E'         -- An instance with NO subject has no population to evaluate, so it stays on the\n'
    || E'         -- affordance rung and remains visible. That is the OPPOSITE of the subject doors''\n'
    || E'         -- fail-closed rule, and deliberately: a read with an unestablished population\n'
    || E'         -- risks disclosure, but a WORK ITEM nobody can see is stranded work — this is\n'
    || E'         -- exactly the unactionable_no_reach failure, and it is not rebuilt here.\n'
    || E'         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))\n'
    || E'         and hr.capability(v_uid, ''workflow.view_queue'', i.subject_employment_id,\n'
    || E'                           current_date, i.organization_id)\n', 1);
end $mig$;

---------------------------------------------------------------------------------------------
-- hr_l1_61 pinned the NULL-subject form of this call. That form is exactly what this migration
-- replaces, so its clause is retired here rather than left to fail — the rest of hr_l1_61's
-- wf_inbox contract (both comment anchors) still holds and is untouched.
---------------------------------------------------------------------------------------------
update hr.function_contract
   set must_contain = array['THE ITEMS BIND TO WHERE THE GRANT IS, NOT ONLY TO WHERE THE CALLER WORKS',
                            'THIS CHECK IS AN AFFORDANCE GATE AND IS ORG-LESS ON PURPOSE']
 where home_migration = 'hr_l1_61_an_unestablished_population_is_not_membership.sql'
   and schema_name = 'hr' and function_name = 'wf_inbox';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr', 'wf_inbox', 'hr_l1_62_a_scoped_grant_gets_a_scoped_queue.sql',
   array['SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE',
         'hr.capability(v_uid, ''workflow.view_queue'', i.subject_employment_id,'],
   array['hr.capability(v_uid, ''workflow.view_queue'', null, current_date, i.organization_id)'],
   'A department-scoped grant opened the WHOLE organization''s queue: the items were bound to the '
   || 'grant''s organization (hr_l1_61) but not to its population. The item must ask the same '
   || 'capability predicate the subject doors ask, about its own subject — passing null there '
   || 'restores an org-wide queue for every scope-restricted grant. Never re-derive the population '
   || 'rule here: one rule, one implementation.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_not_contain = excluded.must_not_contain,
      reason = excluded.reason, is_active = true;

do $verify$
declare v_broken int; v_bad text;
begin
  select count(*), string_agg(qname || ' / ' || clause || ' / ' || missing_or_present, '; ')
    into v_broken, v_bad from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_62: % contract clause(s) broken after apply (including every earlier '
                    'migration''s, which must survive this one): %', v_broken, v_bad;
  end if;
end $verify$;
