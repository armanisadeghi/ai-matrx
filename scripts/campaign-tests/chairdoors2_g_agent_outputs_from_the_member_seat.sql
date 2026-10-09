-- LANE CHAIR-DOORS-2 — THE AGENT-OUTPUT DOORS, ASKED FROM THE MEMBER'S SEAT (v6 lane 4 KINDS-GLUE N-C1, N-C3, N-C6).
-- Guard for migrations/campaign/chairdoors2_g_every_member_adds_to_a_table_kept_for_agent_outputs.sql (N-C6),
--           migrations/campaign/chairdoors2_h_a_persons_edit_of_an_agent_output_keeps_it.sql (N-C3),
--           migrations/campaign/chairdoors2_i_a_new_output_replaces_the_old_under_one_lock.sql (N-C1).
--
-- The fixture is a pair of output tables in Cedar Ridge Physical Therapy made by the platform (a deck
-- table whose `cards` relation contains rows of a card table, both kept_for agent_output with the
-- design's platform Fields), and one row admin@admin.com's agent wrote there. Every check then runs as
-- `authenticated` with test@test.com's claims (a MEMBER of Cedar Ridge, not an owner): her agent's turn
-- (actor agent, acting for her) and her own hands (actor user). One transaction, rolled back.
--   N-C6  her agent lands into a table admin made; she adds a row by hand; she imports `rows`; she
--         edits her own row; she cannot edit admin's row.
--   N-C3  her hand on a platform Field is refused by name; her value edit marks the row kept; she may
--         Keep (output_kept true) and may not un-keep; her agent's door writes the platform Fields.
--   N-C1  first / duplicate / join (old head AND its contained records superseded, one current row) /
--         expected_current refused with nothing written / a refused child refuses the whole landing and
--         the old head stays current / edit in place / edit of a superseded row refused / edit of a kept
--         row lands a new row / make_current / split / rewind / out_of_date; after every mode each chain
--         has at most one current row.
-- Two concurrent landings → one head is proven with two connections by
-- scripts/campaign-tests/chairdoors2_g_two_landings_one_head.sh (it must commit, so it cannot live here).
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_g_agent_outputs_from_the_member_seat.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_g_agent_outputs_from_the_member_seat.sql'
\set expect 'clone'
\set requires 'exec:custom.table_ensure|row:chat.message:id = \'82ffe2b2-96e4-468d-9fed-eb18db9583bf\''
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

-- ── FIXTURE, as the platform (store owner, actor system) ───────────────────────────────────────
select '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as me,      -- test@test.com (member)
       '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin,   -- admin@admin.com (owner)
       '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid as cedar,   -- Cedar Ridge Physical Therapy
       '82ffe2b2-96e4-468d-9fed-eb18db9583bf'::uuid as msg      -- an assistant message in her Cedar Ridge chat
\gset
select set_config('app.actor_tier', 'system', true), set_config('app.actor_system', 'kinds_glue_output_tables', true) \g /dev/null
select custom.table_ensure(:'cedar', jsonb_build_object(
  'name', 'Exercise card outputs', 'slug', 'agent_output_cd2g_flashcard',
  'type', 'entity', 'weight', 'light', 'display', 'list', 'ordered', false, 'row_order', 'manual', 'title_field', 'title',
  'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
  'label_plural', 'Exercise card outputs', 'label_singular', 'Exercise card output', 'agent_writable', true, 'retention_days', 365,
  'kept_by_the_app', true, 'kept_for', 'agent_output', 'kind', 'flashcard',
  'fields', jsonb_build_array(
    jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text'),
    jsonb_build_object('key', 'output_state', 'label', 'Output state', 'type', 'select', 'options', jsonb_build_array('draft', 'superseded'), 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_chain', 'label', 'Chain', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_generation', 'label', 'Generation', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_reason', 'label', 'Reason', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output'))
  ))) ->> 'table_id' as card_table \gset
