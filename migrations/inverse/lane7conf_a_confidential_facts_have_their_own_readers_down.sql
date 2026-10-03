-- inverse of lane7conf_a_confidential_facts_have_their_own_readers.sql. Puts every confidential value
-- back on crm.party (nothing is lost), then removes the trigger, the policy, the doors, the knob,
-- the registry row and the split table. Re-base before use if a later file replaced any of these.
set local lock_timeout = '3s';
DROP POLICY IF EXISTS hr_employee_confidential_readers ON hr.employee;
DELETE FROM platform.client_callable_door
 WHERE (schema_name, function_name) IN (('crm','party_confidential_level'), ('public','crm_party_confidential_read'), ('public','crm_party_confidential_write'), ('hr','employee_row_reader'));
DROP FUNCTION IF EXISTS hr.employee_row_reader(uuid);
DROP TRIGGER IF EXISTS _zz_party_confidential_moves_aside ON crm.party;
DROP FUNCTION IF EXISTS crm._party_confidential_moves_aside();
DO $$
begin
  if to_regclass('crm.party_confidential') is not null then
    update crm.party p
       set tax_id = coalesce(c.tax_id, p.tax_id), date_of_birth = coalesce(c.date_of_birth, p.date_of_birth)
      from crm.party_confidential c
     where c.party_id = p.id and (c.tax_id is not null or c.date_of_birth is not null);
  end if;
end $$;
DROP FUNCTION IF EXISTS public.crm_party_confidential_write(uuid, jsonb);
DROP FUNCTION IF EXISTS public.crm_party_confidential_read(uuid[]);
DROP FUNCTION IF EXISTS crm.party_confidential_level(uuid, uuid, uuid, uuid);
DELETE FROM platform.entity_types WHERE token = 'party_confidential';
DROP TABLE IF EXISTS crm.party_confidential;
DELETE FROM platform.feature_knob WHERE feature = 'crm' AND key = 'party_confidential_readers';
