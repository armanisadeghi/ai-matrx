-- FTS-1e (lane FINISH-THE-SWITCH) — A REFERENCE VALUE SAVED NOW IS FOUND BY WHAT IT POINTS AT, and the references saved
-- before still are; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1e_value_references_are_read_from_the_store.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy records that "Dr. Maya Ellison" works at "Knee Clinic North"; asking
-- "which records point at Knee Clinic North?" (public.list_context_value_refs) must name Dr. Ellison.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization:
-- R1 a scope reference saved through custom.context_value_write is found ('scope', the clinic's id);
-- R2 a table reference kept as a text fence is found ('table', the table id);
-- R3 admin still finds a reference saved before 2026-10-05 05:50Z (the web_site Data Destruction, Inc.).
-- RED before the file (R1/R2: the value door stopped writing the old index row at 05:50:37Z); GREEN after.
-- Run inside begin; …; rollback (everything transaction-local).

do $suite$
declare
  r record; t1 uuid; t2 uuid; i_ref uuid; i_txt uuid; dr uuid; clinic uuid; tbl uuid := gen_random_uuid();
  a jsonb; red text[] := '{}';
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Referring Physician","label_plural":"Referring Physicians"}') -> 'row' ->> 'id')::uuid;
    t2 := (custom.context_type_write(r.org, null, '{"label_singular":"Clinic Site","label_plural":"Clinic Sites"}') -> 'row' ->> 'id')::uuid;
    i_ref := (custom.context_item_write(null, t1, jsonb_build_object('key', 'home_clinic', 'display_name', 'Home clinic', 'value_type', 'reference',
               'allowed_reference_types', jsonb_build_array('scope'), 'allowed_scope_type_ids', jsonb_build_array(t2))) -> 'row' ->> 'id')::uuid;
    i_txt := (custom.context_item_write(null, t1, '{"key":"referral_log","display_name":"Referral log"}') -> 'row' ->> 'id')::uuid;
    dr := (custom.context_scope_write(r.org, null, t1, '{"name":"Dr. Maya Ellison"}') -> 'row' ->> 'id')::uuid;
    clinic := (custom.context_scope_write(r.org, null, t2, '{"name":"Knee Clinic North"}') -> 'row' ->> 'id')::uuid;
    a := custom.context_value_write(jsonb_build_object('context_item_id', i_ref, 'scope_id', dr, 'source_type', 'manual',
           'value_text', '```matrx' || chr(10) || jsonb_build_object('__kind', 'directive_v1_reference_scope',
             'items', jsonb_build_array(jsonb_build_object('id', clinic, 'label', 'Knee Clinic North')))::text || chr(10) || '```'));
    if (a ->> 'ok') is distinct from 'true' then red := red || (r.who || ' R1 write: ' || left(a::text, 200)); end if;
    a := custom.context_value_write(jsonb_build_object('context_item_id', i_txt, 'scope_id', dr, 'source_type', 'manual',
           'value_text', '```matrx' || chr(10) || jsonb_build_object('__kind', 'directive_v1_reference_table',
             'items', jsonb_build_array(jsonb_build_object('table_id', tbl, 'label', 'Referrals 2026')))::text || chr(10) || '```'));
    if (a ->> 'ok') is distinct from 'true' then red := red || (r.who || ' R2 write: ' || left(a::text, 200)); end if;

    a := public.list_context_value_refs('scope', clinic::text);
    if not exists (select 1 from jsonb_array_elements(a) e where e ->> 'scope_id' = dr::text and e ->> 'item_key' = 'home_clinic'
                     and e ->> 'scope_name' = 'Dr. Maya Ellison' and e ->> 'context_item_id' = i_ref::text) then
      red := red || (r.who || ' R1: ' || left(a::text, 200));
    end if;
    a := public.list_context_value_refs('table', tbl::text);
    if not exists (select 1 from jsonb_array_elements(a) e where e ->> 'scope_id' = dr::text and e ->> 'item_key' = 'referral_log') then
      red := red || (r.who || ' R2: ' || left(a::text, 200));
    end if;
    if r.who = 'admin' then
      a := public.list_context_value_refs('web_site', '38eff4c9-b021-451a-b995-7d9b3d17db5e');
      if not exists (select 1 from jsonb_array_elements(a) e where e ->> 'item_key' = 'primary_website') then
        red := red || (r.who || ' R3: ' || left(a::text, 200));
      end if;
    end if;
    perform set_config('role', 'none', true);
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: R1-R3 for admin and test@test.com';
end $suite$;