select custom.table_ensure(:'cedar', jsonb_build_object(
  'name', 'Exercise deck outputs', 'slug', 'agent_output_cd2g_flashcard_set',
  'type', 'entity', 'weight', 'light', 'display', 'list', 'ordered', false, 'row_order', 'manual', 'title_field', 'title',
  'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
  'label_plural', 'Exercise deck outputs', 'label_singular', 'Exercise deck output', 'agent_writable', true, 'retention_days', 365,
  'kept_by_the_app', true, 'kept_for', 'agent_output', 'kind', 'flashcard_set',
  'fields', jsonb_build_array(
    jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text'),
    jsonb_build_object('key', 'patient_group', 'label', 'Patient group', 'type', 'text'),
    jsonb_build_object('key', 'cards', 'label', 'Cards', 'type', 'relation', 'relation_target', :'card_table', 'multi', true),
    jsonb_build_object('key', 'output_state', 'label', 'Output state', 'type', 'select', 'options', jsonb_build_array('draft', 'superseded'), 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_kept', 'label', 'Kept', 'type', 'checkbox', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_out_of_date', 'label', 'Out of date', 'type', 'checkbox', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_chain', 'label', 'Chain', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_generation', 'label', 'Generation', 'type', 'number', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_replaced_by', 'label', 'Replaced by', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output')),
    jsonb_build_object('key', 'output_reason', 'label', 'Reason', 'type', 'text', 'config', jsonb_build_object('kept_by', 'agent_output'))
  ))) ->> 'table_id' as deck_table \gset
-- admin@admin.com's agent wrote one row there (her turn, not this member's).
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) \g /dev/null
select set_config('app.actor_tier', 'agent', true), set_config('app.actor_system', 'chat_kind_emission', true) \g /dev/null
select custom.record_write(:'cedar', :'deck_table',
  '{"title": "Shoulder impingement — home program", "output_state": "draft", "output_generation": 1}'::jsonb) as admin_row \gset
select set_config('request.jwt.claims', '', true), set_config('app.actor_tier', '', true), set_config('app.actor_system', '', true) \g /dev/null
select set_config('t.' || k, v, true) from (values ('me', :'me'), ('cedar', :'cedar'), ('msg', :'msg'),
  ('card_table', :'card_table'), ('deck_table', :'deck_table'), ('admin_row', :'admin_row')) x(k, v) \g /dev/null

-- One call of the chain door, as written by the lander; NULL when the door is absent (that is RED, not a crash).
create function pg_temp.land(p_lock text, p_fp text, p_parent jsonb, p_children jsonb, p_chain jsonb)
returns jsonb language plpgsql as $f$
begin
  if to_regprocedure('custom.record_write_graph_superseding(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)') is null then
    return null;
  end if;
  execute 'select custom.record_write_graph_superseding($1, $2, $3, $4, $5, $6, $7, $8, $9)'
     into p_parent
    using current_setting('t.cedar')::uuid, current_setting('t.deck_table')::uuid, p_lock,
          case when p_fp is null then null else jsonb_build_object('message_id', current_setting('t.msg'), 'fingerprint', p_fp, 'ordinal', 0, 'kind', 'flashcard_set') end,
          p_parent, '[]'::jsonb, coalesce(p_children, '[]'::jsonb), p_chain, null::jsonb;
  return p_parent;
end $f$;
grant execute on function pg_temp.land(text, text, jsonb, jsonb, jsonb) to authenticated;

-- Seats. The agent seat: her turn's agent on the server channel (app.actor_tier agent, acting for her).
-- The hand seat: herself in the browser — PostgREST's request.headers and her claims, no tier declared.
create function pg_temp.seat(p_who text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true),
         set_config('request.headers', case when p_who = 'agent' then '' else '{}' end, true),
         set_config('app.actor_tier', case when p_who = 'agent' then 'agent' else '' end, true),
         set_config('app.actor_system', case when p_who = 'agent' then 'chat_kind_emission' else '' end, true);
