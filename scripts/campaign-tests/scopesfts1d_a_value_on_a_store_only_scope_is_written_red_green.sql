-- FTS-1d (lane FINISH-THE-SWITCH) — A VALUE ON A SCOPE ONLY THE STORE HOLDS IS WRITTEN, and every other value answers as
-- before; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1d_value_writes_and_provisioning_read_only_the_store.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy records a referring physician's NPI number on "Dr. Maya Ellison"; once the
-- old scope rows stop being written, that scope exists only in the record store, and the value must still save.
--
-- WHAT MUST HOLD, through the value door custom.context_value_write, as admin@admin.com in Cedar Ridge and test@test.com
-- in its own organization: V1 a value on a store-only scope saves (ok, writer store, version 1) and lands on the Record;
-- V2 a second value on it is version 2; V3 a reference field refuses a value that is not a reference fence in the old
-- words. RED before the file (V1: the old value row's foreign key refuses the store-only scope); GREEN after.
-- Run inside begin; …; rollback (everything transaction-local).

do $suite$
declare
  r record; t1 uuid; sc uuid; i1 uuid; i2 uuid; a jsonb; red text[] := '{}'; got text;
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Referring Physician","label_plural":"Referring Physicians"}') -> 'row' ->> 'id')::uuid;
    i1 := (custom.context_item_write(null, t1, '{"key":"npi_number","display_name":"NPI number"}') -> 'row' ->> 'id')::uuid;
    i2 := (custom.context_item_write(null, t1, jsonb_build_object('key', 'home_clinic', 'display_name', 'Home clinic', 'value_type', 'reference',
             'allowed_reference_types', jsonb_build_array('scope'), 'allowed_scope_type_ids', jsonb_build_array(t1))) -> 'row' ->> 'id')::uuid;
    -- A scope only the store holds: its store half alone (as the doors will write it once the old row is gone).
    perform set_config('role', 'none', true);
    sc := gen_random_uuid();
    perform custom._ctx_store_scope(r.org, t1, sc, jsonb_build_object('name', 'Dr. Maya Ellison', 'created_by', r.uid));
    perform set_config('role', 'authenticated', true);
    begin
      a := custom.context_value_write(jsonb_build_object('context_item_id', i1, 'scope_id', sc, 'value_text', '1467582930', 'source_type', 'manual'));
    exception when others then a := jsonb_build_object('raised', sqlerrm);
    end;
    if (a ->> 'ok') is distinct from 'true' or (a -> 'data' ->> 'version') is distinct from '1' then
      red := red || (r.who || ' V1: ' || left(a::text, 200));
    else
      perform set_config('role', 'none', true);
      select x.data ->> 'npi_number' into got from custom.record x where x.id = sc;
      if got is distinct from '1467582930' then red := red || (r.who || ' V1: Record holds [' || coalesce(got, '<null>') || ']'); end if;
      perform set_config('role', 'authenticated', true);
      a := custom.context_value_write(jsonb_build_object('context_item_id', i1, 'scope_id', sc, 'value_text', '1467582931', 'source_type', 'manual'));
      if (a -> 'data' ->> 'version') is distinct from '2' then red := red || (r.who || ' V2: ' || left(a::text, 200)); end if;
    end if;
    begin
      a := custom.context_value_write(jsonb_build_object('context_item_id', i2, 'scope_id', sc, 'value_text', 'Knee clinic', 'source_type', 'manual'));
    exception when others then a := jsonb_build_object('raised', sqlerrm);
    end;
    if (a -> 'error' ->> 'message') is distinct from 'value is not a valid matrx reference fence for this item' then
      red := red || (r.who || ' V3: ' || left(a::text, 200));
    end if;
    perform set_config('role', 'none', true);
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: V1-V3 for admin and test@test.com';
end $suite$;
