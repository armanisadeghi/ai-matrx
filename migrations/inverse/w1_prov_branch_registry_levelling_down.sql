-- chair-step: removing the provisioner's registry rows disables every refusal message, the parity rule and the spec's JSON schema at once, so it is never an additive change and never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_registry_levelling.sql` (§4.13).
--
-- HEADER-LESS ON PURPOSE: a DELETE is refused by the allow-list in every lane; the one
-- route is a header-less chair step, rehearsed on the branch with `--target branch`.
--
-- 🚨 IT REFUSES ON PRODUCTION. These rows are production's own — the file that seeded the
-- branch copied them FROM there — so running this inverse against production would delete
-- the live provisioner's refusal table, its parity list and its JSON schema. The assertion
-- below is on the cluster's own control-file identity, which does not move.

set lock_timeout = '2s';
set statement_timeout = '120s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These rows are production''s own; '
      'the branch copied them from here. This inverse exists to undo the BRANCH copy only.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

delete from platform.provision_schema where name in ('full','restricted');
delete from platform.provision_generate_target;
delete from platform.provision_rule_message;