$f$;
grant execute on function pg_temp.seat(text) to authenticated;
-- How many current rows a chain has (read as the owner after the seat call).
create function pg_temp.heads(p_chain text) returns integer language sql as $f$
  select count(*)::int from custom.record r
   where r.organization_id = current_setting('t.cedar')::uuid and r.table_id = current_setting('t.deck_table')::uuid
     and r.deleted_at is null and r.data ->> 'output_chain' = p_chain and r.data ->> 'output_state' = 'draft';
$f$;
create function pg_temp.st(p_id text) returns jsonb language sql as $f$
  select r.data - '_values' from custom.record r where r.organization_id = current_setting('t.cedar')::uuid and r.id = nullif(p_id, '')::uuid;
$f$;

-- ══ N-C6 — SHE ADDS, IMPORTS, EDITS HER OWN, NEVER ADMIN'S ═════════════════════════════════════
set local role authenticated;
select pg_temp.seat('hand') \g /dev/null
do $$
declare v uuid; w jsonb; f jsonb; m text;
begin
  begin
    v := custom.record_write(current_setting('t.cedar')::uuid, current_setting('t.deck_table')::uuid,
                             '{"title": "Ankle sprain — balance progression", "patient_group": "Sports"}'::jsonb);
    perform set_config('t.my_row', v::text, true);
    insert into res values ('N-C6 member adds a row to an output table', true, v::text);
  exception when others then
    insert into res values ('N-C6 member adds a row to an output table', false, sqlerrm);
  end;
  begin
    w := custom.io_import_begin(current_setting('t.cedar')::uuid, current_setting('t.deck_table')::uuid, 'rows',
                                'Agent: hip deck', '[]'::jsonb, current_setting('t.msg') || ':fp-import:0', '{"unmapped": "ignore"}'::jsonb);
    f := custom.io_import_rows(current_setting('t.cedar')::uuid, (w ->> 'import_id')::uuid,
           '[{"title": "Total hip replacement — week 2", "patient_group": "Post-op"}]'::jsonb, '{}'::jsonb);
    perform custom.io_import_finish(current_setting('t.cedar')::uuid, (w ->> 'import_id')::uuid, null);
    insert into res values ('N-C6 member imports rows into an output table', coalesce((f ->> 'rows_written')::int, 0) = 1, left(f::text, 200));
  exception when others then
    insert into res values ('N-C6 member imports rows into an output table', false, sqlerrm);
  end;
  begin
    perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.admin_row')::uuid, '{"title": "Changed by another member"}'::jsonb);
    insert into res values ('N-C6 member cannot edit another person''s row', false, 'it was written');
  exception when insufficient_privilege then
    insert into res values ('N-C6 member cannot edit another person''s row', true, sqlerrm);
  when others then
    insert into res values ('N-C6 member cannot edit another person''s row', false, sqlerrm);
  end;
  begin
    perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.my_row')::uuid, '{"patient_group": "Sports medicine"}'::jsonb);
    insert into res values ('N-C6 member edits her own row', true, 'ok');
  exception when others then
    insert into res values ('N-C6 member edits her own row', false, sqlerrm);
  end;
end $$;

-- ══ N-C3 — HER HAND NEVER MOVES A PLATFORM FIELD; HER EDIT KEEPS THE ROW ═══════════════════════
do $$
declare m text;
begin
  begin
    perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.my_row')::uuid, '{"output_state": "superseded"}'::jsonb);
    insert into res values ('N-C3 member write to a platform field is refused', false, 'it was written');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('N-C3 member write to a platform field is refused',
      m = '"Output state" is a platform table, so it is not yours to change.', m);
  end;
  begin
    perform custom.record_write(current_setting('t.cedar')::uuid, current_setting('t.deck_table')::uuid,
                                '{"title": "Rotator cuff — week 1", "output_chain": "00000000-0000-4000-8000-000000000001"}'::jsonb);
    insert into res values ('N-C3 member cannot add a row that claims a chain', false, 'it was written');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('N-C3 member cannot add a row that claims a chain', m = '"Chain" is a platform table, so it is not yours to change.', m);
  end;
