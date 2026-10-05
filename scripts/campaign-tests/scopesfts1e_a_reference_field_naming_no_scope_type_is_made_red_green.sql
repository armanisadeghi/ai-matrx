-- FTS-1e (lane FINISH-THE-SWITCH) — A REFERENCE FIELD THAT NAMES NO SCOPE TYPE IS MADE (it points at any scope); measured
-- RED then GREEN on live, rolled back (migrations/campaign/scopesfts1e_a_reference_field_naming_no_scope_type_is_made.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds "Preferred clinic" to Referring Physicians as a reference to a scope
-- without choosing which kind; it is made, and Dr. Maya Ellison's preferred clinic saves and is found by the clinic.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization: F1 custom.context_item_write
-- makes the field (RED before: "cannot get array length of a scalar"); F2 a scope reference saves on it; F3
-- public.list_context_value_refs finds it by the clinic. Run inside begin; …; rollback.

do $suite$
declare
  r record; t1 uuid; i1 uuid; dr uuid; clinic uuid; a jsonb; red text[] := '{}';
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Referring Physician","label_plural":"Referring Physicians"}') -> 'row' ->> 'id')::uuid;
    begin
      i1 := (custom.context_item_write(null, t1, '{"key":"preferred_clinic","display_name":"Preferred clinic","value_type":"reference","allowed_reference_types":["scope"]}') -> 'row' ->> 'id')::uuid;
    exception when others then red := red || (r.who || ' F1: ' || sqlerrm); i1 := null;
    end;
    if i1 is not null then
      dr := (custom.context_scope_write(r.org, null, t1, '{"name":"Dr. Maya Ellison"}') -> 'row' ->> 'id')::uuid;
      clinic := (custom.context_scope_write(r.org, null, t1, '{"name":"Knee Clinic North"}') -> 'row' ->> 'id')::uuid;
      a := custom.context_value_write(jsonb_build_object('context_item_id', i1, 'scope_id', dr, 'source_type', 'manual',
             'value_text', '```matrx' || chr(10) || jsonb_build_object('__kind', 'directive_v1_reference_scope',
               'items', jsonb_build_array(jsonb_build_object('id', clinic, 'label', 'Knee Clinic North')))::text || chr(10) || '```'));
      if (a ->> 'ok') is distinct from 'true' then red := red || (r.who || ' F2: ' || left(a::text, 200)); end if;
      a := public.list_context_value_refs('scope', clinic::text);
      if not exists (select 1 from jsonb_array_elements(a) e where e ->> 'scope_id' = dr::text and e ->> 'item_key' = 'preferred_clinic') then
        red := red || (r.who || ' F3: ' || left(a::text, 200));
      end if;
    end if;
    perform set_config('role', 'none', true);
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: F1-F3 for admin and test@test.com';
end $suite$;
