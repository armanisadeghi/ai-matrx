-- FTS-1f (lane FINISH-THE-SWITCH) — THE SCOPE DOORS WRITE ONLY THE STORE: a scope type, a scope and a context field made,
-- changed, archived and restored through the doors leave no old row behind, and every answer comes from the store;
-- measured RED then GREEN on live, rolled back (migrations/campaign/scopesfts1f_the_scope_doors_write_no_old_row.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds a "Referral Source" type, the "Dr. Alvarez Orthopedics" source and a
-- "Fax Number" field, renames the source, then archives and restores each.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization: W1 each door answers
-- the row it wrote (the new name, the field's key, the type's label); W2 no old scope, scope type or context item row
-- exists for any of the three; W3 archive and restore answer ok and the store holds the end state.
-- RED before the file (the doors wrote the old rows as their image); GREEN after. Run inside begin; …; rollback.

do $suite$
declare
  r record; t1 uuid; s1 uuid; f1 uuid; a jsonb; red text[] := '{}'; n int;
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    a := custom.context_type_write(r.org, null, '{"label_singular":"Referral Source","label_plural":"Referral Sources"}');
    t1 := (a -> 'row' ->> 'id')::uuid;
    if a -> 'row' ->> 'label_singular' is distinct from 'Referral Source' then red := red || (r.who || ' W1 type: ' || a::text); end if;
    s1 := (custom.context_scope_write(r.org, null, t1, '{"name":"Dr. Alvarez Orthopedics"}') -> 'row' ->> 'id')::uuid;
    a := custom.context_scope_write(null, s1, null, '{"name":"Alvarez Ortho Group"}');
    if a -> 'row' ->> 'name' is distinct from 'Alvarez Ortho Group' or a -> 'row' ->> 'type_label' is distinct from 'Referral Source' then
      red := red || (r.who || ' W1 scope: ' || (a -> 'row')::text);
    end if;
    a := custom.context_item_write(null, t1, '{"key":"fax_number","display_name":"Fax Number","value_type":"string"}');
    f1 := (a -> 'row' ->> 'id')::uuid;
    if a -> 'row' ->> 'key' is distinct from 'fax_number' or a -> 'row' ->> 'scope_type_id' is distinct from t1::text then
      red := red || (r.who || ' W1 field: ' || (a -> 'row')::text);
    end if;
    perform custom.context_item_archive(f1); perform custom.context_item_restore(f1);
    perform custom.context_scope_archive(s1); perform custom.context_scope_restore(s1);
    perform custom.context_type_archive(t1); perform custom.context_type_restore(t1);
    perform set_config('role', 'none', true);
    execute 'select (select count(*) from context.scope_types where id = $1) + (select count(*) from context.scopes where id = $2)
                  + (select count(*) from context.context_items where id = $3)' into n using t1, s1, f1;
    if n <> 0 then red := red || (r.who || ' W2: ' || n || ' old rows'); end if;
    if (select count(*) from custom.record where id in (t1, s1, f1) and deleted_at is null) <> 3 then
      red := red || (r.who || ' W3: store end state');
    end if;
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: W1-W3 for admin and test@test.com';
end $suite$;
