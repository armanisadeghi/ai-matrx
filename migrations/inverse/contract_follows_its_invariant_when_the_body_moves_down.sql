-- chair-step: restores the pre-hr_l3_121 spelling of three hr.function_contract rows and
-- deactivates the two rows hr_l3_121 added. It writes DATA only -- no DDL, no DROP, no grant.
-- Running it deliberately returns check:hr-punch-write-path:strict to RED with eight broken
-- clauses, which is the defect this inverse exists to put back.

-- INVERSE of hr_l3_121. Puts the three contract rows back the way hr_l1_42 and hr_l3_111
-- spelled them, and deactivates the two rows hr_l3_121 added.
--
-- ground-standing-ok: a b c d
--   (a) drops no function, so no trigger is left over a missing body.
--   (b) calls nothing a sibling inverse takes away.
--   (c) restores no body: this file touches DATA in hr.function_contract only.
--   (d) removes no object a later migration adopted -- the two rows it deactivates are
--       hr_l3_121's own, keyed by home_migration = 'hr_l3_121'.
--
-- HONESTY NOTE, because an inverse that lies is worse than none: running this file
-- restores the EXACT pre-hr_l3_121 contract state, which is the state in which
-- check:hr-punch-write-path:strict is RED with eight broken clauses. That is the defect
-- put back, which is what an inverse is for.


update hr.function_contract
   set must_contain = array['''signup''', '''promotion''', '''backfill''', '''reconcile''', '''hr.employee_create'''],
       reason = regexp_replace(reason, ' \|\| hr_l3_121 \(2026-09-22\).*$', '')
 where schema_name = 'crm'
   and function_name = 'ensure_user_party'
   and home_migration = 'hr_l1_42_register_the_hr_source.sql';

update hr.function_contract
   set must_contain = array['?org=', 'inst.organization_id::text'],
       reason = regexp_replace(reason, ' \|\| hr_l3_121 \(2026-09-22\).*$', '')
 where schema_name = 'hr'
   and function_name = '_wf_notify'
   and home_migration = 'hr_l3_111';

update hr.function_contract
   set must_contain = array['?org=', 'p_organization_id::text'],
       reason = regexp_replace(reason, ' \|\| hr_l3_121 \(2026-09-22\).*$', '')
 where schema_name = 'hr'
   and function_name = '_punch_notify_edited'
   and home_migration = 'hr_l3_111';

update hr.function_contract
   set is_active = false
 where home_migration = 'hr_l3_121';