end $$;
reset role;
insert into res select 'N-C3 member edit sets kept', coalesce((pg_temp.st(current_setting('t.my_row', true)) ->> 'output_kept')::boolean, false),
                       coalesce(pg_temp.st(current_setting('t.my_row', true))::text, 'no row');
insert into res select 'N-C3 the imported row is kept too',
       coalesce((select bool_and(coalesce((r.data ->> 'output_kept')::boolean, false)) from custom.record r
                  where r.table_id = current_setting('t.deck_table')::uuid and r.deleted_at is null
                    and r.data ->> 'title' = 'Total hip replacement — week 2'), false), 'import';

-- ══ N-C1 — THE CHAIN DOOR, AS HER AGENT ═════════════════════════════════════════════════════════
set local role authenticated;
select pg_temp.seat('agent') \g /dev/null
do $$
declare r jsonb; d jsonb; m text;
begin
  r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-1', '{"title": "Post-op knee — week 1", "patient_group": "Post-op"}'::jsonb,
         jsonb_build_array(
           jsonb_build_object('role', 'cards', 'table_id', current_setting('t.card_table'), 'data', jsonb_build_object('title', 'Quad sets: 10 x 5 s holds')),
           jsonb_build_object('role', 'cards', 'table_id', current_setting('t.card_table'), 'data', jsonb_build_object('title', 'Heel slides: 15 reps'))),
         '{"mode": "first"}'::jsonb);
  insert into res values ('N-C1 first lands', r ->> 'status' = 'landed' and r ->> 'chain' = r ->> 'parent_id'
                          and (r ->> 'generation')::int = 1 and jsonb_array_length(r -> 'child_ids') = 2, coalesce(left(r::text, 300), 'door absent'));
  perform set_config('t.k1', coalesce(r ->> 'parent_id', ''), true);
  perform set_config('t.k1_cards', coalesce(r ->> 'child_ids', '[]'), true);
  d := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-1', '{"title": "Post-op knee — week 1", "patient_group": "Post-op"}'::jsonb,
         '[]'::jsonb, '{"mode": "first"}'::jsonb);
  insert into res values ('N-C1 duplicate land is idempotent', d ->> 'status' = 'duplicate' and d ->> 'parent_id' = r ->> 'parent_id',
                          coalesce(left(d::text, 300), 'door absent'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('N-C1 first lands', false, m);
end $$;
reset role;
insert into res select 'N-C1 duplicate wrote no second row',
  (select count(*) from custom.record r where r.table_id = current_setting('t.deck_table')::uuid and r.deleted_at is null
     and r.data ->> 'title' = 'Post-op knee — week 1') = 1, 'one row';
insert into res select 'N-C1 contained records carry the parent''s chain',
  coalesce((select bool_and(r.data ->> 'output_chain' = current_setting('t.k1') and r.data ->> 'output_state' = 'draft')
              from custom.record r where r.table_id = current_setting('t.card_table')::uuid
               and r.id::text in (select jsonb_array_elements_text(current_setting('t.k1_cards')::jsonb))), false), current_setting('t.k1_cards');

-- A refused child refuses the whole landing; the old head stays current.
set local role authenticated;
select pg_temp.seat('agent') \g /dev/null
do $$
declare r jsonb; m text;
begin
  begin
    r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-bad', '{"title": "Post-op knee — broken"}'::jsonb,
           jsonb_build_array(jsonb_build_object('role', 'cards', 'table_id', current_setting('t.card_table'),
                                                'data', jsonb_build_object('title', 'Calf raises', 'no_such_column', 3))),
           jsonb_build_object('mode', 'join', 'chain', current_setting('t.k1'), 'reason', 'regenerated'));
    insert into res values ('N-C1 a refused child refuses the whole landing', false, coalesce(left(r::text, 200), 'door absent'));
  exception when others then
    insert into res values ('N-C1 a refused child refuses the whole landing', true, left(sqlerrm, 160));
  end;
  begin
    r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-stale', '{"title": "Post-op knee — stale"}'::jsonb, '[]'::jsonb,
           jsonb_build_object('mode', 'join', 'chain', current_setting('t.k1'), 'expected_current', gen_random_uuid()::text));
    insert into res values ('N-C1 a moved head is refused', false, coalesce(left(r::text, 200), 'door absent'));
  exception when others then
    get stacked diagnostics m = returned_sqlstate;
    insert into res values ('N-C1 a moved head is refused', m = 'PT409', m || ' ' || left(sqlerrm, 120));
  end;
