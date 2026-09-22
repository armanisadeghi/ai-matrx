-- chair-step: the inverse of
--   `migrations/campaign/oldtables_w3_a_relation_column_takes_an_id_not_a_name.sql`.
--   It DROPS the trigger `udt_dataset_rows_relation_cells_take_ids` and the function behind it,
--   `workbench.udt_relation_cells_take_ids()`, and puts `public.create_user_table_with_fields`
--   back to the body it had before — the one that drops `metadata` on the floor, which is why
--   running this inverse takes the estate back to a state where no table created through that
--   door can carry a format at all. Both objects were created by that file and by nothing else.
--   No row of anybody's data is touched.
--
--   THE LOCK: the `drop trigger` below takes ACCESS EXCLUSIVE on 23 relations it does not name
--   — Supabase's own `supautils` hook, the same auth/storage/realtime set a `CREATE POLICY`
--   takes — held to COMMIT, so sign-in, file reads and realtime pause for the length of this
--   transaction (measured on the clone: ~500 ms). An inverse is deliberate and attended, which
--   is why the DROP lives here and not in the up-migration, but run it in the 1-4 AM window if
--   anything else about the moment is uncertain.
--
-- based-on: public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb) f9fe58edb0520dea4a61e4cb0e26f11a5e595c0b8ebff15ecdb912105477d75e

drop trigger if exists udt_dataset_rows_relation_cells_take_ids on workbench.udt_dataset_rows;
drop function if exists workbench.udt_relation_cells_take_ids();

create or replace function public.create_user_table_with_fields(
  p_table_name text,
  p_description text default null::text,
  p_is_public boolean default false,
  p_organization_id uuid default null::uuid,
  p_project_id uuid default null::uuid,
  p_task_id uuid default null::uuid,
  p_fields jsonb default '[]'::jsonb)
returns uuid
language plpgsql
as $function$
DECLARE
  v_table_id uuid;
  v_field    jsonb;
BEGIN
  INSERT INTO workbench.udt_datasets (
    table_name, description, is_public,
    organization_id, project_id, task_id, user_id
  )
  VALUES (
    p_table_name, p_description, p_is_public,
    p_organization_id, p_project_id, p_task_id, (select auth.uid())
  )
  RETURNING id INTO v_table_id;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    INSERT INTO workbench.udt_dataset_fields (
      table_id, user_id,
      field_name, display_name,
      data_type, field_order, is_required,
      default_value, validation_rules
    )
    VALUES (
      v_table_id,
      (select auth.uid()),
      v_field->>'field_name',
      COALESCE(v_field->>'display_name', v_field->>'field_name'),
      COALESCE((v_field->>'data_type')::public.field_data_type, 'string'::public.field_data_type),
      COALESCE((v_field->>'field_order')::int, 0),
      COALESCE((v_field->>'is_required')::boolean, false),
      v_field->'default_value',
      v_field->'validation_rules'
    );
  END LOOP;

  RETURN v_table_id;
END;
$function$;
