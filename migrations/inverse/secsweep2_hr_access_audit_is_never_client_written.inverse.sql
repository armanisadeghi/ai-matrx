-- chair-step: re-opens a client write door on the HR access audit, which would let a client
-- write a record saying somebody else looked at an employee's file.

drop policy if exists access_audit_client_insert_refused on hr.access_audit;
drop policy if exists access_audit_client_update_refused on hr.access_audit;
