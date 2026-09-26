-- LANE COPY-WRITABLE — THE GREEN SUITE. While an organization's Data tables switch is off, a PERSON
-- tests the new table page end to end on the copy; agents, automations and integrations still write
-- the older table; the switch first replaces every test edit with the older table's rows (rows a
-- person added are archived, never deleted, and counted in a log), then flips.
--
-- THE REAL USE CASE: admin@admin.com keeps "Heat Pump Field Research" in admin's Workspace — an older
-- table his research agent fills. COPY mode made a same-id copy; the switch is off. He opens the new
-- table page to evaluate it: corrects a topic, adds a row, archives a row, reorders a column, changes
-- the table's default sort. Meanwhile his agent corrects a topic in the older table. When he presses
-- the switch, the copy must equal the older table for every shared row, his added row must be
-- archived with a log saying so, and nothing his agent did may have landed in the copy.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/copywritable_green.sql
-- ITS RED: before the campaign file (and after its inverse) it fails at 0a (no evaluation door) and,
-- with 0a skipped, at 2a (the person's edit on the copy is refused).

\set ON_ERROR_STOP on
\timing off

\set suite 'copywritable_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_tech    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_heat    constant uuid := '5d1c7e2a-4b6f-4c1d-9a2e-8f0b3c5d7e91';   -- Heat Pump Field Research
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-copywritable1"}';
  c_tech_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-copywritable2"}';
  c_page    constant text := '{"origin":"http://copy-writable.localhost:3001"}';
  c_agent   constant text := '{"origin":"http://copy-writable.localhost:3001","x-matrx-actor-tier":"ai","x-matrx-actor-system":"matrx-extend:agent"}';
  v_a uuid; v_b uuid; v_c uuid; v_new uuid; v_field uuid;
  v jsonb; v_err text; v_n bigint; v_notes_before bigint;
  v_ready jsonb;
  v_log platform.cutover_evaluation_replaced;
  v_tdata jsonb; v_fdata jsonb;
begin
  -- 0. The door and the log exist; the notes are private.
  if to_regprocedure('custom.table_copy_evaluation_state(uuid)') is null
     or to_regclass('platform.cutover_evaluation_write') is null
     or to_regclass('platform.cutover_evaluation_replaced') is null then
    raise exception '0a: there is no door that says a table is a test copy, or no log of what the switch replaced';
  end if;
  if has_table_privilege('authenticated', 'platform.cutover_evaluation_write', 'select')
     or has_function_privilege('authenticated', 'platform._cutover_copy_resync(uuid,uuid,uuid)', 'execute') then
    raise exception '0b: a client reads the notes or runs the re-sync';
  end if;
  if not exists (select 1 from workbench.udt_datasets where id = c_heat and deleted_at is null)
     or not exists (select 1 from custom.record where organization_id = c_ws and id = c_heat and data_class = 'table' and deleted_at is null)
     or coalesce((platform._cutover_seam_last_done('older_tables', c_ws)).direction, 'old') <> 'old' then
    raise exception '0c: Heat Pump Field Research is not a live, copied, unswitched older table on this target';
  end if;
  if exists (select 1 from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null) then
    raise exception '0d: admin''s Workspace already carries open test notes on this target';
  end if;
  select id into v_a from custom.record where organization_id = c_ws and table_id = c_heat and data_class = 'record' and deleted_at is null order by id limit 1;
  select id into v_b from custom.record where organization_id = c_ws and table_id = c_heat and data_class = 'record' and deleted_at is null order by id offset 1 limit 1;
  select id into v_c from custom.record where organization_id = c_ws and table_id = c_heat and data_class = 'record' and deleted_at is null order by id offset 2 limit 1;
  select id into v_field from custom.record where organization_id = c_ws and data_class = 'field' and data ->> 'entity_definition_id' = c_heat::text and data ->> 'key' = 'html' and deleted_at is null;
  if v_c is null or v_field is null then raise exception '0e: the copy has fewer than three rows or no html column here'; end if;
  select data into v_tdata from custom.record where organization_id = c_ws and id = c_heat;
  select data into v_fdata from custom.record where organization_id = c_ws and id = v_field;

  -- ── the person's seat, from a page ────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('request.headers', c_page, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0f: the suite did not take the seat'; end if;

  -- 1. The page asks: a test copy, writable by people, agents on the older table, nothing changed yet.
  v := custom.table_copy_evaluation_state(c_heat);
  if not (v ->> 'test_copy')::boolean or not (v ->> 'writable_by_people')::boolean or v ->> 'agents_write' <> 'older'
     or (v ->> 'evaluation_writes_since_copy')::int <> 0
     or v ->> 'says' <> 'Test copy: your edits here are replaced by the older table at switch time.' then
    raise exception '1a: the table page is not told it shows a test copy: %', v;
  end if;

  -- 2. The person evaluates the new page: edit, add, archive, a column's order, the table's sort.
  begin
    perform custom.record_update(c_ws, v_a, jsonb_build_object('topic', 'Cold-climate sizing (checked against Manual J)'), null);
    v_new := custom.record_write(c_ws, c_heat, jsonb_build_object('topic', 'Heat pump water heater pairing'));
    perform custom.record_delete(c_ws, v_b);
    perform custom.field_update(c_ws, v_field, jsonb_build_object('sort', 0));
    perform custom.record_update(c_ws, c_heat, jsonb_build_object('default_sort', jsonb_build_array(jsonb_build_object('field', 'topic', 'dir', 'asc'))), null);
  exception when insufficient_privilege then
    get stacked diagnostics v_err = message_text;
    raise exception '2a: a person''s own write to the test copy was refused: %', v_err;
  end;
  if v_new is null then raise exception '2b: the person''s new row has no id'; end if;

  v := custom.table_copy_evaluation_state(c_heat);
  if (v ->> 'rows_edited')::int <> 2 or (v ->> 'rows_added')::int <> 1 or (v ->> 'settings_changed')::int <> 2 then
    raise exception '2c: the test writes were not each noted once (edited 2, added 1, settings 2): %', v;
  end if;

  -- 3. Agents, automations and integrations still may not write the copy.
  perform set_config('role', 'postgres', true);
  select count(*) into v_notes_before from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.headers', c_agent, true);                       -- the extension's agent client
  begin
    perform custom.record_update(c_ws, v_c, jsonb_build_object('topic', 'agent wrote the copy'), null);
    raise exception '3a: an agent-declared write reached the copy';
  exception when insufficient_privilege then
    get stacked diagnostics v_err = message_text;
    if v_err !~ 'still the one in use' or v_err !~ ('/data/' || c_heat::text) then
      raise exception '3b: the agent was refused, but not with the older table''s address: %', v_err;
    end if;
  end;
  perform set_config('request.headers', c_page, true);
  perform set_config('app.actor_tier', 'code', true);                          -- a workflow step / automation
  perform set_config('app.actor_system', 'workflow.step', true);
  begin
    perform custom.record_write(c_ws, c_heat, jsonb_build_object('topic', 'automation wrote the copy'));
    raise exception '3c: an automation''s write reached the copy';
  exception when insufficient_privilege then null;
  end;
  perform set_config('app.actor_tier', '', true);
  perform set_config('app.actor_system', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);   -- an integration on the server key
  perform set_config('role', 'service_role', true);
  begin
    perform custom.record_update(c_ws, v_c, jsonb_build_object('topic', 'integration wrote the copy'), null);
    raise exception '3d: the server key wrote the copy';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  if (select count(*) from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null) <> v_notes_before
     or exists (select 1 from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null and first_by is distinct from c_admin) then
    raise exception '3e: an agent, automation or integration left a mark on the copy';
  end if;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom._copy_evaluation_note(c_ws, c_heat, v_c, 'record');
    raise exception '3f: the fence''s note was called directly';
  exception when insufficient_privilege then null;
  end;

  -- 4. His agent corrects rows in the OLDER table (A, which he also edited on the copy, and C).
  perform set_config('role', 'postgres', true);
  update workbench.udt_dataset_rows set data = jsonb_set(data, '{topic}', to_jsonb('Cold-climate sizing (field-checked in Ojai)'::text)),
                                        updated_at = clock_timestamp() + interval '1 second'
   where id = v_a;
  update workbench.udt_dataset_rows set data = jsonb_set(data, '{topic}', to_jsonb('Auxiliary heat staging (lockout at 25F)'::text)),
                                        updated_at = clock_timestamp() + interval '1 second'
   where id = v_c;
  v_ready := platform._cutover_seam_readiness('older_tables', c_ws);
  if (select (c ->> 'met')::boolean from jsonb_array_elements(v_ready -> 'checks') c where c ->> 'key' = 'rows_current') then
    raise exception '4a: an older-table edit on a row a person had tested was hidden by the test edit: %', v_ready;
  end if;
  if (select c ->> 'detail' from jsonb_array_elements(v_ready -> 'checks') c where c ->> 'key' = 'rows_current') !~ '^2 rows' then
    raise exception '4b: the stale count is not 2: %', v_ready;
  end if;

  -- 5. The mover's rerun carries the older edits: into the kept image for A (his test edit stays on
  --    screen until the switch), into the row itself for C (no test note). Staged as the mover does.
  perform set_config('role', 'postgres', true);
  if not platform.cutover_evaluation_carry(c_ws, v_a, jsonb_build_object('topic', 'Cold-climate sizing (field-checked in Ojai)')) then
    raise exception '5a: the mover could not carry into a tested row''s kept image';
  end if;
  if (select data ->> 'topic' from custom.record where organization_id = c_ws and id = v_a) <> 'Cold-climate sizing (checked against Manual J)' then
    raise exception '5b: the carry overwrote the person''s visible test edit before the switch';
  end if;
  update custom.record set data = data || jsonb_build_object('topic', 'Auxiliary heat staging (lockout at 25F)')
   where organization_id = c_ws and id = v_c;
  if platform.cutover_evaluation_carry(c_ws, v_c, '{"topic":"x"}') then raise exception '5c: an untested row claimed a note'; end if;
  -- The integrations fact, staged as met (only the census writes it on production).
  perform set_config('matrx.cutover_census_door', 'on', true);
  update platform.cutover_seam set prerequisites = (
    select jsonb_agg(case when e ->> 'key' = 'integrations_repointed' then e || '{"met": true}'::jsonb else e end)
      from jsonb_array_elements(prerequisites) e) where seam_key = 'older_tables';
  perform set_config('matrx.cutover_census_door', '', true);
  perform set_config('role', 'authenticated', true);

  -- 6. The flip screen says what will be replaced, before the press.
  v := platform.cutover_seams(c_ws);
  v_ready := (select s -> 'readiness' from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables');
  if not (select (s ->> 'may_flip')::boolean from jsonb_array_elements(v -> 'seams') s where s ->> 'key' = 'older_tables') then
    raise exception '6a: the switch is not offered: %', v_ready;
  end if;
  if (select c ->> 'detail' from jsonb_array_elements(v_ready -> 'checks') c where c ->> 'key' = 'test_edits_replaced')
     !~ '^5 rows were changed while testing, in 1 table: 2 edited rows are put back to the older table''s version, 1 added row is archived \(never deleted\), 2 table or column settings are put back' then
    raise exception '6b: the flip screen does not say what the switch replaces: %', (select c from jsonb_array_elements(v_ready -> 'checks') c where c ->> 'key' = 'test_edits_replaced');
  end if;

  -- 7. The press: re-sync first, then flip.
  v := platform.cutover_seam_press('older_tables', c_ws, 'new', 'copywritable_green: the owner validated the copy');
  if not (v ->> 'ok')::boolean then raise exception '7a: the press failed: %', v; end if;
  if jsonb_array_length(v -> 'did' -> 'resynced') <> 1 then raise exception '7b: the press did not re-sync the one tested table: %', v -> 'did'; end if;

  perform set_config('role', 'postgres', true);
  -- 7c. Every shared row equals its older row, key by key (byte for byte on the jsonb), and is live.
  select count(*) into v_n
    from workbench.udt_dataset_rows w
    join custom.record r on r.organization_id = c_ws and r.id = w.id
   where w.table_id = c_heat and w.deleted_at is null
     and (r.deleted_at is not null
          or exists (select 1 from jsonb_each(w.data) k where (r.data -> k.key) is distinct from k.value));
  if v_n <> 0 then
    raise exception '7c: % shared rows differ from the older table after the switch', v_n;
  end if;
  -- 7d. His added row is archived, not deleted, and says why.
  if not exists (select 1 from custom.record where organization_id = c_ws and id = v_new and deleted_at is not null
                    and metadata -> 'evaluation_replaced' ->> 'press' = v ->> 'press_id') then
    raise exception '7d: the row the person added is not archived with the reason';
  end if;
  -- 7e. The column's order and the table's sort are the mover's again.
  if (select data from custom.record where organization_id = c_ws and id = v_field) is distinct from v_fdata
     or (select data from custom.record where organization_id = c_ws and id = c_heat) is distinct from v_tdata then
    raise exception '7e: a setting the person changed on the copy was not put back exactly';
  end if;
  -- 7f. The log says it all, once, and cannot be rewritten.
  select * into v_log from platform.cutover_evaluation_replaced where organization_id = c_ws and press_id = (v ->> 'press_id')::uuid;
  if v_log.id is null or v_log.table_id <> c_heat or v_log.rows_put_back <> 1 or v_log.rows_unarchived <> 1
     or v_log.rows_archived <> 1 or v_log.settings_put_back <> 2 or v_log.settings_archived <> 0
     or v_log.archived_ids <> array[v_new] or not (c_admin = any (v_log.people)) then
    raise exception '7f: the log does not record the counts: %', to_jsonb(v_log);
  end if;
  begin
    update platform.cutover_evaluation_replaced set rows_archived = 0 where id = v_log.id;
    raise exception '7g: the log was rewritten';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null) then
    raise exception '7h: a note stayed open after the switch';
  end if;
  if exists (select 1 from workbench.udt_datasets where id = c_heat and deleted_at is null) then
    raise exception '7i: the older table stayed live after the switch';
  end if;

  -- 8. After the switch the table is simply the table: not a test copy, and nobody is noted.
  perform set_config('role', 'authenticated', true);
  v := custom.table_copy_evaluation_state(c_heat);
  if (v ->> 'test_copy')::boolean or v ->> 'agents_write' <> 'record' or v ->> 'says' is not null then
    raise exception '8a: after the switch the table still says it is a test copy: %', v;
  end if;
  perform custom.record_update(c_ws, v_c, jsonb_build_object('topic', 'Auxiliary heat staging (lockout at 25F, confirmed)'), null);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from platform.cutover_evaluation_write where organization_id = c_ws and replaced_at is null) then
    raise exception '8b: a write after the switch was taken for a test edit';
  end if;
  perform set_config('role', 'authenticated', true);

  -- 9. Someone who cannot open the table hears what a missing id hears.
  perform set_config('request.jwt.claims', c_tech_j, true);
  v := custom.table_copy_evaluation_state(c_heat);
  if (v ->> 'found')::boolean and not custom.has_visibility(c_tech, 'record', c_heat, 'viewer'::public.permission_level) then
    raise exception '9a: a person who cannot open the table was told about it: %', v;
  end if;

  raise notice 'copywritable_green.sql: GREEN (1 page told it is a test copy, 2 a person edits/adds/archives/orders/sorts on it, 3 agent/automation/server key refused and unnoted, 4 older edits not hidden by test edits, 5 the mover carries into the kept image, 6 the flip screen says what is replaced, 7 press re-syncs (shared rows = older, added row archived, settings back, log append-only) then flips, 8 after the switch nothing is a test, 9 a stranger learns nothing)';
end;
$t$;

rollback;
