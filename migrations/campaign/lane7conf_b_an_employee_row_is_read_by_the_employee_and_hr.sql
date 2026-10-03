-- draft: lane7 confidential split — rehearsal + guard pending
-- chair-step: NEEDS ARMAN WATCHING — ONE POLICY, ALONE IN ITS TRANSACTION. Adds the restrictive SELECT
-- policy hr_employee_confidential_readers on hr.employee (41 rows). Lock: CREATE POLICY takes ACCESS
-- EXCLUSIVE on hr.employee and Supabase's sign-in freeze (measured 206 ms on the clone; over the 200 ms
-- ceiling, so it waits for the window). Needs lane7conf_a first (it defines hr.employee_row_reader).
-- Inverse: migrations/inverse/lane7conf_b_an_employee_row_is_read_by_the_employee_and_hr_down.sql
-- lane: STANDARD-TABLES (lane 7)
-- lock: platform
-- window-class: one restrictive SELECT policy on hr.employee.
--
-- LANE 7 · CONFIDENTIAL SPLIT (b) — AN EMPLOYEE ROW IS READ BY THE EMPLOYEE AND HR.
-- A client reaches an hr.employee row only when hr.employee_row_reader(id) is true: the employee (login
-- account), an HR admin (hr._l1_viewer 'self' / 'hr_admin': identity.read or working_record.write), or
-- the platform admin lane the table already had. Restrictive, so it narrows every permissive lane
-- (creator, organization member on 'personal' rows, grants) without replacing the generated set;
-- iam.apply_rls keeps it (not in iam.generated_policy_names()). HR's own doors run as the owner and are
-- unchanged: a colleague's directory card (hr_directory_list, hr_employee_profile viewer = peer) still
-- opens; invoker doors (custom.entity_record_read, records_find, record_home) answer fewer rows.
--
-- RED before, GREEN after: scripts/campaign-tests/lane7conf_member_reads_no_confidential_fact.mjs
set local lock_timeout = '3s';
DROP POLICY IF EXISTS hr_employee_confidential_readers ON hr.employee;
CREATE POLICY hr_employee_confidential_readers ON hr.employee
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (hr.employee_row_reader(id));
