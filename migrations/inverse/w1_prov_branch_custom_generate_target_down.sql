-- chair-step: deleting a platform.provision_generate_target row makes its schema unprovisionable by name; never additive, never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_custom_generate_target.sql` (§4.13).

set lock_timeout = '2s';
set statement_timeout = '120s';

delete from platform.provision_generate_target
 where schema_name = 'custom'
   and published_by like 'W1-PROV rehearsal fixture%';
