-- The legacy execution payload expected an output_format key, but canonical
-- agent definitions store output_schema only. Preserve the response key with
-- a null value instead of referencing a dropped column.

create or replace function public.get_prompt_app_execution_payload(p_app_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_app record;
  v_result jsonb;
begin
  select app_row.agent_id, app_row.agent_version_id, app_row.use_latest
    into v_app
  from app.definition as app_row
  where app_row.id = p_app_id
    and app_row.deleted_at is null
    and (
      auth.role() = 'service_role'
      or app_row.visibility = 'public'::platform.visibility
      or app_row.created_by = auth.uid()
      or iam.has_access('app', app_row.id, 'viewer'::public.permission_level)
    );

  if not found then
    return jsonb_build_object('error', 'App not found');
  end if;

  if v_app.agent_version_id is not null and not coalesce(v_app.use_latest, true) then
    select jsonb_build_object(
      'messages', version_row.messages,
      'variable_defaults', version_row.variable_definitions,
      'tools', version_row.tools,
      'settings', version_row.settings,
      'model_id', version_row.model_id,
      'output_format', null,
      'output_schema', version_row.output_schema,
      'source_type', 'agent',
      'source_id', version_row.agent_id,
      'version_number', version_row.version_number
    )
      into v_result
    from agent.definition_version as version_row
    where version_row.id = v_app.agent_version_id;
  end if;

  if v_result is null then
    select jsonb_build_object(
      'messages', agent_row.messages,
      'variable_defaults', agent_row.variable_definitions,
      'tools', agent_row.tools,
      'settings', agent_row.settings,
      'model_id', agent_row.model_id,
      'output_format', null,
      'output_schema', agent_row.output_schema,
      'source_type', 'agent',
      'source_id', agent_row.id,
      'version_number', agent_row.version,
      '_fallback', true
    )
      into v_result
    from agent.definition as agent_row
    where agent_row.id = v_app.agent_id;
  end if;

  return coalesce(v_result, jsonb_build_object('error', 'No agent data found'));
end;
$function$;
