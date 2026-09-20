-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_steps_table(uuid) c1dea6aca56bafcad0775670c75509e696d0223a6bfaba67c0f955b942ffb366
--
-- CHECKLISTS — the fourth defect this lane's own green suite found before a person met it,
-- and the first fix for it was wrong.
--
-- REC-1: every Table lives somewhere, and `custom._table_shape_guard` refuses one that names
-- no Home. `custom.checklist_steps_table` named none at all, so the FIRST call to
-- `custom.checklist_declare` in any organization died. The obvious fix — the Table kernel,
-- which is what `custom.work_slots_declare` falls back to — is ALSO refused, by a different
-- guard and for a better reason: REC-8 / T15, *"containment never crosses an organization"*.
-- The kernel is not in anybody's organization, so no Table may live inside it. Measured here
-- on the main database at 15:21 UTC: *"that container is not in this organization"*.
--
-- THE HOME IS THE ONE THIS ORGANIZATION'S OWN TABLES ALREADY LIVE IN. Checklist steps are
-- about this organization's records, so they belong beside this organization's tables rather
-- than in a place the platform invented. Failing that — an organization whose store holds no
-- Table yet — it is the organization's own Home record. Failing THAT, it refuses in words that
-- say what is missing, because a Table with nowhere to live is not a thing to guess at.

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
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'),
                                jsonb_build_object('name', 'position'))))
  returning id into v_id;

  perform custom.work_take_assignment(p_organization_id, v_id);

  insert into custom.record (organization_id, table_id, data_class, data)
  select p_organization_id, custom.field_kernel_id(), 'field',
         v.spec || jsonb_build_object('entity_definition_id', v_id::text)
    from (values
      (jsonb_build_object('key', 'title', 'label', 'Step', 'sort', 10,
                          'type', 'text', 'parity_type', 'text',
                          'multi', false, 'dated', false, 'required', true,
                          'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                          'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                          'sensitivity', 'internal', 'context_policy', 'include',
                          'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false)),
      (jsonb_build_object('key', 'position', 'label', 'Order', 'sort', 20,
                          'type', 'number', 'parity_type', 'number',
                          'multi', false, 'dated', false, 'required', false,
                          'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                          'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                          'sensitivity', 'internal', 'context_policy', 'include',
                          'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false))
    ) v(spec);

  return v_id;
end
$$;
