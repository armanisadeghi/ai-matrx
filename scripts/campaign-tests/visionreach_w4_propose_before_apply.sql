-- LANE 5 VISION-REACH, WAVE 4 (a) — PROPOSE BEFORE APPLY: THE STORE ASKS BEFORE AN AGENT CHANGES A TABLE.
-- Guard for migrations/campaign/visionreach_w4_a_the_store_asks_before_an_agent_changes_a_table.sql
-- (and visionreach_w4_a2_the_store_asks_before_an_agent_changes_a_column.sql for custom.field_update).
--
-- The break it names: a store door that lets an AGENT-declared write change an existing table while the
-- organization's "Agent changes to this organization's data" setting says `ask`. Before (a) the setting
-- lived only in the agent client, so any caller that did not ask changed the table.
--
-- Cedar Ridge Physical Therapy (setting `ask`), its existing Treatment Rooms table, admin@admin.com (owner)
-- as the person the agent acts for, on the server's own seat (role authenticated + her claims,
-- app.actor_tier = agent, no request.headers):
--   R1  agent field_declare on the existing table                   -> refused 42501 with the setting's sentences
--   R2  agent record_write into it                                  -> refused
--   R3  agent record_update of one of its rows                      -> refused
--   R4  agent record_delete of one of its rows                      -> refused
--   R5  agent record_write_many / record_change_many into it        -> refused
--   R6  agent field_update of one of its columns (file a2)          -> refused
--   G1  the table stamped as made in conversation X, X declared     -> the agent's field_declare lands
--   G2  ...conversation Y declared (not the one that made it)       -> refused: the exemption is the stamp's
--   G3  the same two through a browser agent client's headers (x-matrx-actor-tier / x-matrx-conversation-id)
--   G4  agent table_declare + its column in ONE transaction, no conversation at all -> lands
--   G5  the agent's PROPOSAL path still files: work_approval_request(record_add, origin agent) -> pending
--   G6  a person deciding that proposal applies it (the door runs as the person)
--   G7  the person's own field_declare on the table                 -> lands (people are never asked)
--   G8  setting `never_ask`: the agent's field_declare               -> lands
-- Two inputs that differ only in the declared conversation (G1 vs G2) and only in the setting (R1 vs G8)
-- keep a constant answer from passing. THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under
-- ON_ERROR_STOP), GREEN exits 0. Everything is rolled back.
--
-- RUN IT (dev clone only), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_w4_propose_before_apply.sql
\set ON_ERROR_STOP on
\set suite 'visionreach_w4_propose_before_apply.sql'
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
grant all on res to authenticated, service_role;

