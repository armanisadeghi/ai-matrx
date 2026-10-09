-- LANE ENTITY-IDS — A FILE UNDER A STORE RECORD IS CHECKED BY ASKING ABOUT THE RECORD IDS THE FILES NAME.
-- Proves migrations/campaign/entityids_a_file_parents_are_asked_by_the_ids_the_files_name.sql and
-- migrations/campaign/entityids_b_a_file_may_be_the_child_of_a_store_record.sql on the MAIN database.
--
-- ONE statement that always ends in an exception, so every write it makes is rolled back; the verdict travels in
-- the exception text (`entityids: N of 9 checks hold`). Run it in a REPEATABLE READ transaction so both forms read
-- one snapshot. Takes about a minute (six full files.files reads).
--
-- Seats: admin@admin.com (HR manager, a named reader of the Confidential manager track 9caa99b2… of the Workspace
-- organization 884d1ce8…), test@test.com (a member of that organization who is NOT a reader), dd048-joiner (a plain
-- member of three other organizations; owner of the constructed file).
--   1-3. every files.files id each seat reads is identical with the old listing forced (mx.child_parent_asks_ids =
--        off) and on the new path, before the constructed file exists
--   4.   a file under the Confidential track: the named reader (not its owner) reads it
--   5.   the member who is not a reader does not
--   6.   its owner does
--   7-8. the set form (iam.accessible_entity_ids('file'), which every files component policy asks) agrees: the reader's
--        set holds it, the non-reader's does not
--   9.   the newest-50 file page for the member answers in under 5 s with the file present (RED before entityids_a:
--        the listing of every record the member reaches never returned)
do $proof$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_test  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_dd048 uuid := '5ef03742-68ea-41d7-9fa7-f219d001b008';
  c_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_track uuid := '9caa99b2-d271-45ae-a163-e0ab5bb885f3';
  c_file  uuid := 'e0e0e0e0-1111-4222-8333-000000000360';
  v_out text[] := '{}'; v_ok int := 0; v_seat uuid; v_a text; v_b text; v_n int; v_t timestamptz; v_ms int;
  v_seen boolean;
begin
  -- 1-3: identical sets, old listing vs ask-by-id, every seat
  foreach v_seat in array array[c_admin, c_test, c_dd048] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_seat, 'role', 'authenticated')::text, true);
    perform set_config('mx.child_parent_asks_ids', 'off', true);
    set local role authenticated;
    select count(*) || ':' || md5(string_agg(id::text, ',' order by id)) into v_a from files.files;
    reset role;
    perform set_config('mx.child_parent_asks_ids', '', true);
    set local role authenticated;
    select count(*) || ':' || md5(string_agg(id::text, ',' order by id)) into v_b from files.files;
    reset role;
    v_out := v_out || (v_seat::text || ' old ' || v_a || ' new ' || v_b);
    if v_a = v_b then v_ok := v_ok + 1; end if;
  end loop;

  insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri,
                           parent_record_type, parent_record_id)
  values (c_file, c_dd048, c_org, 'entityids-proof/' || c_file || '.webm', '360 meeting recording.webm',
          's3://entityids-proof/' || c_file || '.webm', 'record', c_track);

  -- 4-6: who reads the file
  foreach v_seat in array array[c_admin, c_test, c_dd048] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_seat, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select exists (select 1 from files.files where id = c_file) into v_seen;
    reset role;
    if v_seat = c_admin then
      v_out := v_out || ('4 named reader reads: want true, got ' || v_seen);
      if v_seen then v_ok := v_ok + 1; end if;
    elsif v_seat = c_test then
      v_out := v_out || ('5 member non-reader reads: want false, got ' || v_seen);
      if not v_seen then v_ok := v_ok + 1; end if;
    else
      v_out := v_out || ('6 owner reads: want true, got ' || v_seen);
      if v_seen then v_ok := v_ok + 1; end if;
    end if;
  end loop;

  -- 7-8: the set form the component policies ask
  foreach v_seat in array array[c_admin, c_test] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_seat, 'role', 'authenticated')::text, true);
    v_seen := c_file = any (iam.accessible_entity_ids('file', 'viewer'::public.permission_level, 0, true));
    if v_seat = c_admin then
      v_out := v_out || ('7 reader set holds it: want true, got ' || v_seen);
      if v_seen then v_ok := v_ok + 1; end if;
    else
      v_out := v_out || ('8 non-reader set holds it: want false, got ' || v_seen);
      if not v_seen then v_ok := v_ok + 1; end if;
    end if;
  end loop;

  -- 9: the member's file page stays fast with a record parent present
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  v_t := clock_timestamp();
  set local role authenticated;
  select count(*) into v_n from (select id from files.files where deleted_at is null order by updated_at desc, id limit 50) s;
  reset role;
  v_ms := (extract(epoch from clock_timestamp() - v_t) * 1000)::int;
  v_out := v_out || ('9 member newest-50 page: want < 5000 ms, got ' || v_ms || ' ms (' || v_n || ' rows)');
  if v_ms < 5000 then v_ok := v_ok + 1; end if;

  raise exception 'entityids: % of 9 checks hold | %', v_ok, array_to_string(v_out, ' | ');
end
$proof$;
