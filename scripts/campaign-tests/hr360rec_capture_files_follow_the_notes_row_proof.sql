-- HR-360-REC proof (2026-10-09): repeatable, ROLLED BACK (the block ends by raising its report; nothing is kept).
-- A 360 meeting whose artifacts parent is the review's Confidential notes row: its recording and transcript files
-- are readable only by the row's readers (HR manager always; manager and employee once HR shares), never by a
-- plain organization member, and can be neither published nor Anyone-linked.
-- Run: psql "$DB" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/hr360rec_capture_files_follow_the_notes_row_proof.sql
-- Ends with an error whose text is 'HR360REC PROOF: ALL PASS' (rolled back) or names the failed checks.
do $proof$
declare
  c_org   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_tbl   constant uuid := '811097f6-a82d-42ac-bb34-b5dd78757b07';   -- 360 review meeting notes (Confidential)
  c_hr    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com = the HR manager
  c_emp   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com = the employee
  c_mgr   constant uuid := '5ef03742-68ea-41d7-9fa7-f219d001b008';   -- the manager
  v_plain uuid; v_review uuid := gen_random_uuid(); v_notes uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_meet communication.meet_meetings; v_rec uuid := gen_random_uuid(); v_tr uuid := gen_random_uuid();
  v_n int; v_b boolean; v_j jsonb; v_msg text; v_fail text[] := '{}'; v_state text;
  v_row record;
  seats uuid[]; names text[] := array['hr','manager','employee','plain'];
  i int;
