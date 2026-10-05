-- chair-step: it ADDS two columns to agent.definition (follows_source boolean NOT NULL DEFAULT false, source_version integer, both metadata-only), ONE BEFORE UPDATE trigger (zz_follows_source_stops_on_edit) that turns follows_source off the moment a following copy's instructions, tools, model or settings change, ONE door public.agx_reset_agent_to_source(uuid) (SECURITY INVOKER, so RLS decides who may reset) that puts the source's current content back and turns following on, and REPLACES public.agx_duplicate_agent with the same body plus a fourth argument p_follows_source boolean DEFAULT false that marks the copy as following and records the source version. Existing rows and callers are unchanged: every row reads follows_source = false, and every three-argument call (positional or named) resolves to the new function exactly as before.
-- lane: TEMPLATES
-- based-on: public.agx_duplicate_agent(uuid, boolean, uuid) 59aa671cbee102adefccbcbf5a0939c495039ef538d7ed9f25c8eaf70f0d2650
-- lock: none
--
-- Inverse: migrations/inverse/templates7_b_a_template_copy_follows_its_source_down.sql
--
-- v7 TEMPLATES sublane AGENT-FOLLOWS. Ruling (chair 2026-10-03, Arman's plan item "agent copies follow
-- the platform version unless edited").
-- THE USE CASE. A salon owner installs the bookings template; it copies "Answers From Your Tables" into
-- her organization and points it at her tables. A week later the platform agent gets a better prompt.
-- Today her copy never sees it: it is a fork linked only by source_agent_id. After this file a copy made
-- by a template install carries follows_source = true; while it does, a run resolves the SOURCE's
-- current instructions, tools, model and settings (aidream: agx load_for_execution) and keeps only her
-- own variable bindings. When she edits the copy's instructions, tools or model it stops following
-- (one way). "Reset to latest" (agx_reset_agent_to_source) brings the source's content back and
-- turns following on again.

set local statement_timeout = '60s';

-- 1. The two columns (constant default: no table rewrite).
alter table agent.definition
  add column if not exists follows_source boolean not null default false,
  add column if not exists source_version integer;

comment on column agent.definition.follows_source is
  'True while this copy runs its source agent''s current instructions, tools, model and settings (only its own variable bindings are kept). Turned off by any edit to those; turned back on by agx_reset_agent_to_source.';
comment on column agent.definition.source_version is
  'The source agent''s version this copy was made (or last reset) from.';

-- 2. An edit to what the copy follows ends the following.
create or replace function agent._follows_source_stops_on_edit()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  if old.follows_source and new.follows_source
     and coalesce(current_setting('matrx.agent_reset_to_source', true), '') <> new.id::text
     and (   new.messages          is distinct from old.messages
          or new.tools             is distinct from old.tools
          or new.custom_tools      is distinct from old.custom_tools
          or new.mcp_servers       is distinct from old.mcp_servers
          or new.model_id          is distinct from old.model_id
          or new.model_tiers       is distinct from old.model_tiers
          or new.settings          is distinct from old.settings
          or new.output_schema::text is distinct from old.output_schema::text
          or new.context_policies  is distinct from old.context_policies
          or new.tool_config       is distinct from old.tool_config
          or new.skill_config      is distinct from old.skill_config)
  then
    new.follows_source := false;
  end if;
  return new;
end;
$function$;

create trigger zz_follows_source_stops_on_edit
  before update on agent.definition
  for each row execute function agent._follows_source_stops_on_edit();

-- 3. Reset to latest: the source's current content back, following on. As the caller (RLS decides).
create or replace function public.agx_reset_agent_to_source(p_agent_id uuid)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to 'pg_catalog'
as $function$
declare
  v_copy agent.definition;
  v_src  agent.definition;
  v_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_copy from agent.definition where id = p_agent_id and deleted_at is null;
  if not found then
    raise exception 'Agent not found' using errcode = 'P0002';
  end if;
  if v_copy.source_agent_id is null then
    raise exception 'This agent was not copied from another agent, so there is nothing to reset to.'
      using errcode = '22023';
  end if;

  select * into v_src from agent.definition where id = v_copy.source_agent_id and deleted_at is null;
  if not found then
    raise exception 'The agent this was copied from is no longer available.' using errcode = 'P0002';
  end if;

  perform set_config('matrx.agent_reset_to_source', p_agent_id::text, true);

  update agent.definition d
     set messages              = v_src.messages,
         tools                 = v_src.tools,
         custom_tools          = v_src.custom_tools,
         mcp_servers           = v_src.mcp_servers,
         model_id              = v_src.model_id,
         model_tiers           = v_src.model_tiers,
         settings              = v_src.settings,
         output_schema         = v_src.output_schema,
         context_policies      = v_src.context_policies,
         auto_context_disabled = v_src.auto_context_disabled,
         tool_config           = v_src.tool_config,
         skill_config          = v_src.skill_config,
         follows_source        = true,
         source_version        = v_src.version,
         source_snapshot_at    = now()
   where d.id = p_agent_id;
  get diagnostics v_rows = row_count;

  perform set_config('matrx.agent_reset_to_source', '', true);

  if v_rows = 0 then
    raise exception 'You cannot edit this agent.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'agent_id', p_agent_id,
    'follows_source', true,
    'source_agent_id', v_src.id,
    'source_version', v_src.version
  );
end;
$function$;

revoke all on function public.agx_reset_agent_to_source(uuid) from public, anon;
grant execute on function public.agx_reset_agent_to_source(uuid) to authenticated, service_role;

-- 4. The duplicate door takes p_follows_source (same body otherwise).
drop function if exists public.agx_duplicate_agent(uuid, boolean, uuid);

CREATE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_follows_source boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
  v_follows    boolean := COALESCE(p_follows_source, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM agent.definition
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT v_as_system THEN
    -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
    -- chooses a tenant). Until this function took p_organization_id it wrote NULL
    -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
    -- copy died on the NOT NULL constraint with a message nobody could act on.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
        USING ERRCODE = '22023';
    END IF;
    IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
      RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, metadata,
      organization_id, task_id, source_agent_id, source_snapshot_at,
      follows_source, source_version
    )
    VALUES (
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, jsonb_build_object('tools_declared', true),
      NULL, NULL, p_agent_id, now(),
      v_follows, v_source.version
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, metadata,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at,
      follows_source, source_version
    )
    VALUES (
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, jsonb_build_object('tools_declared', true),
      v_uid, p_organization_id, NULL, p_agent_id, now(),
      v_follows, v_source.version
    );
  END IF;

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(p_agent_id, v_new_id, v_uid);

  RETURN v_new_id;
END;
$function$;

-- Its door row follows the signature (written before the GRANT, so the door guard keeps the client EXECUTE).
update platform.client_callable_door
   set identity_args     = 'p_agent_id uuid, p_as_system boolean, p_organization_id uuid, p_follows_source boolean',
       identity_argtypes = array[2950, 16, 2950, 16]::oid[],
       argument_rules    = jsonb_set(argument_rules, '{arguments,p_follows_source}',
                             '{"type":"boolean","check":"validated or interpreted by the function body after access is decided","foreign":{"not_an_id":true},"optional":true,"position":4,"null_rule":{"means":"the function default applies"}}'::jsonb),
       reason            = reason || ' 2026-10-04 (templates7_b): gained p_follows_source — a template install marks its copy as following the source agent.'
 where schema_name = 'public' and function_name = 'agx_duplicate_agent';

revoke all on function public.agx_duplicate_agent(uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.agx_duplicate_agent(uuid, boolean, uuid, boolean) to authenticated, service_role;
