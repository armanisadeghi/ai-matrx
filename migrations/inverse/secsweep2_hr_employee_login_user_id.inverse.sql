-- chair-step: withdraws the SECURITY-SWEEP-2 addressability check on
-- hr.employee.login_user_id, which re-opens the column to a client naming anybody at all.

drop policy if exists "employee_login_user_id_is_addressable_insert" on hr.employee;
drop policy if exists "employee_login_user_id_is_addressable_update" on hr.employee;
