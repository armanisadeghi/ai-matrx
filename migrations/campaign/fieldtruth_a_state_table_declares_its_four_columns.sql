-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_take_assignment(uuid, uuid) 4040144bc7a8c74f1801629fc58ca5fda716c5afe883fa079be8d3a43159b632
--
-- FIELD-TRUTH — A WORKFLOW STATE TABLE'S FOUR COLUMNS ARE REAL COLUMNS.
--
-- THE OUTAGE, found by crew F on the live screens: on Greenline Landscaping the Checklists
-- "Write one" editor took a real five-step checklist and Save was refused with
-- *"State has no field called "name", "next", "sort", "terminal""*. Reproduced from the seat
-- on the main database with `custom.checklist_declare` and a real arborist's storm-cleanup
-- checklist. Every checklist, every pipeline and every work template goes through
-- `custom.work_take_assignment`, so this was all three of them.
--
-- THE CAUSE, and it is this lane's. `custom.work_take_assignment` creates the workflow-state
-- Table by INSERTing the Table row directly — not through `custom.table_declare` — declaring
-- the four column NAMES in its spec and making a Field record for NONE of them. That is the
-- exact shape `custom.table_declare` had before LIMITS-FIX fixed it, and nothing noticed
-- while an undeclared key was silently accepted. `custom._undeclared_key_guard` refuses one
-- now, so the door was refused at its FIRST state row.
--
-- THE CENSUS behind the fix, so this is the CLASS and not the instance. Four functions in
-- `custom` insert a `data_class = 'table'` row directly instead of going through
-- `custom.table_declare`: `custom._options_table_for` (a dropdown's choices — declares its
-- `title` Field row), `custom.checklist_steps_table` (declares its `title` Field row and, as
-- of this lane, `columns: free_form` for the checklist's own machinery),
-- `custom.work_slots_declare` (declares all three of its Field rows) and this one, which
-- declared none. It was the only hole, and `custom._claimed_column_guard` would refuse such a
-- Table at COMMIT anyway, so a writer that opens a new one cannot do it quietly again.
--
-- WHY DECLARE AND NOT `free_form`. A workflow-state Table is not machinery nobody sees: it is
-- a LIST a person reads and edits — the state's name, the order it sits in, whether it ends
-- the work, and which states may follow it. Those are four columns, so the doctrine's answer
-- is to declare them. `next` holds several state names, so it is a text column with `multi`.
--
-- Existing state Tables already carry the four Field rows (LIMITS-FIX's backfill and this
-- lane's claimed-column repair between them): measured on the main database after this file,
-- column names a Table claims with no Field record = 0.
--
-- REC-1 / REC-51.

CREATE OR REPLACE FUNCTION custom.work_take_assignment(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table    custom.record;
  v_slug     text;
  v_states   uuid;
  v_names    jsonb;
  v_missing  text[] := '{}';
  v_field    record;
  v_state    record;
  v_id       uuid;
  v_fields   jsonb := '[]'::jsonb;
  v_n_states integer := 0;
  v_n_fields integer := 0;
  v_t0       timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_take_assignment');
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
                                          'custom.work_take_assignment',
                                          'admin'::public.permission_level, 'table');

  select r.* into v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_table.id is null then
    raise exception 'that table is not in this organization'
      using errcode = '23503',
            hint = 'REC-69: the assignment fields are taken BY a Table, and the Table is named by its record id.';
  end if;
  if coalesce(v_table.data ->> 'type', '') = 'detail' then
    raise exception 'a detail table cannot take the assignment fields'
      using errcode = '23514',
            hint = 'REC-11 / REC-69: a detail table''s records inherit only. Whose turn it is belongs to the entity the detail hangs off.';
  end if;

  if custom.work_has_assignment(p_organization_id, p_table_id) then
    return jsonb_build_object(
      'table_id', p_table_id, 'taken', false,
      'reason', 'this table already holds the assignment fields',
      'fields', 3, 'states_created', 0, 'fields_created', 0,
      'state_table_id', (select r.id from custom.record r
                          where r.organization_id = p_organization_id
                            and r.table_id = custom.table_kernel_id()
                            and r.data ->> 'slug' = left(coalesce(v_table.data ->> 'slug', 'table'), 40) || '_work_state'
                            and r.deleted_at is null limit 1),
      'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
  end if;

  v_slug := left(coalesce(v_table.data ->> 'slug', 'table'), 40) || '_work_state';
  select r.id into v_states
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = v_slug
     and r.deleted_at is null
   limit 1;

  if v_states is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
      'name',           coalesce(v_table.data ->> 'name', 'Table') || ' — workflow state',
      'slug',           v_slug,
      'type',           'entity',
      'label_singular', 'State',
      'label_plural',   'States',
      'title_field',    'name',
      'display',        'list',
      'weight',         'light',
      'ordered',        true,
      'row_order',      'sorted',
      'default_sort',   jsonb_build_array(jsonb_build_object('field', 'sort', 'direction', 'asc')),
      'agent_writable', false,
      'retention_days', 365,
      'work_kind',      'state',
      'fields', jsonb_build_array(jsonb_build_object('name', 'name'),
                                  jsonb_build_object('name', 'sort'),
                                  jsonb_build_object('name', 'terminal'),
                                  jsonb_build_object('name', 'next')),
      'parent_id',      p_table_id::text))
    returning id into v_states;

    -- ── FIELD-TRUTH 2026-09-21: THE STATE TABLE'S FOUR COLUMNS ARE REAL COLUMNS. ───────
    -- This door declared the four NAMES in the table's spec and made no Field record for
    -- any of them, exactly as `custom.table_declare` used to before LIMITS-FIX. Nothing
    -- noticed while an undeclared key was silently accepted; `custom._undeclared_key_guard`
    -- refuses one now, so every checklist, pipeline and work template on the platform was
    -- refused at its FIRST state row with "State has no field called name, next, sort,
    -- terminal" (crew F, Greenline Landscaping, live screens). The columns are not machinery
    -- a person never sees — a workflow-state Table is a LIST a person reads and edits, with
    -- the state's name, its order, whether it ends the work and what may follow it — so the
    -- doctrine's answer is to DECLARE them, not to call the table free-form.
    -- `next` is a list of state names, so it is a text column that holds several values.
    for v_field in
      select * from (values
        ('name',     'Name',           'text',    10, true,  false),
        ('sort',     'Order',          'range',   20, true,  false),
        ('terminal', 'Ends the work',  'boolean', 30, false, false),
        ('next',     'May become',     'text',    40, false, true)
      ) as f(key, label, ftype, sort, required, multi)
    loop
      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
        'key', v_field.key, 'label', v_field.label, 'type', v_field.ftype,
        'sort', v_field.sort, 'required', v_field.required, 'multi', v_field.multi,
        'dated', false, 'source', 'manual',
        'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
        'source_config', '{}'::jsonb, 'sensitivity', 'internal',
        'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
        'promoted', false, 'entity_definition_id', v_states::text));
    end loop;

    for v_state in select * from custom.work_states() order by sort loop
      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, v_states, 'record',
              jsonb_build_object('name', v_state.name, 'sort', v_state.sort,
                                 'terminal', v_state.terminal,
                                 'next', to_jsonb(v_state.next)));
      v_n_states := v_n_states + 1;
    end loop;
  end if;

  v_names := coalesce(v_table.data -> 'fields', '[]'::jsonb);
  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if not exists (select 1 from jsonb_array_elements(v_names) f where f ->> 'name' = v_field.key) then
      v_names := v_names || jsonb_build_array(jsonb_build_object('name', v_field.key));
      v_missing := v_missing || v_field.key;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    update custom.record r
       set data = r.data || jsonb_build_object('fields', v_names)
     where r.organization_id = p_organization_id and r.id = p_table_id;
  end if;

  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if exists (select 1 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
                  and f.data ->> 'key' = v_field.key) then
      continue;
    end if;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.field_kernel_id(), 'field',
            v_field.spec || jsonb_build_object('entity_definition_id', p_table_id::text))
    returning id into v_id;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object('key', v_field.key, 'id', v_id));
    v_n_fields := v_n_fields + 1;
  end loop;

  return jsonb_build_object(
    'table_id',        p_table_id,
    'taken',           true,
    'state_table_id',  v_states,
    'states_created',  v_n_states,
    'fields_created',  v_n_fields,
    'fields',          v_fields,
    'declared_on_table', to_jsonb(v_missing),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$

;
