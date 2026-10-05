-- FTS-1g (lane FINISH-THE-SWITCH) — THE SCOPE-SYSTEM TOOL, TAGGING AND THE COMPARE READ THE STORE
-- (migrations/campaign/scopesfts1g_the_last_scope_readers_read_the_store.sql). RED before (each read the old rows the
-- doors stopped writing at 07:03Z: new rows answered null / were not found), GREEN after. Run inside begin; …; rollback.
--
-- THE USE CASE. An agent in Cedar Ridge Physical Therapy (admin@admin.com) and one in test@test.com's own organization
-- add a "Referral Source" type with a "Fax Number" field and the scope "Dr. Okafor's Clinic", set its fax number,
-- rename it by key, read the organization back, tag one scope with another, then archive all three.
do $suite$
declare
  r record; a jsonb; i jsonb; red text[] := '{}'; s1 uuid; s2 uuid; f1 uuid;
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    a := public.scope_system_apply(r.org, '[
      {"op":"upsert_scope_type","key":"referral-source","label_singular":"Referral Source"},
      {"op":"upsert_context_item","scope_type_key":"referral-source","key":"fax_number","display_name":"Fax Number","value_type":"string"},
      {"op":"upsert_scope","scope_type_key":"referral-source","key":"okafor-clinic","name":"Dr. Okafor''s Clinic"},
      {"op":"upsert_scope","scope_type_key":"referral-source","key":"harbor-sports-med","name":"Harbor Sports Medicine"},
      {"op":"set_value","scope_key":"okafor-clinic","item_key":"fax_number","value":"(949) 555-0142"},
      {"op":"upsert_scope","scope_type_key":"referral-source","key":"okafor-clinic","name":"Okafor Clinic Group"}]'::jsonb);
    if exists (select 1 from jsonb_array_elements(a -> 'results') x where x -> 'record' is null or jsonb_typeof(x -> 'record') = 'null') then
      red := red || (r.who || ' A1 a result answered no record: ' || left(a::text, 400));
    end if;
    if a #>> '{results,5,record,name}' is distinct from 'Okafor Clinic Group' then
      red := red || (r.who || ' A2 rename by key: ' || coalesce(a #>> '{results,5,record,name}', 'null'));
    end if;
    s1 := (a #>> '{results,2,id}')::uuid; s2 := (a #>> '{results,3,id}')::uuid; f1 := (a #>> '{results,1,id}')::uuid;
    i := public.scope_system_inspect(r.org, true);
    if not exists (select 1 from jsonb_array_elements(i -> 'scope_types') t, jsonb_array_elements(t -> 'scopes') s
                    where t ->> 'slug' = 'referral-source' and s ->> 'name' = 'Okafor Clinic Group'
                      and s #>> '{values,fax_number}' = '(949) 555-0142'
                      and t -> 'context_items' @> '[{"key":"fax_number"}]') then
      red := red || (r.who || ' I1 read-back lacks the new type/scope/value');
    end if;
    perform set_config('role', 'none', true);  -- set_entity_scopes is a server door (no authenticated grant); auth.uid() is the seat
    a := public.set_entity_scopes('scope', s2, array[s1]);
    if coalesce(a #>> '{0,scope_name}', '') <> 'Okafor Clinic Group' or a #>> '{0,type_label}' is distinct from 'Referral Source' then
      red := red || (r.who || ' T1 tagging: ' || a::text);
    end if;
    perform set_config('role', 'none', true);
    a := custom.context_compare_facts(r.uid, array[s1], array[f1], jsonb_build_array(jsonb_build_object('item_id', f1, 'scope_id', s1)));
    if (a #>> array['items', f1::text, 'old_active'])::boolean is not true or a #>> array['cells', f1 || ':' || s1, 'old_version'] is null then
      red := red || (r.who || ' C1 compare facts: ' || left(a::text, 300));
    end if;
    perform set_config('role', 'authenticated', true);
    a := public.scope_system_apply(r.org, '[{"op":"archive_scope","key":"okafor-clinic"},
      {"op":"archive_context_item","scope_type_key":"referral-source","key":"fax_number"},
      {"op":"archive_scope_type","key":"referral-source"}]'::jsonb);
    if a ->> 'applied' <> '3' then red := red || (r.who || ' X1 archive: ' || a::text); end if;
    perform set_config('role', 'none', true);
  end loop;
  if cardinality(red) > 0 then raise exception 'RED (%): %', cardinality(red), array_to_string(red, ' | '); end if;
  raise notice 'GREEN: scope-system tool, tagging and compare facts answer from the store (admin + test)';
end $suite$;
