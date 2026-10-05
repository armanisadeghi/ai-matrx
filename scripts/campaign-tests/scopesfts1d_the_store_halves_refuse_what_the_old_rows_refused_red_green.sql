-- FTS-1d (lane FINISH-THE-SWITCH) — THE STORE HALVES REFUSE WHAT THE OLD ROWS REFUSED, measured RED then GREEN on live,
-- rolled back (migrations/campaign/scopesfts1d_the_store_halves_refuse_what_the_old_rows_refused.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps its referring physicians as a scope type. When the old context.*
-- rows stop being written, a second "Referring Physician" type, a second "Dr. Maya Ellison", a second "npi_number"
-- field, a field key with spaces, a 501-character description or a field that holds zero items must still be refused,
-- in the same words, by the record store alone.
--
-- THE BREAK THIS CATCHES: a store half (custom._ctx_store_type / _ctx_store_scope / _ctx_store_item) that accepts a
-- write only the old table's unique index or check constraint refused. Each case calls the STORE HALF DIRECTLY (no old
-- row is written), so a refusal can only come from the store. RED before the file (every case "accepted"); GREEN after.
--
-- Run (never through the session pooler with a session SET; everything below is transaction-local and rolled back):
--   node <helper> rb this-file production      (begin; …; rollback; as the database owner)

do $suite$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_cedar constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  t1 uuid; t2 uuid; sp uuid; i1 uuid; red text[] := '{}'; st text; m text;
  c record;
begin
  perform set_config('app.actor_system', 'campaign-test/scopesfts1d', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  t1 := (custom.context_type_write(c_cedar, null, '{"label_singular":"Referring Physician","label_plural":"Referring Physicians","slug":"referring-physicians-fx"}') -> 'row' ->> 'id')::uuid;
  t2 := (custom.context_type_write(c_cedar, null, '{"label_singular":"Insurance Carrier","label_plural":"Insurance Carriers","slug":"insurance-carriers-fx"}') -> 'row' ->> 'id')::uuid;
  sp := (custom.context_scope_write(c_cedar, null, t1, '{"name":"Dr. Maya Ellison"}') -> 'row' ->> 'id')::uuid;
  perform custom.context_scope_write(c_cedar, null, t1, format('{"name":"Knee clinic","parent_scope_id":"%s"}', sp)::jsonb);
  i1 := (custom.context_item_write(null, t1, '{"key":"npi_number","display_name":"NPI number"}') -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);

  for c in
    select * from (values
      ('type label',  format($$select custom._ctx_store_type(%L, gen_random_uuid(), '{"label_singular":"Referring Physician","label_plural":"Referrers","slug":"referrers-fx"}')$$, c_cedar),
                      '23505', 'duplicate key value violates unique constraint "unique_type_per_org"'),
      ('type slug',   format($$select custom._ctx_store_type(%L, %L, '{"label_singular":"Insurance Carrier","label_plural":"Insurance Carriers","slug":"referring-physicians-fx"}')$$, c_cedar, t2),
                      '23505', 'duplicate key value violates unique constraint "ctx_scope_types_org_slug_uniq"'),
      ('scope top',   format($$select custom._ctx_store_scope(%L, %L, gen_random_uuid(), '{"name":"Dr. Maya Ellison","slug":"maya-2"}')$$, c_cedar, t1),
                      '23505', 'duplicate key value violates unique constraint "idx_scope_unique_top"'),
      ('scope nested',format($$select custom._ctx_store_scope(%L, %L, gen_random_uuid(), '{"name":"Knee clinic","slug":"knee-2","parent_scope_id":"%s"}')$$, c_cedar, t1, sp),
                      '23505', 'duplicate key value violates unique constraint "idx_scope_unique_nested"'),
      ('item key',    format($$select custom._ctx_store_item(%L, %L, gen_random_uuid(), '{"key":"npi_number","display_name":"NPI"}')$$, c_cedar, t1),
                      '23505', 'duplicate key value violates unique constraint "context_items_key_per_type"'),
      ('item format', format($$select custom._ctx_store_item(%L, %L, gen_random_uuid(), '{"key":"Fax Number","display_name":"Fax"}')$$, c_cedar, t1),
                      '23514', 'new row for relation "context_items" violates check constraint "context_items_key_format"'),
      ('item desc',   format($$select custom._ctx_store_item(%L, %L, %L, jsonb_build_object('key','npi_number','display_name','NPI','description',repeat('x',501)))$$, c_cedar, t1, i1),
                      '23514', 'new row for relation "context_items" violates check constraint "context_items_description_length"'),
      ('item max',    format($$select custom._ctx_store_item(%L, %L, gen_random_uuid(), '{"key":"office_phones","display_name":"Phones","max_items":0}')$$, c_cedar, t1),
                      '23514', 'new row for relation "context_items" violates check constraint "context_items_max_items_positive"'),
      ('item ref',    format($$select custom._ctx_store_item(%L, %L, gen_random_uuid(), '{"key":"home_clinic","display_name":"Home clinic","value_type":"reference","allowed_reference_types":[]}')$$, c_cedar, t1),
                      '23514', 'new row for relation "context_items" violates check constraint "context_items_reference_types_required"')
    ) v(name, q, want_state, want_msg)
  loop
    begin
      execute c.q;
      red := red || (c.name || ': accepted');
    exception when others then
      get stacked diagnostics st = returned_sqlstate, m = message_text;
      if st <> c.want_state or m <> c.want_msg then
        red := red || (c.name || ': ' || st || ' ' || m);
      end if;
    end;
  end loop;
  if cardinality(red) > 0 then
    raise exception 'RED (% of 9): %', cardinality(red), array_to_string(red, ' | ');
  end if;
  raise notice 'GREEN: 9 of 9 store-half refusals in the old words';
end $suite$;
