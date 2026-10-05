-- FTS-1i (lane FINISH-THE-SWITCH) — A SCOPE TYPE WITH A REFERENCE FIELD COMES BACK FROM THE ARCHIVE WITH ITS FIELDS, SCOPES
-- AND VALUES; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1i_a_type_restores_its_fields_before_its_scopes.sql).
--
-- THE USE CASE. A clinic keeps "Treatment Programs" with a "Home exercise plan" text field and an "Intake referral note"
-- field pointing at a Note; the "Knee rehab 6-week plan" holds both. The type is archived, then restored from the
-- Archived panel: before the fix the restore answered 409 "there is no field in this organization" (23503), because the
-- scope came back (reviving its reference edge in platform.associations, checked against its field) before the fields.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization: R1 custom.context_type_restore
-- succeeds; R2 the type, both fields and the scope are live; R3 the scope keeps both values; R4 the reference edge to the
-- note is live again. T1 (same effect) a type with only a text field archives and restores with its scope and value.
-- Run inside begin; …; rollback.

do $suite$
declare
  r record; t1 uuid; t2 uuid; f_txt uuid; f_ref uuid; f2 uuid; s1 uuid; s2 uuid; n uuid; a jsonb; red text[] := '{}';
  v_ref jsonb; v_txt text;
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into workbench.notes (label, organization_id) values ('Intake referral from Dr. Lena Ortiz', r.org) returning id into n;

    -- the reference case
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Treatment Program","label_plural":"Treatment Programs"}') -> 'row' ->> 'id')::uuid;
    f_txt := (custom.context_item_write(null, t1, '{"key":"home_exercise_plan","display_name":"Home exercise plan","value_type":"text"}') -> 'row' ->> 'id')::uuid;
    f_ref := (custom.context_item_write(null, t1, '{"key":"intake_referral_note","display_name":"Intake referral note","value_type":"reference","allowed_reference_types":["note"]}') -> 'row' ->> 'id')::uuid;
    s1 := (custom.context_scope_write(r.org, null, t1, '{"name":"Knee rehab 6-week plan"}') -> 'row' ->> 'id')::uuid;
    perform custom.context_value_write(jsonb_build_object('context_item_id', f_txt, 'scope_id', s1, 'source_type', 'manual',
              'value_text', 'Quad sets and heel slides twice daily'));
    perform custom.context_value_write(jsonb_build_object('context_item_id', f_ref, 'scope_id', s1, 'source_type', 'manual',
              'value_text', '```matrx' || chr(10) || jsonb_build_object('__kind', 'directive_v1_reference_note',
                'items', jsonb_build_array(jsonb_build_object('id', n, 'label', 'Intake referral from Dr. Lena Ortiz')))::text || chr(10) || '```'));
    perform custom.context_type_archive(t1);
    begin
      perform custom.context_type_restore(t1);
    exception when others then red := red || (r.who || ' R1: ' || sqlstate || ' ' || sqlerrm);
    end;
    perform set_config('role', 'none', true);
    if (select count(*) from custom.record where id in (t1, f_txt, f_ref, s1) and deleted_at is null) <> 4 then
      red := red || (r.who || ' R2: ' || (select count(*) from custom.record where id in (t1, f_txt, f_ref, s1) and deleted_at is null) || '/4 live');
    end if;
    select data -> 'intake_referral_note', data ->> 'home_exercise_plan' into v_ref, v_txt from custom.record where id = s1;
    if v_txt is distinct from 'Quad sets and heel slides twice daily' or v_ref -> 0 ->> 'id' is distinct from n::text then
      red := red || (r.who || ' R3: ' || coalesce(v_txt, 'null') || ' ' || coalesce(v_ref::text, 'null'));
    end if;
    if not exists (select 1 from platform.associations where source_id = s1 and target_id = n and relation_field_id = f_ref and deleted_at is null) then
      red := red || (r.who || ' R4: reference edge not live');
    end if;

    -- same effect: a type without a reference field
    perform set_config('role', 'authenticated', true);
    t2 := (custom.context_type_write(r.org, null, '{"label_singular":"Clinic Site","label_plural":"Clinic Sites"}') -> 'row' ->> 'id')::uuid;
    f2 := (custom.context_item_write(null, t2, '{"key":"parking_notes","display_name":"Parking notes","value_type":"text"}') -> 'row' ->> 'id')::uuid;
    s2 := (custom.context_scope_write(r.org, null, t2, '{"name":"Downtown"}') -> 'row' ->> 'id')::uuid;
    perform custom.context_value_write(jsonb_build_object('context_item_id', f2, 'scope_id', s2, 'source_type', 'manual',
              'value_text', 'Garage on Elm, level 2'));
    perform custom.context_type_archive(t2);
    begin
      perform custom.context_type_restore(t2);
    exception when others then red := red || (r.who || ' T1: ' || sqlstate || ' ' || sqlerrm);
    end;
    perform set_config('role', 'none', true);
    if (select count(*) from custom.record where id in (t2, f2, s2) and deleted_at is null) <> 3
       or (select data ->> 'parking_notes' from custom.record where id = s2) is distinct from 'Garage on Elm, level 2' then
      red := red || (r.who || ' T1: not all back');
    end if;
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: R1-R4 and T1 for admin and test@test.com';
end $suite$;
