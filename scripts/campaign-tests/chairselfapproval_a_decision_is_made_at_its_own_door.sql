-- LANE CHAIR-SELF-APPROVAL — A DECISION IS MADE AT ITS OWN DOOR, NEVER BY WRITING THE RECORD.
-- Guard for migrations/campaign/chairselfapproval_a_decision_is_made_at_its_own_door.sql
--
-- The break it names (lane 11's board, item 0): a signed-in member filed an approval with
-- custom.work_approval_request and then custom.record_update(org, id, {"state":"approved",…}) went
-- through — no may_decide, no second pair of eyes, no agent refusal. The same write flipped `origin`
-- to agent (so the requester could then approve at the real door), swapped `change`, and
-- record_restore_version put a decided approval back to pending. A sign_request read as signed the
-- moment record_update wrote `signed_at`.
--
-- Cedar Ridge Physical Therapy, Treatment Rooms. test@test.com is given ADMIN on the table (rolled
-- back) so she is one of the people who may decide — which is exactly what makes "you asked for this,
-- so somebody else approves it" the live refusal rather than "you may not approve". admin@admin.com
-- (owner) is the second pair of eyes. Every forgery is tried from her seat as a person (her browser)
-- and again with the agent tier declared (her agent, on the server channel).
--   F1–F6   person: record_update of state / origin / requested_by / change / decided_by-only /
--           record_restore_version and value_restore of a decided approval — all refused 42501 by the door sentence
--   F7–F8   agent tier: record_update of state, and of origin — refused the same way
--   F9      the forged-origin chain: origin→agent then decide as the requester — refused at the first step
--   F10     sign_request: record_update writes signed_at — refused by the signature door sentence
--   F11     sign_request: record_restore_version putting a cancelled request back to its first version — refused
--   W1      admin (second pair of eyes) decides: applied, state approved, decided_by admin
--   W2      the requester deciding her own request is still refused (second pair of eyes)
--   W3      the agent tier deciding is still refused
--   W4      withdraw on archive still works: archiving the subject withdraws the pending approval
--   W5      archiving and restoring the approval row itself still works (deleted_at only)
--   W6      work_decide_many still decides
--   W7      the organization archive still withdraws and the undo still returns (approvals + sign requests)
--   W8      a sign request's own doors still write: remind, cancel
-- THE VERDICT IS THE EXIT CODE. Everything is rolled back.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairselfapproval_a_decision_is_made_at_its_own_door.sql
\set ON_ERROR_STOP on
\set suite 'chairselfapproval_a_decision_is_made_at_its_own_door.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '180s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
create temp table ids (k text primary key, val text) on commit drop;
grant all on res, ids to authenticated, service_role;

-- try(sql): run it in a savepoint; a write that goes through is rolled back and reported as WROTE,
-- a refusal is reported as "<sqlstate>: <message>". The attempt never changes the state the next
-- check reads.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
declare s text; m text;
begin
  begin
    execute p_sql;
    raise exception 'wrote' using errcode = 'ZZ001';
  exception
    when sqlstate 'ZZ001' then return 'WROTE';
    when others then get stacked diagnostics s = returned_sqlstate, m = message_text; return s || ': ' || m;
  end;
end $$;
create function pg_temp.refused_by_door(p_out text, p_class text) returns boolean language sql as $$
  select p_out like '42501: %' and p_out like case p_class
    when 'work_approval' then '%An approval is decided at its own door%'
    when 'sign_request'  then '%A signature request is answered through its signing link%' end;
$$;

select set_config('t.admin', '87a6e699-3622-4869-8843-d0867456c0dd', true),   -- admin@admin.com (owner)
       set_config('t.test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true),   -- test@test.com (member)
       set_config('t.cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),   -- Cedar Ridge Physical Therapy
       set_config('t.rooms', '89919d7d-cbbc-4600-8ea7-3f63db964631', true)    -- Treatment Rooms
\g /dev/null
insert into ids values ('row1', (select id::text from custom.record where organization_id = current_setting('t.cedar')::uuid
                                   and table_id = current_setting('t.rooms')::uuid and data_class = 'record' and deleted_at is null
                                  order by created_at limit 1));

-- A SIGN REQUEST TO FORGE AGAINST. Cedar has no document render, so the row is written here as the
-- store itself would (the create door's shape), with the create door's mark held, and test as the
-- person who asked (created_by), which is what gives her editor on it.
select set_config('custom.decision_door', 'sign_request:create', true) \g /dev/null
insert into custom.record (organization_id, table_id, data_class, created_by, data)
values (current_setting('t.cedar')::uuid, null, 'sign_request', current_setting('t.test')::uuid, jsonb_build_object(
  'render_id', gen_random_uuid(), 'record_id', (select val from ids where k = 'row1'), 'table_id', current_setting('t.rooms'),
  'template_id', gen_random_uuid(), 'document_title', 'Treatment Room Use Agreement', 'field_key', 'lead_pt_signature',
  'signer_email', 'admin@admin.com', 'signer_name', 'Marisol Ortega', 'signer_user_id', current_setting('t.admin'),
  'token_hash', encode(sha256('chairselfapproval-suite'::bytea), 'hex'), 'document_hash', encode(sha256('doc'::bytea), 'hex'),
  'document_version', 1, 'sent_at', now(), 'expires_at', now() + interval '14 days', 'bad_attempts', 0, 'reminder_count', 0))
\g /dev/null
insert into ids select 'sr', id::text from custom.record where organization_id = current_setting('t.cedar')::uuid
  and data_class = 'sign_request' and data ->> 'token_hash' = encode(sha256('chairselfapproval-suite'::bytea), 'hex');
select set_config('custom.decision_door', '', true) \g /dev/null

-- admin gives test ADMIN on Treatment Rooms (her own browser)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true),
       set_config('app.actor_tier', '', true), set_config('app.conversation_id', '', true) \g /dev/null
select custom.share_grant(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid, 'person',
                          current_setting('t.test')::uuid, 'admin'::public.permission_level) \g /dev/null

-- ── test asks, as a person ──────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true) \g /dev/null
insert into ids select 'a1', custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
  '{"kind":"record_patch","patch":{"patient_capacity":7}}'::jsonb, 'Capacity is 7 after the remodel', null, 'person', null) ->> 'approval_id';
insert into ids select 'a2', custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
  '{"kind":"record_patch","patch":{"patient_capacity":8}}'::jsonb, 'For the batch decision', null, 'person', null) ->> 'approval_id';

