-- LANE 5 VISION-REACH, WAVE 4 (c) — EVERY KIND THE AGENT CLIENT FILES CAN BE APPLIED.
-- Guard for migrations/campaign/visionreach_w4_c_every_kind_an_agent_files_can_be_applied.sql
--
-- The break it names: the agent client (matrx_records RecordStore) files a kind the one approval queue
-- refuses, or one the queue accepts but custom.work_approval_decide cannot carry out — the agent's change is
-- then neither made nor waiting, and nobody is told.
--
-- Cedar Ridge Physical Therapy, its Treatment Rooms table; test@test.com is given editor on it (rolled back);
-- her agent asks; admin@admin.com (owner) approves.
--   C0  CENSUS: every kind the agent client files (the literal list below, from matrx_records store/client.py
--       — `"kind": "…"` in a change sent to file_the_wait) is either in custom.work_approval_kinds() or is
--       signature_request, the one kind the client now refuses itself
--   C1  record_restore_version (the whole record) is filed, and approving puts the room back: capacity is
--       the version's value again, as a NEW version credited to the agent and approved by admin
--   C2  record_restore_version with field_key puts back that ONE value and leaves the other change standing
--   C3  subscription_add is filed, and approving saves the view (watch -> filters) and one subscription per
--       `tell`, telling the requester (test) unless the entry names somebody
--   C4  a put-back that names no version is refused before it is filed (22004)
--   C5  signature_request is still refused by the queue (22023) — the deliberate dead end the client avoids
-- THE VERDICT IS THE EXIT CODE. Everything is rolled back.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_w4_every_filed_kind_applies.sql
\set ON_ERROR_STOP on
\set suite 'visionreach_w4_every_filed_kind_applies.sql'
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

select set_config('t.admin', '87a6e699-3622-4869-8843-d0867456c0dd', true),
       set_config('t.test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true),
       set_config('t.cedar', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),
       set_config('t.rooms', '89919d7d-cbbc-4600-8ea7-3f63db964631', true)
\g /dev/null
insert into ids select 'row1', id::text from custom.record where organization_id = current_setting('t.cedar')::uuid
   and table_id = current_setting('t.rooms')::uuid and deleted_at is null order by created_at limit 1;
insert into ids select 'row2', id::text from custom.record where organization_id = current_setting('t.cedar')::uuid
   and table_id = current_setting('t.rooms')::uuid and deleted_at is null order by created_at offset 1 limit 1;

-- C0: the census of the kinds the agent client files (store/client.py, 2026-10-02):
--   record_patch, record_add, record_delete, record_restore, record_restore_version, field_add, table_add,
--   subscription_add, doc_template_add, signature_request (no longer filed: the client refuses it itself)
do $$
declare v_missing text;
begin
  select string_agg(k, ', ') into v_missing
    from unnest(array['record_patch','record_add','record_delete','record_restore','record_restore_version',
                      'field_add','table_add','subscription_add','doc_template_add']) k
   where not (k = any (custom.work_approval_kinds()));
  insert into res values ('C0 every kind the agent client files is one the queue holds', v_missing is null, coalesce(v_missing, 'all held'));
end $$;

-- admin (her own browser): share with test, then make two changes to room 1 the agent will undo
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true),
       set_config('app.actor_tier', '', true), set_config('app.conversation_id', '', true) \g /dev/null
select custom.share_grant(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid, 'person',
                          current_setting('t.test')::uuid, 'editor'::public.permission_level) \g /dev/null
reset role;
insert into ids select 'v0', version::text from custom.record where id = (select val from ids where k = 'row1')::uuid;
insert into ids select 'cap0', data ->> 'patient_capacity' from custom.record where id = (select val from ids where k = 'row1')::uuid;
insert into ids select 'title0', data ->> 'title' from custom.record where id = (select val from ids where k = 'row2')::uuid;
insert into ids select 'r2v0', version::text from custom.record where id = (select val from ids where k = 'row2')::uuid;
set local role authenticated;
select custom.record_update(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid, '{"patient_capacity": 11}'::jsonb, null) \g /dev/null
select custom.record_update(current_setting('t.cedar')::uuid, (select val from ids where k = 'row2')::uuid,
                            '{"patient_capacity": 12, "title": "Therapy Gym B (east wing)"}'::jsonb, null) \g /dev/null

