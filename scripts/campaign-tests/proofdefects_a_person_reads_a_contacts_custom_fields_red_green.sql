-- LANE PROOF-DEFECTS (D1) — A SIGNED-IN PERSON READS A CRM CONTACT'S CUSTOM FIELDS, measured RED
-- then GREEN on the dev clone. One transaction, rolled back.
--
-- THE USE CASE. admin@admin.com (an ordinary signed-in person here: not a platform admin) opens
-- the CRM contact Jordan Reyes in Castellano & Reyes. The Custom fields section calls
-- custom.entity_record_read(org, 'party', id). RED before
-- proofdefects_a_standard_tables_registry_row_is_read_by_the_door.sql: 23514 "There is no table
-- called "party" in this system" (the registry lookup ran as the person, and the registry is
-- readable only by platform admins). GREEN: the door answers with the contact's token and fields.
begin;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_org uuid; v_id uuid := '390b9585-9c8e-4351-be97-ddb8c3dd1af8'; r jsonb;
begin
  select organization_id into v_org from crm.party where id = v_id;
  if v_org is null then raise exception 'FIXTURE: the person cannot open Jordan Reyes on this database'; end if;
  r := custom.entity_record_read(v_org, 'party', v_id);
  if r ->> 'token' is distinct from 'party' or (r ->> 'id')::uuid is distinct from v_id then
    raise exception 'RED: the door answered the wrong record (%)', left(r::text, 300);
  end if;
  raise notice 'GREEN: % % fields', r ->> 'label', jsonb_array_length(r -> 'fields');
end $$;
rollback;
select 'GREEN' as result;