select set_config('t.me',     '87a6e699-3622-4869-8843-d0867456c0dd', true),   -- admin@admin.com (owner)
       set_config('t.cedar',  '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),   -- Cedar Ridge Physical Therapy
       set_config('t.rooms',  '89919d7d-cbbc-4600-8ea7-3f63db964631', true),   -- its Treatment Rooms table
       set_config('t.convx',  'c0a1b2c3-4d5e-4f60-8a7b-9c0d1e2f3a4b', true),   -- the conversation that "made" it (G1)
       set_config('t.convy',  'd1e2f3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6', true)    -- another conversation (G2)
\g /dev/null
do $$
begin
  if platform.knob_resolve('custom', 'agent_schema_changes', current_setting('t.cedar')::uuid) #>> '{}' <> 'ask' then
    raise exception 'fixture: Cedar Ridge is not on `ask` on this target';
  end if;
  if not exists (select 1 from custom.record where id = current_setting('t.rooms')::uuid and data_class = 'table' and deleted_at is null) then
    raise exception 'fixture: the Cedar Ridge Treatment Rooms table is missing on this target';
  end if;
  perform set_config('t.row1', (select id::text from custom.record
                                 where organization_id = current_setting('t.cedar')::uuid
                                   and table_id = current_setting('t.rooms')::uuid and deleted_at is null
                                 order by created_at limit 1), true);
  perform set_config('t.row2', (select id::text from custom.record
                                 where organization_id = current_setting('t.cedar')::uuid
                                   and table_id = current_setting('t.rooms')::uuid and deleted_at is null
                                 order by created_at offset 1 limit 1), true);
  perform set_config('t.column', (select id::text from custom.record
                                   where organization_id = current_setting('t.cedar')::uuid and data_class = 'field'
                                     and data ->> 'entity_definition_id' = current_setting('t.rooms') and deleted_at is null
                                     and data ->> 'key' = 'title'), true);
  perform set_config('t.home', (select data ->> 'parent_id' from custom.record where id = current_setting('t.rooms')::uuid), true);
  if current_setting('t.row2', true) is null or current_setting('t.column', true) is null then
    raise exception 'fixture: Treatment Rooms needs two rooms and its title column on this target';
  end if;
end $$;

create or replace function pg_temp.refused(p_sql text, out ok boolean, out detail text) language plpgsql as $f$
declare m text; c text; h text;
begin
  begin
    execute p_sql;
    ok := false; detail := 'LANDED: ' || left(p_sql, 90);
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate, h = pg_exception_hint;
    -- The setting's own two sentences: why (custom.agent_change_approval) and where to change it.
    ok := c = '42501' and m like '%already existed%' and coalesce(h, '') like '%Agent changes to this organization%';
    detail := c || ' ' || left(m, 110) || ' | ' || left(coalesce(h, ''), 60);
  end;
end $f$;
create or replace function pg_temp.lands(p_sql text, out ok boolean, out detail text) language plpgsql as $f$
declare m text; c text;
begin
  begin
    execute p_sql;
    ok := true; detail := 'landed';
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    ok := false; detail := c || ' ' || left(m, 150);
  end;
end $f$;

-- ── THE AGENT'S SEAT: the server acting as admin@admin.com for an agent turn ─────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true),
       set_config('request.headers', '', true),
       set_config('app.actor_tier', 'agent', true),
       set_config('app.actor_system', 'records', true),
       set_config('app.actor_agent', '', true),
       set_config('app.conversation_id', '', true)
\g /dev/null

do $$
declare r record; t text := current_setting('t.rooms'); o text := current_setting('t.cedar');
        me text := current_setting('t.me');
begin
  r := pg_temp.refused(format($q$select custom.field_declare(%L, %L, '{"key":"cleaning_window","label":"Cleaning window","type":"text","source":"agent"}'::jsonb)$q$, o, t));
  insert into res values ('R1 agent field_declare on an existing table is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.record_write(%L, %L, %L::jsonb)$q$, o, t,
         jsonb_build_object('title', 'Vestibular Rehab Room', 'patient_capacity', 2, 'pool_lift', false, '_actor', 'agent', '_on_behalf_of', me)));
  insert into res values ('R2 agent record_write into an existing table is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.record_update(%L, %L, %L::jsonb, null)$q$, o, current_setting('t.row1'),
         jsonb_build_object('patient_capacity', 5, '_actor', 'agent', '_on_behalf_of', me)));
  insert into res values ('R3 agent record_update of an existing row is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.record_delete(%L, %L)$q$, o, current_setting('t.row2')));
  insert into res values ('R4 agent record_delete is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.record_write_many(%L, %L, array[%L::jsonb], null)$q$, o, t,
         jsonb_build_object('title', 'Pediatric Gym', 'patient_capacity', 3, 'pool_lift', false)));
  insert into res values ('R5a agent record_write_many is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.record_change_many(%L, %L, %L::jsonb)$q$, o, t,
         jsonb_build_array(jsonb_build_object('op', 'update', 'record_id', current_setting('t.row1'), 'patch', jsonb_build_object('patient_capacity', 3)))));
  insert into res values ('R5b agent record_change_many is refused', r.ok, r.detail);
  r := pg_temp.refused(format($q$select custom.field_update(%L, %L, '{"label":"Room"}'::jsonb)$q$, o, current_setting('t.column')));
  insert into res values ('R6 agent field_update of an existing column is refused', r.ok, r.detail);
end $$;