-- ── F1–F6: forgeries from the person's seat ─────────────────────────────────────────────────────
insert into res select 'F1 person: record_update state→approved is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.test'))) o;
insert into res select 'F2 person: record_update origin→agent is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"origin":"agent"}'::jsonb)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;
insert into res select 'F3 person: record_update requested_by→admin is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"requested_by":"%s"}'::jsonb)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.admin'))) o;
insert into res select 'F4 person: record_update swapping the change is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"change":{"kind":"record_patch","patch":{"patient_capacity":99}}}'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;
insert into res select 'F5 person: record_update of decided_by alone is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"decided_by":"%s"}'::jsonb)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.admin'))) o;

-- ── CHAIR-ACCESS item 6 (person): the two batch doors lane 11 said were never probed. A refusal at the
-- ── Table wall (the approval row is in no Table) or at the trigger both leave the approval pending;
-- ── what must never happen is WROTE (pg_temp.try reports a write that went through by that word). ──
insert into res select 'X1 person: record_change_many state→approved never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_change_many(%L, %L, '[{"op":"update","record_id":"%s","patch":{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}}]'::jsonb)$q$,
  current_setting('t.cedar'), current_setting('t.rooms'), (select val from ids where k = 'a1'), current_setting('t.test'))) o;
insert into res select 'X2 person: record_change_many with no table never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_change_many(%L, null, '[{"op":"update","record_id":"%s","patch":{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}}]'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.test'))) o;
insert into res select 'X3 person: record_write_many over the approval''s id never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_write_many(%L, %L, array['{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb], array[%L::uuid])$q$,
  current_setting('t.cedar'), current_setting('t.rooms'), current_setting('t.test'), (select val from ids where k = 'a1'))) o;
insert into res select 'X4 person: record_write_many with no table over the approval''s id never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_write_many(%L, null, array['{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb], array[%L::uuid])$q$,
  current_setting('t.cedar'), current_setting('t.test'), (select val from ids where k = 'a1'))) o;

-- ── F7–F8: the same two from the agent tier (test's agent, server channel) ──────────────────────
select set_config('request.headers', '', true), set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'records', true) \g /dev/null
insert into res select 'F7 agent: record_update state→approved is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.test'))) o;
insert into res select 'F8 agent: record_update origin→agent is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"origin":"agent"}'::jsonb)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;
insert into res select 'W3 agent: deciding is still refused as an agent', o like '42501: An agent does not approve%', o from pg_temp.try(format(
  $q$select custom.work_approval_decide(%L, %L, true, null)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;
select set_config('request.headers', '{"origin":"http://localhost:3001"}', true), set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true) \g /dev/null

-- ── F9: the forged-origin chain, as one savepoint: origin→agent, then decide as the requester ───
insert into res select 'F9 person: origin→agent then self-decide is refused at the first step', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"origin":"agent"}'::jsonb); select custom.work_approval_decide(%L, %L, true, null)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;

