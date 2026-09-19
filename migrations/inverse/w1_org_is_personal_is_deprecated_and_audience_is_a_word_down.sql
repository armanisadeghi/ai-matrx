-- target: branch
-- based-on: public.list_templates(text,boolean) 268e21bc082840af30ea52fa2b9c23375d1c6fb044c8e15d3a68f1cd3b5e9da5
-- based-on: public.ctx_seed_template(jsonb) 19a5f330a2c20797cd1fdafc509656b3251d7f95a7895defba517fdf230982a2
--
-- (Read off the branch AFTER the up file applied — an inverse declares the bodies it is about
-- to overwrite, which are its own up file's.)
--
-- INVERSE of `migrations/campaign/w1_org_is_personal_is_deprecated_and_audience_is_a_word.sql`.
--
-- Restores the prior state exactly, measured off the branch on 2026-09-18 before the file ran:
--   · iam.organizations carried the partial unique index
--     `organizations_one_personal_per_creator ON iam.organizations (created_by)
--      WHERE is_personal IS TRUE AND created_by IS NOT NULL` and NO column comment;
--   · platform.deprecated_relations held no row for iam.organizations.is_personal;
--   · iam.is_personal_dependents() did not exist;
--   · context.templates carried `is_personal boolean` and no `audience` column;
--   · platform.client_callable_door held no row for public.ctx_seed_template;
--   · the two bodies read is_personal.
--
-- The template rows round-trip losslessly: `audience` was derived from `is_personal` by a
-- two-valued mapping, so the reverse mapping restores every row's original boolean. Zero rows
-- on the branch, 34 on production, and the mapping is total either way.
--
-- It is a `-- target: branch` file and can never reach production.

set lock_timeout = '5s';

-- 2'. REC-64 undone --------------------------------------------------------------------------
alter table context.templates add column is_personal boolean;

update context.templates set is_personal = (audience = 'individual');

alter table context.templates alter column is_personal set not null;
alter table context.templates alter column is_personal set default false;

alter table context.templates drop constraint templates_audience_is_one_of_two;
alter table context.templates drop column audience;

create or replace function public.list_templates(p_category text default null::text, p_personal_only boolean default null::boolean)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'key', t.key, 'name', t.name, 'description', t.description,
        'category', t.category, 'icon', t.icon, 'is_personal', t.is_personal,
        'scope_types', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'label_singular', tst.label_singular,
              'label_plural', tst.label_plural,
              'icon', tst.icon,
              'field_count', (SELECT count(*) FROM context.template_context_items WHERE template_scope_type_id = tst.id),
              'fields', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('key', tci.key, 'display_name', tci.display_name) ORDER BY tci.sort_order)
                FROM context.template_context_items tci
                WHERE tci.template_scope_type_id = tst.id
              ), '[]'::jsonb)
            ) ORDER BY tst.sort_order
          )
          FROM context.template_scope_types tst
          WHERE tst.template_id = t.id
        ), '[]'::jsonb)
      ) ORDER BY t.sort_order, t.name
    )
    FROM context.templates t
    WHERE t.is_active = true
      AND (p_category IS NULL OR t.category = p_category)
      AND (p_personal_only IS NULL OR t.is_personal = p_personal_only)
  ), '[]'::jsonb);
END;
$function$;

create or replace function public.ctx_seed_template(p_template jsonb)
returns uuid
language plpgsql
security definer
as $function$
DECLARE
  v_template_id uuid;
  v_type_record jsonb;
  v_type_id uuid;
  v_field jsonb;
  v_field_sort int;
  v_type_id_map jsonb := '{}'::jsonb;
BEGIN
  -- Insert template
  INSERT INTO context.templates (key, name, description, category, icon, sort_order, is_personal)
  VALUES (
    p_template->>'key',
    p_template->>'name',
    COALESCE(p_template->>'description', ''),
    p_template->>'category',
    COALESCE(p_template->>'icon', 'folder'),
    COALESCE((p_template->>'sort_order')::int, 0),
    COALESCE((p_template->>'is_personal')::boolean, false)
  )
  RETURNING id INTO v_template_id;

  -- First pass: insert all scope types (without parent refs)
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    INSERT INTO context.template_scope_types (
      template_id, key, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity
    ) VALUES (
      v_template_id,
      v_type_record->>'key',
      v_type_record->>'singular',
      v_type_record->>'plural',
      COALESCE(v_type_record->>'icon', 'folder'),
      COALESCE(v_type_record->>'description', ''),
      COALESCE((v_type_record->>'sort_order')::int, 0),
      NULLIF((v_type_record->>'max_assignments_per_entity'), '')::smallint
    )
    RETURNING id INTO v_type_id;

    v_type_id_map := v_type_id_map || jsonb_build_object(v_type_record->>'key', v_type_id::text);

    -- Insert fields for this scope type
    v_field_sort := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_type_record->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO context.template_context_items (
        template_scope_type_id, key, display_name, description, value_type, sort_order
      ) VALUES (
        v_type_id,
        v_field->>'key',
        v_field->>'display_name',
        COALESCE(v_field->>'description', ''),
        COALESCE(NULLIF((v_field->>'value_type'), '')::context_value_type, 'string'::context_value_type),
        v_field_sort
      );
      v_field_sort := v_field_sort + 1;
    END LOOP;
  END LOOP;

  -- Second pass: resolve parent_template_type_id for nested types
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    IF v_type_record->>'parent_key' IS NOT NULL THEN
      UPDATE context.template_scope_types
      SET parent_template_type_id = (v_type_id_map->>(v_type_record->>'parent_key'))::uuid
      WHERE id = (v_type_id_map->>(v_type_record->>'key'))::uuid;
    END IF;
  END LOOP;

  RETURN v_template_id;
END;
$function$;

delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'ctx_seed_template';

-- 1'. REC-61 undone ---------------------------------------------------------------------------
drop function if exists iam.is_personal_dependents();

delete from platform.deprecated_relations
 where old_ref = 'iam.organizations.is_personal';

comment on column iam.organizations.is_personal is null;

create unique index organizations_one_personal_per_creator
  on iam.organizations using btree (created_by)
  where ((is_personal is true) and (created_by is not null));
