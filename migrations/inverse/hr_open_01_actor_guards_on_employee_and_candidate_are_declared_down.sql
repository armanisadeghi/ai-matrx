-- chair-step: lane HR-SCHEMA-OPEN. Removes the two meta.audit_exemption declarations hr_open_01 added (hr.employee, hr.candidate). No policy, grant or data row of the HR tables changes; certification of those two tables fails again.
delete from meta.audit_exemption
 where check_name = 'bespoke_policy_present' and schema_name = 'hr' and table_name in ('employee', 'candidate')
   and metadata ->> 'ruling' like '%lane HR-SCHEMA-OPEN%';