-- ── W2: the second pair of eyes still holds at the real door ────────────────────────────────────
insert into res select 'W2 person: the requester deciding her own request is still refused', o like '42501: You asked for this change%', o from pg_temp.try(format(
  $q$select custom.work_approval_decide(%L, %L, true, null)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;

-- ── F10–F11: the sign request, from the person who asked (editor on it) ─────────────────────────
insert into res select 'F10 person: record_update writing signed_at on a sign request is refused by the signature door', pg_temp.refused_by_door(o, 'sign_request'), o from pg_temp.try(format(
  $q$select custom.record_update(%L, %L, '{"signed_at":"2026-10-03T00:00:00Z","signed_name":"Marisol Ortega"}'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'sr'))) o;


-- ── W1: admin decides a1 (applied), then F6 tries to reopen it ──────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true) \g /dev/null

-- ── CHAIR-ACCESS item 6 (admin): the two batch doors lane 11 said were never probed. A refusal at the
-- ── Table wall (the approval row is in no Table) or at the trigger both leave the approval pending;
-- ── what must never happen is WROTE (pg_temp.try reports a write that went through by that word). ──
insert into res select 'X1 admin: record_change_many state→approved never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_change_many(%L, %L, '[{"op":"update","record_id":"%s","patch":{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}}]'::jsonb)$q$,
  current_setting('t.cedar'), current_setting('t.rooms'), (select val from ids where k = 'a1'), current_setting('t.admin'))) o;
insert into res select 'X2 admin: record_change_many with no table never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_change_many(%L, null, '[{"op":"update","record_id":"%s","patch":{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}}]'::jsonb)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a1'), current_setting('t.admin'))) o;
insert into res select 'X3 admin: record_write_many over the approval''s id never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_write_many(%L, %L, array['{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb], array[%L::uuid])$q$,
  current_setting('t.cedar'), current_setting('t.rooms'), current_setting('t.admin'), (select val from ids where k = 'a1'))) o;
insert into res select 'X4 admin: record_write_many with no table over the approval''s id never goes through', o <> 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_write_many(%L, null, array['{"state":"approved","decided_at":"2026-10-03T00:00:00.000Z","decided_by":"%s"}'::jsonb], array[%L::uuid])$q$,
  current_setting('t.cedar'), current_setting('t.admin'), (select val from ids where k = 'a1'))) o;
do $$
declare r jsonb; m text;
begin
  r := custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'a1')::uuid, true, 'Yes, 7 fits');
  insert into res values ('W1 admin decides: applied, approved', coalesce((r ->> 'applied')::boolean, false) and r ->> 'state' = 'approved', r::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W1 admin decides: applied, approved', false, m);
end $$;
insert into res select 'W1b work_approval_read shows approved, decided by admin',
  r ->> 'state' = 'approved' and r ->> 'decided_by' = current_setting('t.admin'), r::text
  from custom.work_approval_read(current_setting('t.cedar')::uuid, (select val from ids where k = 'a1')::uuid) r;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true) \g /dev/null
insert into res select 'F6 person: record_restore_version reopening a decided approval is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.record_restore_version(%L, %L, 1)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;
insert into res select 'F6b person: value_restore of state is refused by the door', pg_temp.refused_by_door(o, 'work_approval'), o from pg_temp.try(format(
  $q$select custom.value_restore(%L, %L, 'state', 1)$q$, current_setting('t.cedar'), (select val from ids where k = 'a1'))) o;

-- ── W6: work_decide_many still decides (admin, a2) ──────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true) \g /dev/null
do $$
declare r jsonb; m text;
begin
  r := custom.work_decide_many(current_setting('t.cedar')::uuid,
         jsonb_build_array(jsonb_build_object('item', (select val from ids where k = 'a2'), 'decision', 'decline', 'note', 'Not this quarter')));
  insert into res values ('W6 work_decide_many still decides', (select r2 ->> 'state' from custom.work_approval_read(current_setting('t.cedar')::uuid, (select val from ids where k = 'a2')::uuid) r2) = 'declined', r::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W6 work_decide_many still decides', false, m);
end $$;

-- ── W5: archiving and restoring the approval row itself (admin) ─────────────────────────────────
insert into res select 'W5 archive of the approval row still works', o = 'WROTE', o from pg_temp.try(format(
  $q$select custom.record_delete(%L, %L); select custom.record_restore(%L, %L)$q$,
  current_setting('t.cedar'), (select val from ids where k = 'a2'), current_setting('t.cedar'), (select val from ids where k = 'a2'))) o;

-- ── W4: withdraw on archive — a pending approval on a disposable record, then archive the record ─
insert into ids select 'row2', custom.record_write(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
  '{"title":"Aquatic Therapy Annex","patient_capacity":4,"pool_lift":true}'::jsonb)::text;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true) \g /dev/null
