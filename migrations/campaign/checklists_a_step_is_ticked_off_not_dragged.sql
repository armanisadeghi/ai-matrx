-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_steps_table(uuid) 0f6393e44c6d11876e5a9ec64a7fadbe64d82fc878c7f90b5aaef354b1ebe23a
--
-- CHECKLISTS — the sixth defect the green suite found, and the only one that is a PRODUCT
-- decision rather than a mistake.
--
-- `custom.checklist_step_complete` moved a step to Done and was refused by the work model's
-- own transition rule: *"Not started cannot go straight to Done. From Not started it can go to
-- Cancelled or In progress."* (main database, 15:25 UTC). The rule is right for what it was
-- written for — a quote, a deal, a matter somebody works on for a week. It is wrong for a
-- checklist step. "Send the contract" has no In progress worth recording, and making a person
-- move it twice to tick it once is making them operate the software instead of doing their
-- job. Process Street ticks a step; it does not ask you to start it first.
--
-- THE STATES ARE THE TABLE'S OWN VOCABULARY. They live as records of the Checklist steps
-- Table's workflow-state Table, and `custom.work_set_state`'s own hint says what to do — "the
-- states a record can move to are declared on the state it is in. Change the state records if
-- this organization works differently." So this changes ONE state record of ONE Table: Not
-- started may now become In progress, Done or Cancelled. Every other Table in every
-- organization keeps the shipped model exactly, and In progress stays available here for the
-- steps that really do take a week.

set lock_timeout = '45s';

create or replace function custom.checklist_steps_table(p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id   uuid;
  v_home uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_steps_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_steps_table');

  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = 'checklist_step'
     and r.deleted_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select coalesce(
    (select nullif(t.data ->> 'parent_id', '')::uuid
       from custom.record t
      where t.organization_id = p_organization_id
        and t.table_id = custom.table_kernel_id()
        and t.deleted_at is null
        and nullif(t.data ->> 'parent_id', '') is not null
      order by t.created_at
      limit 1),
    (select r.id
       from custom.record r
      where r.organization_id = p_organization_id
        and r.table_id is null
        and r.data_class = 'record'
        and r.deleted_at is null
      order by r.created_at
      limit 1))
    into v_home;
  if v_home is null then
    raise exception 'This organization has nowhere to keep its tables yet, so the checklist steps have nowhere to live either.'
      using errcode = '23503',
            hint = 'REC-1: every Table lives in a Home. Make this organization''s first table, or its Home, and the checklist will keep its steps beside it.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           'Checklist steps',
    'slug',           'checklist_step',
    'type',           'entity',
    'label_singular', 'Step',
    'label_plural',   'Steps',
    'title_field',    'title',
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'position', 'direction', 'asc')),
    'agent_writable', true,
    'retention_days', 3650,
    'work_kind',      'checklist_step',
    'parent_id',      v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'))))
  returning id into v_id;

  perform custom.work_take_assignment(p_organization_id, v_id);

  -- A CHECKLIST STEP IS TICKED OFF, NOT DRAGGED THROUGH A BOARD. `custom.work_states()` ships
  -- the general model — Not started may become In progress or Cancelled, and only In progress
  -- may become Done — which is right for a quote or a deal somebody works on. A checklist step
  -- is a thing you DO and then tick: "Send the contract" has no In progress worth recording,
  -- and asking a person to move it twice is asking them to operate the software rather than do
  -- their job. The states are this TABLE's own vocabulary, held as records of its workflow-state
  -- Table, so this is exactly the change `custom.work_set_state`'s own hint names — "change the
  -- state records if this organization works differently" — and it changes nothing for any
  -- other Table. In progress stays available for the long ones.
  update custom.record s
     set data = s.data || jsonb_build_object('next', jsonb_build_array('In progress', 'Done', 'Cancelled'))
   where s.organization_id = p_organization_id
     and s.data ->> 'name' = 'Not started'
     and s.deleted_at is null
     and s.table_id = (select t.id from custom.record t
                        where t.organization_id = p_organization_id
                          and t.table_id = custom.table_kernel_id()
                          and t.data ->> 'slug' = left('checklist_step', 40) || '_work_state'
                          and t.deleted_at is null
                        limit 1);

  -- ONE declared Field: the step's own title, which is what the Table's `title_field` names
  -- and what every list of records shows. `position`, `run_id`, `ref`, `role`, `depends_on_ids`,
  -- `requires` and `evidence` are the checklist's own machinery and stay document keys, the way
  -- `work_template`'s graph does — a Field for each of them would put seven columns nobody
  -- types into in front of a person.
  --
  -- NO `parity_type`. FLD-11's list is select, multi_select, member, attachment, lookup,
  -- rollup, formula, url, email, phone, currency, percent, datetime — `text` is a BASE type
  -- and naming it as a parity type is refused by `custom._field_type_parity_guard`, which is
  -- how this was found (main database, 15:23 UTC): "the field Step says it is a text and that
  -- is not one of the field types this system ships".
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field',
          jsonb_build_object('key', 'title', 'label', 'Step', 'sort', 10,
                             'type', 'text',
                             'multi', false, 'dated', false, 'required', true,
                             'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                             'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                             'sensitivity', 'internal', 'context_policy', 'include',
                             'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false,
                             'entity_definition_id', v_id::text));

  return v_id;
end
$function$
