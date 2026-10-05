-- FTS-1f (lane FINISH-THE-SWITCH) — A SCOPE TYPE IS ARCHIVED AND RESTORED WITH ITS CONTEXT FIELDS, SUB-TYPES AND SCOPES
-- IN THE STORE, without the old rows; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1f_a_scope_type_takes_its_fields_sub_types_and_scopes_in_the_store.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy retires its "Clinic Site" type: its "Treatment Room" sub-type, the
-- "Downtown" site, the "Room 4" room and the "Parking Notes" field go with it; the "Old Annex" site someone archived
-- last month stays archived when the type comes back.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization, the sub-type, the room,
-- the field and a second site held by the store alone (as every row will be once the old rows stop): T1 archiving the
-- type through custom.context_type_archive archives every one of them at the type's exact time and leaves the annex's
-- own time; T2 restoring it brings them back and leaves the annex archived.
-- RED before the file (the cascade rode the old rows); GREEN after. Run inside begin; …; rollback.

do $suite$
declare
  r record; t1 uuid; sub uuid; site uuid; room uuid; fld uuid; annex uuid;
  a jsonb; red text[] := '{}'; t_type timestamptz; got text; t_annex timestamptz := now() - interval '30 days';
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    sub := gen_random_uuid(); room := gen_random_uuid(); fld := gen_random_uuid(); annex := gen_random_uuid();
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Clinic Site","label_plural":"Clinic Sites"}') -> 'row' ->> 'id')::uuid;
    site := (custom.context_scope_write(r.org, null, t1, '{"name":"Downtown"}') -> 'row' ->> 'id')::uuid;
    perform set_config('role', 'none', true);
    perform custom._ctx_store_type(r.org, sub, jsonb_build_object('label_singular', 'Treatment Room', 'label_plural', 'Treatment Rooms',
              'parent_type_id', t1, 'slug', 'treatment-room', 'sort_order', 1, 'created_by', r.uid));
    perform custom._ctx_store_scope(r.org, sub, room, jsonb_build_object('name', 'Room 4', 'parent_scope_id', site,
              'slug', 'room_4', 'sort_order', 1, 'created_by', r.uid));
    perform custom._ctx_store_item(r.org, t1, fld, jsonb_build_object('key', 'parking_notes', 'display_name', 'Parking Notes',
              'value_type', 'text', 'created_by', r.uid));
    perform custom._ctx_store_scope(r.org, t1, annex, jsonb_build_object('name', 'Old Annex', 'slug', 'old_annex', 'sort_order', 2,
              'created_by', r.uid, 'deleted_at', t_annex));
    perform set_config('role', 'authenticated', true);

    a := custom.context_type_archive(t1);
    perform set_config('role', 'none', true);
    select deleted_at into t_type from custom.record where id = t1;
    select string_agg(coalesce(x.data ->> 'name', x.data ->> 'label_singular', x.data ->> 'key') || '=' ||
                      case when x.deleted_at = t_type then 'type' when x.deleted_at = t_annex then 'own'
                           when x.deleted_at is null then 'live' else 'other' end, ',' order by coalesce(x.data ->> 'name', x.data ->> 'label_singular', x.data ->> 'key'))
      into got from custom.record x where x.id in (sub, site, room, fld, annex);
    if t_type is null or got is distinct from 'Downtown=type,Old Annex=own,Room 4=type,Treatment Room=type,parking_notes=type' then
      red := red || (r.who || ' T1: ' || coalesce(got, '<none>'));
    end if;
    perform set_config('role', 'authenticated', true);
    a := custom.context_type_restore(t1);
    perform set_config('role', 'none', true);
    select string_agg(coalesce(x.data ->> 'name', x.data ->> 'label_singular', x.data ->> 'key') || '=' ||
                      case when x.deleted_at is null then 'live' when x.deleted_at = t_annex then 'own' else 'other' end, ',' order by coalesce(x.data ->> 'name', x.data ->> 'label_singular', x.data ->> 'key'))
      into got from custom.record x where x.id in (t1, sub, site, room, fld, annex);
    if got is distinct from 'Clinic Site=live,Downtown=live,Old Annex=own,Room 4=live,Treatment Room=live,parking_notes=live' then
      red := red || (r.who || ' T2: ' || coalesce(got, '<none>'));
    end if;
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: T1-T2 for admin and test@test.com';
end $suite$;