end $$;
reset role;
insert into res select 'N-C1 after the refusals the old head is still the one current row',
  pg_temp.heads(current_setting('t.k1')) = 1 and pg_temp.st(current_setting('t.k1')) ->> 'output_state' = 'draft'
  and (select count(*) from custom.record r where r.table_id = current_setting('t.deck_table')::uuid
        and r.data ->> 'title' in ('Post-op knee — broken', 'Post-op knee — stale')) = 0, coalesce(pg_temp.st(current_setting('t.k1'))::text, 'none');

-- join: the new row supersedes the old head AND its contained records, in one call.
set local role authenticated;
select pg_temp.seat('agent') \g /dev/null
do $$
declare r jsonb; m text;
begin
  r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-2', '{"title": "Post-op knee — week 1 (short)", "patient_group": "Post-op"}'::jsonb,
         jsonb_build_array(jsonb_build_object('role', 'cards', 'table_id', current_setting('t.card_table'), 'data', jsonb_build_object('title', 'Quad sets'))),
         jsonb_build_object('mode', 'join', 'chain', current_setting('t.k1'), 'expected_current', current_setting('t.k1'), 'reason', 'regenerated'));
  perform set_config('t.k2', coalesce(r ->> 'parent_id', ''), true);
  insert into res values ('N-C1 join answers the superseded head', r -> 'superseded_ids' = jsonb_build_array(current_setting('t.k1'))
                          and (r ->> 'generation')::int = 2, coalesce(left(r::text, 300), 'door absent'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('N-C1 join answers the superseded head', false, m);
end $$;
reset role;
insert into res select 'N-C1 superseding demotes the old head and its contained records',
  pg_temp.st(current_setting('t.k1')) ->> 'output_state' = 'superseded'
  and pg_temp.st(current_setting('t.k1')) ->> 'output_replaced_by' = current_setting('t.k2')
  and pg_temp.st(current_setting('t.k2')) ->> 'output_state' = 'draft'
  and pg_temp.heads(current_setting('t.k1')) = 1
  and coalesce((select bool_and(r.data ->> 'output_state' = 'superseded') from custom.record r
                 where r.id::text in (select jsonb_array_elements_text(current_setting('t.k1_cards')::jsonb))), false),
  coalesce(pg_temp.st(current_setting('t.k1'))::text, 'none');

-- edit: in place on the current row; refused on a superseded one; a kept row takes a new row instead.
set local role authenticated;
select pg_temp.seat('agent') \g /dev/null
do $$
declare r jsonb; m text;
begin
  r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-edit', jsonb_build_object('_record_id', current_setting('t.k2'), 'patient_group', 'Post-op knee'),
         '[]'::jsonb, '{"mode": "edit"}'::jsonb);
  insert into res values ('N-C1 edit revises the current row in place', r ->> 'parent_id' = current_setting('t.k2') and (r ->> 'edited_in_place')::boolean,
                          coalesce(left(r::text, 300), 'door absent'));
  begin
    r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-edit-old', jsonb_build_object('_record_id', current_setting('t.k1'), 'patient_group', 'x'),
           '[]'::jsonb, '{"mode": "edit"}'::jsonb);
    insert into res values ('N-C1 edit of a superseded row is refused', false, coalesce(left(r::text, 200), 'door absent'));
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('N-C1 edit of a superseded row is refused', m = 'That one was replaced. Revise the current one, or make this one current first.', m);
  end;
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('N-C1 edit revises the current row in place', false, m);
end $$;
-- Her own hand changes the current row (N-C3 keeps it); her agent's next edit then lands a new row.
select pg_temp.seat('hand') \g /dev/null
do $$ begin
  perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.k2')::uuid, '{"title": "Post-op knee — my version"}'::jsonb);
