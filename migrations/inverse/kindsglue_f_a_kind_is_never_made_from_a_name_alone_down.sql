-- INVERSE of migrations/campaign/kindsglue_f_a_kind_is_never_made_from_a_name_alone.sql (lane KINDS-GLUE):
-- entity_row_create exactly as it was before the file (pg_get_functiondef, 2026-10-02), and content_ir_kind back to
-- create_via = 'refuse'.
-- based-on: public.entity_row_create(text, text, uuid) d49d645179e87bc4cd05e1c5c5b680007e027273faa3fb847c6c605f5f1bdd8b
-- lane: KINDS-GLUE

select set_config('app.actor_system', 'migration/kindsglue_f', true);

update platform.entity_types set create_via = 'refuse' where token = 'content_ir_kind';

CREATE OR REPLACE FUNCTION public.entity_row_create(p_token text, p_title text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_et    record;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'entity_row_create: nobody is signed in.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'entity_row_create: a new % needs a name.', coalesce(p_token, 'record')
      using errcode = '22004';
  end if;
  if p_organization_id is null then
    raise exception 'entity_row_create: name the organization this belongs to.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'entity_row_create: that is not an organization you can act in.' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;

  select et.schema_name, et.table_name, et.title_column, et.audit_class, et.label
    into v_et
    from platform.entity_types et
   where et.token = p_token and et.is_active and et.reference_pickable;
  if not found then
    raise exception 'entity_row_create: % is not a reference-pickable entity.', p_token
      using errcode = '22023',
            hint = 'Only an active, reference-pickable token in platform.entity_types can be created from a picker.';
  end if;
  if v_et.title_column is null then
    raise exception 'entity_row_create: a % has no single name column, so it cannot be created from a name alone.', coalesce(v_et.label, p_token)
      using errcode = '22023';
  end if;
  -- ACCESS MACHINERY IS NEVER REACHED BY A GENERIC "MAKE ME A ROW".
  if coalesce(v_et.audit_class, 'entity') = 'machinery' then
    raise exception 'entity_row_create: % is access machinery and is never created from a picker.', coalesce(v_et.label, p_token)
      using errcode = '42501';
  end if;
  -- 🚨 A TABLE WITH NO `organization_id` CANNOT CARRY ONE, and the direct path has been
  -- sending it anyway and getting 42703. `iam.organizations` is that table: creating an
  -- organization is `public.org_create`, which asks a different set of questions.
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = v_et.schema_name
                    and c.table_name = v_et.table_name
                    and c.column_name = 'organization_id') then
    raise exception 'entity_row_create: a % is not something that lives inside an organization, so it cannot be created here.', coalesce(v_et.label, p_token)
      using errcode = '22023',
            hint = 'An organization itself is created with public.org_create.';
  end if;

  execute format(
    'insert into %I.%I (%I, created_by, organization_id) values ($1, $2, $3) returning id',
    v_et.schema_name, v_et.table_name, v_et.title_column)
    into v_id using v_title, v_actor, p_organization_id;

  return jsonb_build_object('id', v_id, 'title', v_title, 'token', p_token);
end;
$function$;
