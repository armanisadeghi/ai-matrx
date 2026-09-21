-- chair-step: the only non-additive statement is REVOKE EXECUTE on the one function THIS FILE CREATES (default PUBLIC execute removed before the explicit grant, per db-rules 6d-4); nothing existing loses a privilege, nothing is dropped
-- ============================================================================
-- udt_table_row_actions — ONE-CLICK ACTIONS on the rows of a user data table
-- ============================================================================
-- Airtable's button field, Notion's database button: a named button on a row
-- that applies a fixed set of changes ("New Week": status → AVAILABLE, clear
-- Total and Fable, Reset date → DATEADD({Reset date}, 7, "days")), or hands
-- the row to an agent with a prompt. Stored on the dataset as
--   metadata->'row_actions' = [ {id, name, color, confirm, kind: 'update', steps: [...]}
--                             | {id, name, color, confirm, kind: 'agent', prompt} ]
-- Steps: {field, set: 'value', value} | {field, set: 'clear'}
--      | {field, set: 'formula', expression}  (the data-tables formula language,
--        evaluated on the client against the row BEFORE the action —
--        features/data-tables/row-actions.ts). The writes themselves go through
--        udt_bulk_write as ordinary merge ops, so validation rules, computed-
--        column protection and row history all apply unchanged.
--
-- One door, editor access, shape-checked here so a client can never store an
-- action the readers cannot interpret or that names a column that is not on
-- the table. Additive apart from the REVOKE named above.
-- ============================================================================

create or replace function public.udt_set_table_row_actions(
  p_table_id uuid,
  p_row_actions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_action jsonb;
  v_step jsonb;
  v_kind text;
  v_set text;
  v_field text;
  v_name text;
  v_metadata jsonb;
  v_ids text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_actions is not null and jsonb_typeof(p_row_actions) <> 'null' then
    if jsonb_typeof(p_row_actions) <> 'array' then
      raise exception 'row_actions must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_row_actions) > 24 then
      raise exception 'a table can have at most 24 row actions' using errcode = '22023';
    end if;
    if length(p_row_actions::text) > 200000 then
      raise exception 'row_actions is larger than 200 KB' using errcode = '22023';
    end if;
    for v_action in select * from jsonb_array_elements(p_row_actions) loop
      if jsonb_typeof(v_action) <> 'object' then
        raise exception 'each row action must be an object' using errcode = '22023';
      end if;
      if coalesce(v_action->>'id', '') = '' then
        raise exception 'a row action is missing its id' using errcode = '22023';
      end if;
      if v_action->>'id' = any (v_ids) then
        raise exception 'two row actions share the id "%"', v_action->>'id' using errcode = '22023';
      end if;
      v_ids := v_ids || (v_action->>'id');
      v_name := btrim(coalesce(v_action->>'name', ''));
      if v_name = '' then
        raise exception 'a row action is missing its name' using errcode = '22023';
      end if;
      if length(v_name) > 80 then
        raise exception 'row action name "%" is longer than 80 characters', left(v_name, 20) using errcode = '22023';
      end if;
      v_kind := coalesce(v_action->>'kind', 'update');
      if v_kind = 'agent' then
        if btrim(coalesce(v_action->>'prompt', '')) = '' then
          raise exception 'row action "%" asks an agent but has no prompt', v_name using errcode = '22023';
        end if;
      elsif v_kind = 'update' then
        if jsonb_typeof(v_action->'steps') <> 'array' or jsonb_array_length(v_action->'steps') = 0 then
          raise exception 'row action "%" has no changes', v_name using errcode = '22023';
        end if;
        if jsonb_array_length(v_action->'steps') > 60 then
          raise exception 'row action "%" changes more than 60 columns', v_name using errcode = '22023';
        end if;
        for v_step in select * from jsonb_array_elements(v_action->'steps') loop
          v_field := v_step->>'field';
          if v_field is null or not exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
          ) then
            raise exception 'row action "%" names a column "%" that is not on this table', v_name, coalesce(v_field, '') using errcode = '22023';
          end if;
          if exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
              and metadata->'format'->>'id' in ('formula', 'created_time', 'modified_time', 'autonumber')
          ) then
            raise exception 'row action "%" sets the calculated column "%"', v_name, v_field using errcode = '22023';
          end if;
          v_set := v_step->>'set';
          if v_set not in ('value', 'clear', 'formula') then
            raise exception 'row action "%": step.set must be value, clear or formula', v_name using errcode = '22023';
          end if;
          if v_set = 'formula' and btrim(coalesce(v_step->>'expression', '')) = '' then
            raise exception 'row action "%": the formula for "%" is empty', v_name, v_field using errcode = '22023';
          end if;
        end loop;
      else
        raise exception 'row action "%": kind must be update or agent', v_name using errcode = '22023';
      end if;
    end loop;
    if jsonb_array_length(p_row_actions) = 0 then
      p_row_actions := null;
    end if;
  else
    p_row_actions := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_actions is null then coalesce(metadata, '{}'::jsonb) - 'row_actions'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_actions}', p_row_actions, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    raise exception 'dataset % not found', p_table_id using errcode = 'P0002';
  end if;

  return jsonb_build_object('success', true, 'row_actions', coalesce(v_metadata -> 'row_actions', '[]'::jsonb));
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'udt_set_table_row_actions', 'p_table_id uuid, p_row_actions jsonb',
   'data-tables row actions (2026-09-21)',
   'SIGNED-IN door (authenticated only). Replaces the row actions (metadata->row_actions) of a user data table; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.',
   false, null)
on conflict do nothing;

revoke execute on function public.udt_set_table_row_actions(uuid, jsonb) from public, anon;
grant execute on function public.udt_set_table_row_actions(uuid, jsonb) to authenticated, service_role;
