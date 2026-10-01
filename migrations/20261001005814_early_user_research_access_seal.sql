-- Separate short transaction from the declaration; do not hold sign-in locks during provision.
set lock_timeout = '3s';
set statement_timeout = '60s';
select platform.provision_attach_base_contract('crm.party_research');
