-- additive: yes
-- based-on: platform._pick_list_born_in_store(uuid, text, text, jsonb) 7036e11684817001890da44588b518066c92419afa9c7ac9cfc70657031504cc
--
-- HANDOVER (2026-09-27) — A NEW PICKLIST IS KEPT WITH THE CHOICES.
--
-- Replaces ONE live body, same signature, grants and door row; nothing dropped or granted; no row
-- touched. The use case: the owner of Cedar Ridge Physical Therapy makes the picklist "Visit Types"
-- on the Picklists page; it then also appeared on the data home and the organization's Tables page as
-- an ordinary table ("Visit Types, 5 columns"), while a picklist that MOVED with its organization's
-- switch sits behind "Show everything" as one of the app's choice lists. Now a picklist born in the
-- store says it is kept with the choices, as a moved one already is (custom.table_placement reads
-- data.kept_for).
-- Guard: matrx-frontend/scripts/campaign-tests/handover_a_new_picklist_is_kept_with_the_choices.sql
-- Inverse: migrations/inverse/handover_a_new_picklist_is_kept_with_the_choices_down.sql

CREATE OR REPLACE FUNCTION platform._pick_list_born_in_store(p_organization_id uuid, p_list_name text, p_description text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name  text := coalesce(nullif(btrim(p_list_name), ''), 'List');
  v_home  uuid;
  v_table uuid;
  v_rows  jsonb[];
  v_ids   uuid[];
  v_item  jsonb;
begin
  if auth.uid() is null then
    raise exception 'A new list in an organization whose Data tables moved to the new system is made in the store, in the person''s own seat — this call has no signed-in person.'
      using errcode = '42501',
            hint = 'Call create_user_list as the person (the frontend''s client, or the server''s act-as-user session).';
  end if;

  v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                jsonb_build_object('name', v_name || ' Home'));
  v_table := custom.table_declare(p_organization_id, jsonb_build_object(
    'name', v_name,
    'slug', left(trim(both '_' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '_', 'g'))), 40)
            || '_' || left(replace(gen_random_uuid()::text, '-', ''), 6),
    'type', 'entity',
    'label_singular', v_name,
    'label_plural', v_name,
    'display', 'list',
    'weight', 'light',
    'ordered', false,
    'row_order', 'manual',
    'title_field', 'name',
    'retention_days', 365,
    -- KEPT WITH THE CHOICES (lane HANDOVER): a picklist lives on the Picklists page and behind
    -- "Show everything" on the data home, never among the organization's ordinary tables.
    'kept_for', 'choices',
    'agent_writable', true,
    'default_sort', '[]'::jsonb,
    'parent_id', v_home,
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'name', 'key', 'name', 'label', 'Name', 'type', 'text'),
      jsonb_build_object('name', 'description', 'key', 'description', 'label', 'Description', 'type', 'long_text'),
      jsonb_build_object('name', 'help_text', 'key', 'help_text', 'label', 'Help text', 'type', 'text'),
      jsonb_build_object('name', 'group_name', 'key', 'group_name', 'label', 'Group', 'type', 'text'),
      jsonb_build_object('name', 'icon', 'key', 'icon', 'label', 'Icon', 'type', 'text'))));

  if nullif(btrim(p_description), '') is not null then
    perform custom.record_update(p_organization_id, v_table, jsonb_build_object('description', btrim(p_description)));
  end if;
  update custom.record
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'pick_list', jsonb_build_object('born', 'public.create_user_list', 'by', auth.uid(), 'at', now()))
   where organization_id = p_organization_id and id = v_table;

  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    for v_item in select * from jsonb_array_elements(p_items) loop
      continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
      v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
        'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
        'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
        'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
        'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'Icon', v_item ->> 'icon')));
    end loop;
    if coalesce(cardinality(v_rows), 0) > 0 then
      v_ids := custom.record_write_many(p_organization_id, v_table, v_rows);
    end if;
  end if;

  return jsonb_build_object(
    'list_id', v_table,
    'list_name', v_name,
    'description', nullif(btrim(p_description), ''),
    'lives_in', 'record',
    'address', '/lists/' || v_table::text,
    'organization_id', p_organization_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
               'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
        from custom.record c
       where c.organization_id = p_organization_id and c.table_id = v_table
         and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
end;
$function$;
