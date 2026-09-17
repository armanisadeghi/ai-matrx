-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_prov_closed_declares_custom_closed.sql`: it removes the
-- one declaration row, which returns schema `custom` to the platform's historical answer
-- (exposed, because a schema with no registry row is exposed) and therefore returns the
-- provisioner to exactly the behaviour the RED probe measured. `-- target: branch`: it DELETEs,
-- and rule 9 forbids that on production.

set lock_timeout = '5s';
set statement_timeout = '600s';

delete from platform.schema_client_exposure where schema_name = 'custom';
