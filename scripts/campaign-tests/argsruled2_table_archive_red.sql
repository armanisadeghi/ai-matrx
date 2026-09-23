-- ARGS-RULED-2 — RED TWIN of argsruled2_table_archive_green.sql. Inside ONE rolled-back
-- transaction it runs the INVERSE (custom.table_archive's pre-fix body), builds the same Willow
-- Creek Veterinary Clinic world from the owner's seat, and REQUIRES the defect back: the preview
-- (p_chunk 0) archives the empty Boarding Kennel Waitlist and says it "is already archived".

\set suite 'argsruled2_table_archive_red.sql'
\set requires 'function:custom.table_archive|function:custom.record_delete|relation:custom.record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
\i migrations/inverse/argsruled2_an_empty_table_is_told_what_happened_to_it_down.sql

do $$
declare
  c_owner uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_boss  text := current_user;
  v_clinic uuid; v_waitlist uuid; v_intake uuid;
  v_res jsonb; v_live boolean;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_table_archive_red', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-archivered', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_owner, 'owner', 'active');
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Boarding Kennel Waitlist'), c_owner, c_owner)
  returning id into v_waitlist;
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Canine Dental Intake'), c_owner, c_owner)
  returning id into v_intake;
  insert into custom.record (organization_id, table_id, data_class, data, created_by, updated_by)
  values (v_clinic, v_intake, 'record', '{}'::jsonb, c_owner, c_owner);

  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_owner then
    raise exception '0: not in the owner''s seat';
  end if;

  -- ══ RED · on the pre-fix body the preview archives the empty Table and says it was already archived ══
  v_res := custom.table_archive(v_clinic, v_waitlist, 0, true);
  perform set_config('role', v_boss, true);
  select deleted_at is null into v_live from custom.record where organization_id = v_clinic and id = v_waitlist;
  if v_live or v_res ->> 'message' not like '%is already archived. Nothing was changed.%' then
    raise exception 'RED: with the pre-fix body back, the preview did NOT archive the empty Table under a false sentence (live %, %) — the green suite proves nothing', v_live, v_res;
  end if;
  raise notice 'argsruled2_table_archive_red: on the pre-fix body the PREVIEW archives an empty Table and answers "already archived. Nothing was changed." — the green suite can fail';
end $$;

rollback;
