-- LANE WHERE-LIVES-SWITCH — THE GREEN SUITE (census row X1). Where a table is read and written is
-- the organization's Data tables switch, never "does a copy with this id exist?".
--
-- THE REAL USE CASE: admin@admin.com keeps "Heat Pump Field Research" in admin's Workspace — an
-- older table whose rows his research agent fills. COPY mode made a same-id copy of it in the
-- record store, and the switch for admin's Workspace is still off. So the agent, a workflow and
-- the extension must keep writing the OLDER table, and anything that tries to write the copy is
-- refused with the older table's address. When the owner presses the switch, the copy becomes
-- the table. A table the older store never held (a record-store table) and a table the mover
-- already moved (its older copy archived) live in the record store.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/wherelives_green.sql
-- ITS RED: before the migration (and after its inverse) it fails at 0a — there is no one door.

\set ON_ERROR_STOP on
\timing off

\set suite 'wherelives_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_heat    constant uuid := '5d1c7e2a-4b6f-4c1d-9a2e-8f0b3c5d7e91';   -- Heat Pump Field Research (older, live, copied)
  c_rincon  constant uuid := '415c3e23-2f90-4c66-9040-b246fa1c4b36';   -- Rincon Plumbing — Customers (moved: older archived)
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-wherelives01"}';
  v_store   uuid;   -- a Table the older store never held
  v_row     uuid;
  v_lives   text;
  v_why     text;
  v_err     text;
  v_new     uuid;
begin
  -- 0. The one door exists; the fact behind it is private.
  if to_regprocedure('custom.where_tables_live(uuid[])') is null or to_regprocedure('platform.table_lives_in(uuid)') is null then
    raise exception '0a: there is no one door that says where a table lives';
  end if;
  if has_function_privilege('authenticated', 'platform.table_lives_in(uuid)', 'execute')
     or has_function_privilege('anon', 'custom.where_tables_live(uuid[])', 'execute') then
    raise exception '0b: a client reaches the private fact, or a signed-out visitor reaches the door';
  end if;

  -- Fixtures must be what the story says, or the suite proves nothing.
  if not exists (select 1 from workbench.udt_datasets where id = c_heat and deleted_at is null)
     or not exists (select 1 from custom.record where organization_id = c_ws and id = c_heat and data_class = 'table' and deleted_at is null) then
    raise exception '0c: Heat Pump Field Research is not a live older table with a same-id copy on this target';
  end if;
  if coalesce((platform._cutover_seam_last_done('older_tables', c_ws)).direction, 'old') <> 'old' then
    raise exception '0d: admin''s Workspace''s Data tables switch is not off on this target';
  end if;
  select id into v_store from custom.record
   where organization_id = c_ws and data_class = 'table' and table_id = custom.table_kernel_id() and deleted_at is null
     and id not in (select id from workbench.udt_datasets) limit 1;
  select id into v_row from custom.record
   where organization_id = c_ws and table_id = c_heat and data_class = 'record' and deleted_at is null limit 1;

  -- ── the seat ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0e: the suite did not take the seat'; end if;

  -- 1. The switch is off: the copied older table is 'older', whatever the copy says.
  select w.lives_in, w.why into v_lives, v_why from custom.where_tables_live(array[c_heat]) w;
  if v_lives is distinct from 'older' then
    raise exception '1a: a copied older table in an organization whose switch is off answered % (the copy-existence defect)', v_lives;
  end if;
  if v_why !~ 'read-only until an owner switches' then raise exception '1b: the answer does not say why: %', v_why; end if;

  -- 2. A moved table (older archived) and a table the older store never held live in the store.
  if (select w.lives_in from custom.where_tables_live(array[c_rincon]) w) is distinct from 'record' then
    raise exception '2a: a moved table does not answer record';
  end if;
  if v_store is not null and (select w.lives_in from custom.where_tables_live(array[v_store]) w) is distinct from 'record' then
    raise exception '2b: a record-store table answered older';
  end if;
  if (select count(*) from custom.where_tables_live(array[c_heat, c_heat, c_rincon, null]) ) <> 2 then
    raise exception '2c: the door does not answer each id once';
  end if;

  -- 3. The copy is read-only while the switch is off: the owner's own write through the store's door is refused by name.
  begin
    perform custom.record_write(c_ws, c_heat, jsonb_build_object('topic', 'Mini-split defrost settings for coastal installs'));
    raise exception '3a: a person wrote a new row into the copy of a live older table';
  exception when insufficient_privilege then
    get stacked diagnostics v_err = message_text;
    if v_err !~ 'still the one in use' or v_err !~ ('/data/' || c_heat::text) then
      raise exception '3b: the copy was refused, but not with the older table''s address: %', v_err;
    end if;
  end;
  if v_row is not null then
    begin
      perform custom.record_write(c_ws, c_heat, jsonb_build_object('id', v_row, 'topic', 'Ductless retrofit costs (checked)'));
      raise exception '3c: a person edited a row of the copy of a live older table';
    exception when insufficient_privilege then null;
    end;
  end if;

  -- 4. The store owner's own connection (the mover's rerun, the undo) still writes the copy.
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  if v_row is not null then
    update custom.record set data = jsonb_set(data, '{topic}', to_jsonb('Ductless retrofit costs'::text))
     where organization_id = c_ws and id = v_row;
  end if;

  -- 5. The owner presses the switch (staged: a done press, as platform.cutover_seam_press records it).
  insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, pressed_by, note)
  values ('older_tables', c_ws, 'new', 'done', c_admin, 'wherelives_green: staged press, rolled back');
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if (select w.lives_in from custom.where_tables_live(array[c_heat]) w) is distinct from 'record' then
    raise exception '5a: after the switch the copy is still not the table';
  end if;
  v_new := custom.record_write(c_ws, c_heat, jsonb_build_object('topic', 'Mini-split defrost settings for coastal installs'));
  if v_new is null then raise exception '5b: after the switch the owner could not write the table'; end if;

  raise notice 'wherelives_green.sql: GREEN (1 off=older, 2 moved/store=record, 3 copy refused with the address, 4 owner writes, 5 switch on=record and writable)';
end;
$t$;

rollback;