exception when others then insert into res values ('N-C3 her hand edits her agent''s output', false, sqlerrm);
end $$;
select pg_temp.seat('agent') \g /dev/null
do $$
declare r jsonb; m text;
begin
  r := pg_temp.land('cd2g-conv|flashcard_set', 'fp-knee-edit-2', jsonb_build_object('_record_id', current_setting('t.k2'), 'patient_group', 'Knee'),
         '[]'::jsonb, '{"mode": "edit"}'::jsonb);
  perform set_config('t.k3', coalesce(r ->> 'parent_id', ''), true);
  insert into res values ('N-C1 edit of a kept row lands a new row', r ->> 'parent_id' is distinct from current_setting('t.k2')
                          and not (r ->> 'edited_in_place')::boolean and r -> 'superseded_ids' = jsonb_build_array(current_setting('t.k2')),
                          coalesce(left(r::text, 300), 'door absent'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('N-C1 edit of a kept row lands a new row', false, m);
end $$;
reset role;
insert into res select 'N-C3 member edit sets kept, and the next version leaves her row kept',
  coalesce((pg_temp.st(current_setting('t.k2')) ->> 'output_kept')::boolean, false)
  and pg_temp.st(current_setting('t.k2')) ->> 'title' = 'Post-op knee — my version'
  and pg_temp.st(current_setting('t.k3')) ->> 'title' = 'Post-op knee — my version'
  and pg_temp.st(current_setting('t.k3')) ->> 'patient_group' = 'Knee'
  and pg_temp.heads(current_setting('t.k1')) = 1,
  coalesce(pg_temp.st(current_setting('t.k2'))::text, 'none');

-- Her hand: Keep is hers (output_kept true); un-keeping is not.
set local role authenticated;
select pg_temp.seat('hand') \g /dev/null
do $$
declare m text;
begin
  begin
    perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.k3')::uuid, '{"output_kept": true}'::jsonb);
    insert into res values ('N-C3 member may Keep her output', true, 'ok');
  exception when others then
    insert into res values ('N-C3 member may Keep her output', false, sqlerrm);
  end;
  begin
    perform custom.record_update(current_setting('t.cedar')::uuid, current_setting('t.k3')::uuid, '{"output_kept": false}'::jsonb);
    insert into res values ('N-C3 member may not un-keep by hand', false, 'it was written');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('N-C3 member may not un-keep by hand', m = '"Kept" is a platform table, so it is not yours to change.', m);
  end;
end $$;

-- make_current, split, rewind, out_of_date — her own clicks, through the door (actor user).
do $$
declare r jsonb; m text;
begin
  r := pg_temp.land('cd2g-conv|flashcard_set', null, null, '[]'::jsonb, jsonb_build_object('mode', 'make_current', 'record_id', current_setting('t.k1')));
  insert into res values ('N-C1 make_current by her hand', r ->> 'status' = 'landed' and r -> 'superseded_ids' = jsonb_build_array(current_setting('t.k3')),
                          coalesce(left(r::text, 300), 'door absent'));
  r := pg_temp.land('cd2g-conv|flashcard_set', null, null, '[]'::jsonb, jsonb_build_object('mode', 'split', 'record_id', current_setting('t.k3')));
  insert into res values ('N-C1 split gives a superseded row a chain of its own', r ->> 'chain' = current_setting('t.k3'),
                          coalesce(left(r::text, 300), 'door absent'));
  r := pg_temp.land('cd2g-conv|flashcard_set', null, null, '[]'::jsonb, jsonb_build_object('mode', 'rewind', 'rewound', jsonb_build_array(current_setting('t.k1'))));
  insert into res values ('N-C1 rewind supersedes the rewound head and the chain takes its newest remaining row',
                          r -> 'superseded_ids' = jsonb_build_array(current_setting('t.k1')) and jsonb_array_length(r -> 'made_current_ids') = 1,
                          coalesce(left(r::text, 300), 'door absent'));
  r := pg_temp.land('cd2g-conv|flashcard_set', null, null, '[]'::jsonb, jsonb_build_object('mode', 'out_of_date', 'record_ids', jsonb_build_array(current_setting('t.k3'))));
  insert into res values ('N-C1 out_of_date marks the row', r ->> 'status' = 'landed', coalesce(left(r::text, 300), 'door absent'));
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('N-C1 person-driven modes', false, m);
end $$;
reset role;
insert into res select 'N-C1 after every mode each chain has at most one current row',
  pg_temp.heads(current_setting('t.k1')) = 1 and pg_temp.heads(current_setting('t.k3')) = 1
  and pg_temp.st(current_setting('t.k1')) ->> 'output_state' = 'superseded'
  and pg_temp.st(current_setting('t.k1')) ->> 'output_reason' = 'rewound'
  and pg_temp.st(current_setting('t.k2')) ->> 'output_state' = 'draft'
  and pg_temp.st(current_setting('t.k3')) ->> 'output_chain' = current_setting('t.k3')
  and coalesce((pg_temp.st(current_setting('t.k3')) ->> 'output_out_of_date')::boolean, false),
  format('k1 %s / k2 %s / k3 %s', pg_temp.st(current_setting('t.k1')) ->> 'output_state',
         pg_temp.st(current_setting('t.k2')) ->> 'output_state', pg_temp.st(current_setting('t.k3')) ->> 'output_chain');
insert into res select 'N-C1 a table not kept for agent outputs is refused',
  (select count(*) from res where false) = 0, 'see below';
set local role authenticated;
select pg_temp.seat('agent') \g /dev/null
do $$
declare m text;
begin
  if to_regprocedure('custom.record_write_graph_superseding(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)') is null then
    update res set ok = false, detail = 'door absent' where check_name = 'N-C1 a table not kept for agent outputs is refused';
    return;
  end if;
  begin
    execute 'select custom.record_write_graph_superseding($1, $2, $3, null, $4)'
      using current_setting('t.cedar')::uuid, '031d3690-4a02-4cee-a575-454ffd96c992'::uuid, 'x|y', '{"title": "x"}'::jsonb;
    update res set ok = false, detail = 'it was written' where check_name = 'N-C1 a table not kept for agent outputs is refused';
  exception when others then
    get stacked diagnostics m = message_text;
    update res set ok = (m = 'This door keeps outputs only in a table the app keeps for agent outputs, and this table is not one.'), detail = m
     where check_name = 'N-C1 a table not kept for agent outputs is refused';
  end;
end $$;
reset role;

-- ── THE VERDICT ──────────────────────────────────────────────────────────────────────────────
\set QUIET off
select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by coalesce(ok, false), check_name;
do $$
declare v_bad int; v_all int;
begin
  select count(*) filter (where not coalesce(ok, false)), count(*) into v_bad, v_all from res;
  if v_all < 29 then
    raise exception 'RED: only % checks ran (29 expected) — a block died before recording', v_all;
  end if;
  if v_bad > 0 then
    raise exception 'RED: % of % agent-output door checks failed (see the table above)', v_bad, v_all;
  end if;
  raise notice 'GREEN: all % agent-output door checks pass from the member''s seat', v_all;
end $$;
rollback;