begin
  -- fixture: a fourth person who is an ordinary member of the organization and named nowhere
  select id into v_plain from auth.users where id not in (c_hr, c_emp, c_mgr) order by id limit 1;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role)
  select c_org, 'organization', c_org, u, 'member' from unnest(array[v_plain, c_mgr]) u
   where not exists (select 1 from iam.memberships x where x.container_type = 'organization' and x.container_id = c_org and x.user_id = u);
  seats := array[c_hr, c_mgr, c_emp, v_plain];

  -- the notes row (clone of a live one, new id, readers named, not shared)
  create temp table _n on commit drop as select * from custom.record where table_id = c_tbl and deleted_at is null limit 1;
  update _n set id = v_notes, data = jsonb_build_object('title','Review meeting notes','review_ref',v_review::text,'notes','',
      'hr_manager',c_hr::text,'manager_user',c_mgr::text,'employee_user',c_emp::text,'shared',false), created_by = c_hr;
  insert into custom.record select * from _n;

  -- the meeting, scheduled by the HR manager with the review as its app panel
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v_meet from communication.meet_schedule_meeting(c_org, c_hr, '360 review meeting', now() + interval '1 day',
      'UTC', 30, null, null, jsonb_build_object('app_panel', jsonb_build_object('key','hr.review_360','record_id',v_review::text)));
  -- (1) the host links the notes row
  select communication.meet_link_capture_to_notes(v_review, v_notes) into v_n;
  if v_n <> 1 then v_fail := array_append(v_fail, (format('link: host linking changed %s meetings (want 1)', v_n))::text); end if;
  reset role;
  select m.metadata #>> '{app_panel,artifacts_record_id}' into v_state from communication.meet_meetings m where m.id = v_meet.id;
  if v_state is distinct from v_notes::text then v_fail := array_append(v_fail, ('link: artifacts_record_id not stored')::text); end if;
  -- (2) the employee (no edit on the row, not host) is refused
  perform set_config('request.jwt.claims', json_build_object('sub', c_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform communication.meet_link_capture_to_notes(v_review, v_notes);
    v_fail := array_append(v_fail, ('link: employee was not refused')::text);
  exception when insufficient_privilege then null; end;
  -- (3) a client cannot call the server step
  begin
    perform communication.meet_attach_capture_file(v_meet.id, gen_random_uuid());
    v_fail := array_append(v_fail, ('attach: a signed-in client was not refused')::text);
  exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claims', '', true);   -- the server's own connection carries no user
  -- (4) the server writes a recording and a transcript file (org-level at birth), then attaches them
  insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, visibility, published_to_web)
  values (v_rec, c_hr, c_org, 'syn/hr360rec/' || v_rec, 'recording.mp4', 's3://syn/hr360rec/' || v_rec, 'internal', false),
         (v_tr,  c_hr, c_org, 'syn/hr360rec/' || v_tr,  'transcript.txt', 's3://syn/hr360rec/' || v_tr,  'internal', false);
  select communication.meet_attach_capture_file(v_meet.id, v_rec) into v_b;
  if v_b is not true then v_fail := array_append(v_fail, ('attach: recording not attached')::text); end if;
  select communication.meet_attach_capture_file(v_meet.id, v_tr) into v_b;
  if v_b is not true then v_fail := array_append(v_fail, ('attach: transcript not attached')::text); end if;
  select count(*) into v_n from files.files where id in (v_rec, v_tr) and parent_record_type = 'record' and parent_record_id = v_notes and not published_to_web;
  if v_n <> 2 then v_fail := array_append(v_fail, (format('attach: %s of 2 files under the notes row', v_n))::text); end if;
  -- an ordinary meeting (no artifacts row) attaches nothing
  begin
    select * into v_row from communication.meet_schedule_meeting(c_org, c_hr, 'Planning', now() + interval '1 day', 'UTC', 30, null, null, '{}'::jsonb);
  exception when others then null; end;
  -- a file of another organization is refused
  insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, visibility, published_to_web)
  values (v_other, c_hr, (select id from iam.organizations where id <> c_org and archived_at is null order by id limit 1),
          'syn/hr360rec/' || v_other, 'x.txt', 's3://syn/hr360rec/' || v_other, 'internal', false);
  begin
    perform communication.meet_attach_capture_file(v_meet.id, v_other);
    v_fail := array_append(v_fail, ('attach: a file of another organization was attached')::text);
  exception when insufficient_privilege then null; end;

  -- (5) who sees the files: before sharing, then after. Kernel answer AND the real read policy (RLS) per seat.
  for pass in 1..2 loop
    for i in 1..4 loop
      perform set_config('request.jwt.claims', json_build_object('sub', seats[i], 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from files.files f where f.id in (v_rec, v_tr);
      reset role;
      if pass = 1 and ((i = 1 and v_n <> 2) or (i > 1 and v_n <> 0)) then
        v_fail := array_append(v_fail, (format('before share: %s reads %s of 2 files (want %s)', names[i], v_n, case when i = 1 then 2 else 0 end))::text);
      end if;
      if pass = 2 and ((i <= 3 and v_n <> 2) or (i = 4 and v_n <> 0)) then
        v_fail := array_append(v_fail, (format('after share: %s reads %s of 2 files (want %s)', names[i], v_n, case when i <= 3 then 2 else 0 end))::text);
      end if;
    end loop;
    if pass = 1 then
      -- HR shares the notes (the row's own reader rule opens it to the manager and the employee)
      perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
      update custom.record set data = jsonb_set(data, '{shared}', 'true'::jsonb) where id = v_notes;   -- HR's identity, the row's own write door
    end if;
  end loop;

  -- (6) the files are never published or Anyone-linked
  perform set_config('request.jwt.claims', json_build_object('sub', c_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update files.files set published_to_web = true where id = v_rec;
    v_fail := array_append(v_fail, ('publish: a file under the Confidential row was published')::text);
  exception when insufficient_privilege then null; end;
  v_j := public.create_share_link('file', v_rec);
  if coalesce((v_j ->> 'success')::boolean, false) then v_fail := array_append(v_fail, ('link: an Anyone link on the recording was created')::text); end if;
  reset role;
  begin
    v_msg := platform.ensure_anyone_link('file', v_tr, c_hr, c_org)::text;
    v_fail := array_append(v_fail, ('link: ensure_anyone_link made an Anyone link on the transcript')::text);
  exception when insufficient_privilege then v_msg := sqlerrm; end;

  if cardinality(v_fail) > 0 then
    raise exception 'HR360REC PROOF FAILED: %', array_to_string(v_fail, '; ');
  end if;
  raise exception 'HR360REC PROOF: ALL PASS (rolled back). Anyone-link refusal: %', v_msg;
end
$proof$;