-- ── G1 / G2: the exemption is the store's own stamp for THIS conversation ─────────────────────────────────
reset role;
insert into custom.agent_table_origin (organization_id, table_id, conversation_id, created_by)
values (current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid, current_setting('t.convx')::uuid, current_setting('t.me')::uuid);
set local role authenticated;
select set_config('app.conversation_id', current_setting('t.convx'), true) \g /dev/null
do $$
declare r record;
begin
  r := pg_temp.lands(format($q$select custom.field_declare(%L, %L, '{"key":"floor","label":"Floor","type":"text","source":"agent"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G1 conversation that made the table: agent field_declare lands', r.ok, r.detail);
end $$;
select set_config('app.conversation_id', current_setting('t.convy'), true) \g /dev/null
do $$
declare r record;
begin
  r := pg_temp.refused(format($q$select custom.field_declare(%L, %L, '{"key":"accessible_entrance","label":"Accessible entrance","type":"text","source":"agent"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G2 another conversation: refused', r.ok, r.detail);
end $$;

-- ── G3: a browser agent client (PostgREST channel) names its tier and conversation in headers ────────────
select set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true), set_config('app.conversation_id', '', true) \g /dev/null
select set_config('request.headers', json_build_object('origin', 'chrome-extension://matrx', 'x-matrx-actor-tier', 'agent',
         'x-matrx-actor-system', 'matrx-extend:agent', 'x-matrx-conversation-id', current_setting('t.convy'))::text, true) \g /dev/null
do $$
declare r record;
begin
  r := pg_temp.refused(format($q$select custom.field_declare(%L, %L, '{"key":"sink","label":"Sink","type":"text","source":"agent"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G3a browser agent client, other conversation: refused', r.ok, r.detail);
end $$;
select set_config('request.headers', json_build_object('origin', 'chrome-extension://matrx', 'x-matrx-actor-tier', 'agent',
         'x-matrx-actor-system', 'matrx-extend:agent', 'x-matrx-conversation-id', current_setting('t.convx'))::text, true) \g /dev/null
do $$
declare r record;
begin
  r := pg_temp.lands(format($q$select custom.field_declare(%L, %L, '{"key":"window","label":"Window","type":"text","source":"agent"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G3b browser agent client, its own conversation: lands', r.ok, r.detail);
end $$;

-- back to the server seat, no conversation
select set_config('request.headers', '', true), set_config('app.actor_tier', 'agent', true),
       set_config('app.actor_system', 'records', true), set_config('app.conversation_id', '', true) \g /dev/null

-- ── G4: a new table and its column in one transaction, no conversation ───────────────────────────────────
-- In admin's Workspace (Cedar Ridge's own Home is busy with other lanes' long writers on the clone), with
-- that organization's setting moved to `ask` for this transaction by its owner.
select set_config('app.actor_tier', '', true), set_config('request.headers', '{"origin":"http://localhost:3001"}', true) \g /dev/null
do $$
declare v jsonb;
begin
  v := platform.knob_override_set('custom', 'agent_schema_changes', 'organization', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid,
                                  '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid, '"ask"'::jsonb, 'visionreach w4 guard (rolled back)');
  insert into res values ('G4 fixture: admin''s Workspace moves to ask', coalesce((v ->> 'ok')::boolean, false), v::text);
end $$;
select set_config('request.headers', '', true), set_config('app.actor_tier', 'agent', true) \g /dev/null
do $$
declare v_t uuid; m text;
begin
  v_t := custom.table_declare('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid, jsonb_build_object(
           'name', 'Wheelchair Loaner Log', 'slug', 'wheelchair_loaner_log', 'type', 'entity', 'weight', 'light',
           'display', 'list', 'ordered', false, 'row_order', 'manual', 'title_field', 'chair_serial',
           'label_plural', 'Wheelchair loans', 'label_singular', 'Wheelchair loan', 'agent_writable', true,
           'retention_days', 365, 'default_sort', '[{"field":"chair_serial","direction":"asc"}]'::jsonb,
           'fields', '[{"name":"chair_serial"}]'::jsonb, 'parent_id', '19b5970f-b3e5-5d34-b505-d8c44450d42f'));
  perform custom.field_declare('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid, v_t,
           '{"key":"chair_serial","label":"Chair serial","type":"text","source":"agent"}'::jsonb);
  insert into res values ('G4 agent table + its column in one transaction: lands', true, v_t::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('G4 agent table + its column in one transaction: lands', false, left(m, 160));
end $$;

-- ── G5: the agent's proposal still files (the request door tries the rows in a savepoint) ───────────────
do $$
declare v jsonb; m text;
begin
  v := custom.work_approval_request(current_setting('t.cedar')::uuid, current_setting('t.rooms')::uuid,
         jsonb_build_object('kind', 'record_add', 'rows', jsonb_build_array(
           jsonb_build_object('title', 'Aquatic Therapy Pool 2', 'patient_capacity', 3, 'pool_lift', true))),
         'Add the second pool room', null, 'agent', null);
  perform set_config('t.approval', v ->> 'approval_id', true);
  insert into res values ('G5 agent record_add proposal is filed', v ->> 'state' = 'pending', v::text);
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('G5 agent record_add proposal is filed', false, m);
end $$;

-- ── G6 / G7 / G8: a person — her own browser (PostgREST, no agent header) ────────────────────────────────
select set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true),
       set_config('request.headers', '{"origin":"http://localhost:3001"}', true) \g /dev/null
do $$
declare v jsonb; m text; r record;
begin
  if coalesce(current_setting('t.approval', true), '') <> '' then
    begin
      v := custom.work_approval_decide(current_setting('t.cedar')::uuid, current_setting('t.approval')::uuid, true, null);
      insert into res values ('G6 the person approves: the row lands', v ->> 'state' = 'approved' and jsonb_array_length(v -> 'record_ids') = 1, v::text);
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('G6 the person approves: the row lands', false, m);
    end;
  else
    insert into res values ('G6 the person approves: the row lands', false, 'no approval filed in G5');
  end if;
  r := pg_temp.lands(format($q$select custom.field_declare(%L, %L, '{"key":"treadmill_count","label":"Treadmill count","type":"text"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G7 the person''s own field_declare lands', r.ok, r.detail);
  v := platform.knob_override_set('custom', 'agent_schema_changes', 'organization', current_setting('t.cedar')::uuid,
                                  current_setting('t.cedar')::uuid, '"never_ask"'::jsonb, 'visionreach w4 guard (rolled back)');
  insert into res values ('G8 fixture: the setting moves to never_ask', coalesce((v ->> 'ok')::boolean, false), v::text);
end $$;
select set_config('request.headers', '', true), set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'records', true) \g /dev/null
do $$
declare r record;
begin
  r := pg_temp.lands(format($q$select custom.field_declare(%L, %L, '{"key":"booking_notes","label":"Booking notes","type":"text","source":"agent"}'::jsonb)$q$, current_setting('t.cedar'), current_setting('t.rooms')));
  insert into res values ('G8 never_ask: the agent''s field_declare lands', r.ok, r.detail);
end $$;
reset role;

select check_name, coalesce(ok, false) as ok, left(detail, 170) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'visionreach_w4_propose_before_apply.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