insert into ids select 'a3', custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row2')::uuid,
  '{"kind":"record_patch","patch":{"patient_capacity":6}}'::jsonb, 'Six once the second lift is in', null, 'person', null) ->> 'approval_id';
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true) \g /dev/null
do $$
declare m text; s text;
begin
  perform custom.record_delete(current_setting('t.cedar')::uuid, (select val from ids where k = 'row2')::uuid);
  select r ->> 'state' into s from custom.work_approval_read(current_setting('t.cedar')::uuid, (select val from ids where k = 'a3')::uuid) r;
  insert into res values ('W4 archiving the subject still withdraws its pending approval', s = 'withdrawn', coalesce(s, 'NULL'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W4 archiving the subject still withdraws its pending approval', false, m);
end $$;

-- ── W8a: a sign request's own door still writes (admin reminds) ─────────────────────────────────
do $$
declare r jsonb; m text; n text;
begin
  r := custom.sign_request_remind(current_setting('t.cedar')::uuid, (select val from ids where k = 'sr')::uuid);
  reset role;
  select d.data ->> 'reminder_count' into n from custom.record d where d.id = (select val from ids where k = 'sr')::uuid;
  set local role authenticated;
  insert into res values ('W8a sign_request_remind still writes', coalesce((r ->> 'reminded')::boolean, false) and n = '1', r::text || ' count=' || coalesce(n, 'NULL'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W8a sign_request_remind still writes', false, m);
end $$;

-- ── W7: the organization archive withdraws and the undo returns (the store's own, as postgres) ──
reset role;
do $$
declare w jsonb; b jsonb; m text; s1 text; s2 text; s3 text; s4 text;
  a4 uuid; c uuid := current_setting('t.cedar')::uuid;
begin
  -- a fresh pending approval for the archive to take (as test, her browser)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true);
  a4 := (custom.work_approval_request(c, (select val from ids where k = 'row1')::uuid,
           '{"kind":"record_patch","patch":{"patient_capacity":9}}'::jsonb, 'For the archive', null, 'person', null) ->> 'approval_id')::uuid;
  reset role;
  -- only an archived organization gives anything up: the flag is set here and the store's own two
  -- functions are called exactly as iam.organization_archive / iam.organization_restore call them
  update iam.organizations set archived_at = now() where id = c;
  w := custom._organization_work_withdraw(c, current_setting('t.admin')::uuid);
  select r.data ->> 'state' into s1 from custom.record r where r.id = a4;
  select custom.sign_request_state(r.data) into s3 from custom.record r where r.id = (select val from ids where k = 'sr')::uuid;
  update iam.organizations set archived_at = null where id = c;
  b := custom._organization_work_return(c, current_setting('t.admin')::uuid);
  select r.data ->> 'state' into s2 from custom.record r where r.id = a4;
  select custom.sign_request_state(r.data) into s4 from custom.record r where r.id = (select val from ids where k = 'sr')::uuid;
  insert into res values ('W7 organization archive withdraws (approval + sign request) and the undo returns both',
    s1 = 'withdrawn' and s2 = 'pending' and s3 = 'invalidated' and s4 in ('sent', 'viewed'),
    format('states=%s/%s sign=%s/%s withdraw=%s return=%s', s1, s2, s3, s4, w::text, b::text));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W7 organization archive withdraws (approval + sign request) and the undo returns both', false, m);
end $$;

-- ── W8b: cancel still writes (admin) ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true) \g /dev/null
do $$
declare r jsonb; m text;
begin
  r := custom.sign_request_cancel(current_setting('t.cedar')::uuid, (select val from ids where k = 'sr')::uuid, 'Sent to the wrong address');
  insert into res values ('W8b sign_request_cancel still writes', r ->> 'state' = 'invalidated', r::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('W8b sign_request_cancel still writes', false, m);
end $$;
-- F11: the cancelled request put back to its first version would be live again — from the asker's seat
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true) \g /dev/null
insert into res select 'F11 person: record_restore_version un-cancelling a sign request is refused by the signature door', pg_temp.refused_by_door(o, 'sign_request'), o from pg_temp.try(format(
  $q$select custom.record_restore_version(%L, %L, 1)$q$, current_setting('t.cedar'), (select val from ids where k = 'sr'))) o;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairselfapproval_a_decision_is_made_at_its_own_door.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
