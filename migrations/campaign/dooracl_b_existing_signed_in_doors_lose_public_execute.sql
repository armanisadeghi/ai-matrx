-- chair-step: normalize the existing declared custom doors with the registry-backed closed-schema sweep
-- lock: custom,platform
-- based-on: platform.reopen_declared_doors(text) 7c5786d5f7613eb860326adc7ebe0846ab2d6dc318e383a4ad69947ab5a6c3ab
--
-- Policy-only half of DOORACL. The normalized sweep repairs the three wrappers
-- tablenames_a recreated. It retains all currently reachable signed-in/server
-- roles and removes PUBLIC and anon. The proof is deliberately in the next
-- non-policy transaction so the policy freeze remains as short as possible.

set local statement_timeout = '60s';

select * from platform.reopen_declared_doors('custom');
