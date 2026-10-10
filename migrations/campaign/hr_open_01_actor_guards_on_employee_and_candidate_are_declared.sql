-- lane: HR-SCHEMA-OPEN
--
-- hr_open_01 — THE ACTOR GUARDS ON hr.employee AND hr.candidate ARE DECLARED, NOT CHANGED.
-- (Wave X exposure gate, database-estate-reduction PUBLIC-PLACEMENT.md §2.1.)
--
-- The certifier failed exactly two hr relations (whole-schema verify_canonical sweep over every
-- relation granted to `authenticated`, 2026-10-10): hr.employee and hr.candidate, each for two
-- RESTRICTIVE insert/update policies that iam.apply_rls did not author:
--   hr.employee  employee_login_user_id_is_addressable_insert / _update
--   hr.candidate candidate_actor_user_id_is_the_caller_insert / _update
-- They are product rules (a write may only name a login the writer may address / only stamp
-- yourself as the actor) and RESTRICTIVE, so they only narrow. Their siblings hr.eeo_response and
-- hr.reference_check carry the identical candidate-shaped guard and were declared on 2026-10-07 in
-- meta.audit_exemption (check_name 'bespoke_policy_present', estate-reduction orchestrator
-- ruling 1). This file declares these four the same way, fingerprinted exactly as
-- iam.verify_canonical computes it, so a later edit of any policy fails certification again.
--
-- No policy, grant, table or function changes. Every write path that works today works the same.
-- Inverse: migrations/inverse/hr_open_01_actor_guards_on_employee_and_candidate_are_declared_down.sql

insert into meta.audit_exemption (check_name, schema_name, table_name, reason, organization_id, metadata)
select 'bespoke_policy_present', 'hr', t.tbl,
       'Hand-written policies encode product rules (staff-only writes, self-only actor checks, org-admin writes, public follows, own log lines, vault sharing, row history); they stay as written (estate-reduction orchestrator ruling 2026-10-07). Honoured only while each policy keeps its fingerprint.',
       '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       jsonb_build_object('ruling', 'estate reduction orchestrator ruling 1, 2026-10-07; applied to hr by lane HR-SCHEMA-OPEN 2026-10-10 (Wave X)',
                          'policies', (select jsonb_object_agg(p.polname::text,
                              md5(concat_ws('|', p.polcmd::text, p.polpermissive::text, p.polroles::regrole[]::text,
                                  coalesce(pg_get_expr(p.polqual, p.polrelid), '-'), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-'))))
                             from pg_policy p
                            where p.polrelid = format('hr.%I', t.tbl)::regclass and p.polname = any (t.pols)))
  from (values
    ('employee',  array['employee_login_user_id_is_addressable_insert', 'employee_login_user_id_is_addressable_update']::name[]),
    ('candidate', array['candidate_actor_user_id_is_the_caller_insert', 'candidate_actor_user_id_is_the_caller_update']::name[])
  ) t(tbl, pols)
 where not exists (select 1 from meta.audit_exemption e
                    where e.check_name = 'bespoke_policy_present' and e.schema_name = 'hr' and e.table_name = t.tbl);

do $chk$
begin
  if (select count(*) from meta.audit_exemption e
       where e.check_name = 'bespoke_policy_present' and e.schema_name = 'hr' and e.table_name in ('employee', 'candidate')
         and (select count(*) from jsonb_object_keys(e.metadata -> 'policies')) = 2) <> 2 then
    raise exception 'hr_open_01: expected two declarations with two fingerprinted policies each';
  end if;
end $chk$;
