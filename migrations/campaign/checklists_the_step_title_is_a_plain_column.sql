-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_steps_table(uuid) 4af55efc5a889e202744c454c6a2e9a107d7f02f8a76241e8b244c75158317db
--
-- CHECKLISTS — the fifth defect the green suite found, and it is the same class as the fourth:
-- the Checklist steps Table could not be MADE, so nothing downstream of it existed.
--
-- `custom._field_type_parity_guard` refused the step's own title column: *"the field Step says
-- it is a text and that is not one of the field types this system ships"* (main database,
-- 15:23 UTC). FLD-11's `parity_type` list is the THIRTEEN richer types — select, multi_select,
-- member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime
-- — and `text` is a BASE type, not one of them. A plain text column declares `type` and says
-- nothing about parity. Saying `parity_type: text` is the typo the guard exists to catch, and
-- it caught this lane's.
--
-- The second change is a subtraction. `position` was declared as a Field too, which would have
-- put a column nobody types into in front of every person who opened the steps Table. It goes
-- back to being a document key, like `run_id`, `ref` and `requires` — the same shape
-- `work_template` keeps its graph in.

set lock_timeout = '45s';

create or replace function custom.checklist_steps_table(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
$$;
