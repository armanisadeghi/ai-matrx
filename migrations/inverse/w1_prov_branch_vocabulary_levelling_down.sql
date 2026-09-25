-- chair-step: deleting platform.provision_vocabulary makes every vocabulary refusal RAISE instead of validating, and deleting platform.stamped_write_table re-opens client writes on the tables it protects; never additive, never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_vocabulary_levelling.sql` (§4.13).

set lock_timeout = '2s';
set statement_timeout = '120s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These rows are production''s own.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

delete from platform.provision_vocabulary;
delete from platform.stamped_write_table where declared_by = 'DD-248 / B-139';