-- ── test's AGENT asks (server seat, agent declared, acting as test) ─────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.test'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '', true), set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'records', true) \g /dev/null
do $$
declare v jsonb; m text; c text;
begin
  begin
    v := custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
           jsonb_build_object('kind', 'record_restore_version', 'to_version', (select val from ids where k = 'v0')::int),
           'Capacity went back to what it was', null, 'agent', null);
    insert into ids values ('ask_restore', v ->> 'approval_id');
    insert into res values ('C1a record_restore_version is filed', v ->> 'state' = 'pending', v::text);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('C1a record_restore_version is filed', false, c || ' ' || m);
  end;
  begin
    v := custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row2')::uuid,
           jsonb_build_object('kind', 'record_restore_version', 'to_version', (select val from ids where k = 'r2v0')::int, 'field_key', 'patient_capacity'),
           'Only the capacity was wrong', null, 'agent', null);
    insert into ids values ('ask_value', v ->> 'approval_id');
    insert into res values ('C2a one-value put-back is filed', v ->> 'state' = 'pending', v::text);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('C2a one-value put-back is filed', false, c || ' ' || m);
  end;
  begin
    v := custom.work_approval_request(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
           jsonb_build_object('kind', 'subscription_add', 'watch', jsonb_build_object('pool_lift', true),
                              'tell', jsonb_build_array(jsonb_build_object('channel', 'in_app', 'cadence', 'instant')),
                              'view_name', 'Rooms with a pool lift'),
           'Tell me when a pool-lift room changes', null, 'agent', null);
    insert into ids values ('ask_sub', v ->> 'approval_id');
    insert into res values ('C3a subscription_add is filed', v ->> 'state' = 'pending', v::text);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('C3a subscription_add is filed', false, c || ' ' || m);
  end;
  begin
    v := custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
           '{"kind":"record_restore_version"}'::jsonb, null, null, 'agent', null);
    insert into res values ('C4 a put-back naming no version is refused (22004)', false, 'FILED: ' || v::text);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('C4 a put-back naming no version is refused (22004)', c = '22004', c || ' ' || m);
  end;
  begin
    v := custom.work_approval_request(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid,
           '{"kind":"signature_request"}'::jsonb, null, null, 'agent', null);
    insert into res values ('C5 signature_request is still refused by the queue (22023)', false, 'FILED: ' || v::text);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('C5 signature_request is still refused by the queue (22023)', c = '22023', c || ' ' || m);
  end;
end $$;

-- ── admin approves (her own browser) and the result is read back ────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true), set_config('app.actor_tier', '', true),
       set_config('app.actor_system', '', true) \g /dev/null
do $$
declare v jsonb; m text; r record; h jsonb; v_rule record; v_view jsonb;
begin
  if (select val from ids where k = 'ask_restore') is not null then
    begin
      v := custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_restore')::uuid, true, null);
      reset role;
      select data ->> 'patient_capacity' as cap, version into r from custom.record where id = (select val from ids where k = 'row1')::uuid;
      set local role authenticated;
      select x.actor into h from custom.record_history(current_setting('t.cedar')::uuid, (select val from ids where k = 'row1')::uuid) x order by x.version desc limit 1;
      insert into res values ('C1b approving puts the room back, as a new version, credited to the agent',
        v ->> 'state' = 'approved' and r.cap is not distinct from (select val from ids where k = 'cap0')
          and r.version > (select val from ids where k = 'v0')::int + 1
          and h ->> 'kind' = 'agent' and h #>> '{approved_by,user_id}' = current_setting('t.admin'),
        coalesce(v ->> 'message', '') || ' cap=' || coalesce(r.cap, 'NULL') || ' / ' || coalesce(h::text, 'NULL'));
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('C1b approving puts the room back, as a new version, credited to the agent', false, m);
    end;
  else
    insert into res values ('C1b approving puts the room back, as a new version, credited to the agent', false, 'nothing filed');
  end if;

  if (select val from ids where k = 'ask_value') is not null then
    begin
      v := custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_value')::uuid, true, null);
      reset role;
      select data ->> 'title' as title, data ->> 'patient_capacity' as cap into r from custom.record where id = (select val from ids where k = 'row2')::uuid;
      set local role authenticated;
      insert into res values ('C2b approving puts back that one value and keeps the other change',
        v ->> 'state' = 'approved' and r.title = 'Therapy Gym B (east wing)' and r.cap is distinct from '12',
        coalesce(v ->> 'message', '') || ' title=' || coalesce(r.title, 'NULL') || ' cap=' || coalesce(r.cap, 'NULL'));
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('C2b approving puts back that one value and keeps the other change', false, m);
    end;
  else
    insert into res values ('C2b approving puts back that one value and keeps the other change', false, 'nothing filed');
  end if;

  if (select val from ids where k = 'ask_sub') is not null then
    begin
      v := custom.work_approval_decide(current_setting('t.cedar')::uuid, (select val from ids where k = 'ask_sub')::uuid, true, null);
      reset role;
      select data -> 'subscription' as sub into v_rule from custom.record where id = (v -> 'record_ids' ->> 0)::uuid;
      select jsonb_build_object('name', sv.name, 'definition', sv.definition) into v_view from platform.saved_view sv where sv.id = (v_rule.sub ->> 'saved_view_id')::uuid;
      set local role authenticated;
      insert into res values ('C3b approving saves the view and the subscription, telling the requester',
        v ->> 'state' = 'approved' and jsonb_array_length(v -> 'record_ids') = 1
          and v_rule.sub ->> 'recipient_user_id' = current_setting('t.test')
          and v_rule.sub ->> 'channel' = 'in_app'
          and v_view ->> 'name' = 'Rooms with a pool lift' and v_view::text like '%pool_lift%',
        coalesce(v ->> 'message', '') || ' / ' || coalesce(v_rule.sub::text, 'NULL') || ' / ' || left(coalesce(v_view::text, 'NULL'), 80));
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('C3b approving saves the view and the subscription, telling the requester', false, m);
    end;
  else
    insert into res values ('C3b approving saves the view and the subscription, telling the requester', false, 'nothing filed');
  end if;
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 220) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'visionreach_w4_every_filed_kind_applies.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
