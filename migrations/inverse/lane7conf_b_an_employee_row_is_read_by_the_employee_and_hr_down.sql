-- inverse of lane7conf_b_an_employee_row_is_read_by_the_employee_and_hr.sql — removes the one policy.
-- window-class: one DROP POLICY on hr.employee (ACCESS EXCLUSIVE + sign-in freeze, milliseconds).
set local lock_timeout = '3s';
DROP POLICY IF EXISTS hr_employee_confidential_readers ON hr.employee;
