-- LANE HR-360 wave 3 — CONFIDENTIAL MEETINGS CAPTURE NOTHING; OPENS ARE LOGGED. RED before / GREEN after
-- migrations/campaign/hr360w3_a_confidential_meetings_capture_nothing_and_opens_are_logged.sql.
--
-- Runs on the MAIN database as ONE statement that always ends in an exception, so every write it
-- makes is rolled back; the verdict travels in the exception text (`hr360w3: N of 7 checks hold`).
-- Seats: admin@admin.com (HR manager, a named reader) and test@test.com (Elena Marquez — a MEMBER of
-- the Workspace organization who is NOT a reader of the manager's half until HR shares it).
-- Real rows of the Workspace organization: review 55b94871… (employee_360_reviews, Confidential),
-- manager track 9caa99b2… (employee_360_review_tracks, Confidential, shared = false).
--
--   1. the audited door refuses the member on a Confidential row AND writes granted:false   (RED: no door)
--   2. the audited door grants the named reader AND writes granted:true                      (RED: no door)
--   3. scheduling a meeting on a Confidential record stamps capture off                      (RED: ai on)
--   4. turning the note-taker on through meet_update_meeting, knob off: refused 42501        (RED: allowed)
--   5. turning recording on by a direct UPDATE as the host, knob off: refused 42501          (RED: allowed)
--   6. with meet.confidential_capture on for the organization, the note-taker may turn on
--   7. a meeting on an ordinary (non-Confidential) panel record keeps what it asked for
do $proof$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_test  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_review uuid := '55b94871-4e6f-4656-a5b1-5c4da06bd96a';
  c_track  uuid := '9caa99b2-d271-45ae-a163-e0ab5bb885f3';
  v_out text[] := '{}'; v_ok int := 0; v_got text; v_n int; v_j jsonb; v_m record; v_m2 record;
begin
  -- 1 / 2 — the audited door, as each seat
  for v_n in 1..2 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', case when v_n = 1 then c_test else c_admin end, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      execute 'select iam.open_confidential_audited($1, $2, $3)' into v_j using 'record', c_track, 'hr360w3 proof';
      reset role;
      v_got := 'granted=' || coalesce(v_j ->> 'granted', '?') || ' logged=' || (
        select count(*) from iam.access_audit a where a.id = (v_j ->> 'audit_id')::uuid
           and a.granted = (v_j ->> 'granted')::boolean and a.data_class = 'confidential'
           and a.actor_user_id = case when v_n = 1 then c_test else c_admin end and c_track = any (a.target_ids));
    exception when others then reset role; v_got := 'error ' || sqlstate || ' ' || left(sqlerrm, 80);
    end;
    if v_n = 1 then
      v_out := v_out || ('1 member non-reader opens: want granted=false logged=1, got ' || v_got);
      if v_got = 'granted=false logged=1' then v_ok := v_ok + 1; end if;
    else
      v_out := v_out || ('2 named reader opens: want granted=true logged=1, got ' || v_got);
      if v_got = 'granted=true logged=1' then v_ok := v_ok + 1; end if;
    end if;
  end loop;

  -- 3 — schedule a meeting about the Confidential review, asking for the note-taker and recording
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select * into v_m from communication.meet_schedule_meeting(c_org, c_admin, '360 review meeting', now() + interval '1 day',
    'America/Los_Angeles', 45, null, null,
    jsonb_build_object('ai_enabled', true, 'recording_policy', 'host-controlled',
      'app_panel', jsonb_build_object('key', 'hr.review_360', 'record_id', c_review::text)));
  v_got := 'ai=' || v_m.ai_enabled || ' recording=' || v_m.recording_policy || ' hold=' || coalesce(v_m.metadata ->> 'capture_hold', '-');
  v_out := v_out || ('3 scheduled on a Confidential record: want ai=false recording=disabled hold=confidential_record, got ' || v_got);
  if v_got = 'ai=false recording=disabled hold=confidential_record' then v_ok := v_ok + 1; end if;
  -- (RED: make the next two checks start from capture off, as the stamp would have)
  update communication.meet_meetings set ai_enabled = false, recording_policy = 'disabled' where id = v_m.id;

  -- 4 — the door
  begin
    perform communication.meet_update_meeting(v_m.id, '{"ai_enabled": true}'::jsonb, null, c_admin);
    v_got := 'allowed';
  exception when others then v_got := 'refused ' || sqlstate;
  end;
  v_out := v_out || ('4 note-taker on through the update door, knob off: want refused 42501, got ' || v_got);
  if v_got = 'refused 42501' then v_ok := v_ok + 1; end if;

  -- 5 — a direct UPDATE as the host (RLS lets the creator update the row)
  begin
    set local role authenticated;
    update communication.meet_meetings set recording_policy = 'always-on' where id = v_m.id;
    get diagnostics v_n = row_count;
    reset role;
    v_got := 'allowed (' || v_n || ' row)';
  exception when others then reset role; v_got := 'refused ' || sqlstate;
  end;
  v_out := v_out || ('5 recording on by a direct UPDATE, knob off: want refused 42501, got ' || v_got);
  if v_got = 'refused 42501' then v_ok := v_ok + 1; end if;

  -- 6 — the organization allows capture
  begin
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values ('meet', 'confidential_capture', 'organization', c_org, c_org, 'true'::jsonb, 'hr360w3 proof (rolled back)');
    select * into v_m2 from communication.meet_update_meeting(v_m.id, '{"ai_enabled": true}'::jsonb, null, c_admin);
    v_got := 'ai=' || v_m2.ai_enabled;
  exception when others then v_got := 'refused ' || sqlstate || ' ' || left(sqlerrm, 100);
  end;
  v_out := v_out || ('6 knob on, note-taker on: want ai=true, got ' || v_got);
  if v_got = 'ai=true' then v_ok := v_ok + 1; end if;

  -- 7 — an ordinary panel record is untouched
  select * into v_m2 from communication.meet_schedule_meeting(c_org, c_admin, 'Planning', now() + interval '1 day',
    'America/Los_Angeles', 30, null, null,
    jsonb_build_object('ai_enabled', true, 'recording_policy', 'host-controlled',
      'app_panel', jsonb_build_object('key', 'hr.review_360', 'record_id', gen_random_uuid()::text)));
  v_got := 'ai=' || v_m2.ai_enabled || ' recording=' || v_m2.recording_policy;
  v_out := v_out || ('7 ordinary panel record: want ai=true recording=host-controlled, got ' || v_got);
  if v_got = 'ai=true recording=host-controlled' then v_ok := v_ok + 1; end if;

  raise exception 'hr360w3: % of 7 checks hold | %', v_ok, array_to_string(v_out, ' | ');
end
$proof$;
