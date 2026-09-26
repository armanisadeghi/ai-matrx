-- chair-step: lane V24-TAILS item 3 (VERIFIER-24, two agents both named "Agent Structure Builder" in Matrx System). The agent catalog refuses a duplicate name within one organization: BEFORE INSERT OR UPDATE trigger agent._refuse_duplicate_agent_name (fires last, after the builtin org guard) raises 23505 with a sentence naming the free name ("… Name this one \"X (2)\".") when a live agent in the same organization already has that name (trimmed, case-insensitive) and the row is new, renamed, moved, or restored. Rows that do not change name/organization/deleted_at are untouched, so the 57 existing duplicate groups keep saving. The two copy doors (agx_duplicate_agent, agx_duplicate_version) name their copy with agent.next_free_agent_name so a second copy is "X (Copy) (2)" instead of a refusal. No data write.
-- lane: V24-TAILS
-- based-on: public.agx_duplicate_agent(uuid, boolean, uuid) 2595b331b48efcf56a6492eff481e5e193ed4fc871ede95fd681271846afc6cf
-- based-on: public.agx_duplicate_version(uuid, boolean, uuid) 68b31d820830d718a727cd217dcbc1e888409fee59649bc14fafcd0c2eb0d41d
-- INVERSE: migrations/inverse/v24tails_an_organization_has_one_agent_by_each_name_down.sql


-- The name a new or renamed agent may take in this organization: the wanted name when it is free,
-- else "name (2)", "name (3)" … — the one offer the refusal and the copy doors both make.
CREATE OR REPLACE FUNCTION agent.next_free_agent_name(p_organization_id uuid, p_name text, p_except uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_org  uuid := coalesce(p_organization_id, public.system_org_id('system'));
  v_base text := btrim(coalesce(p_name, ''));
  v_try  text := v_base;
  v_n    integer := 1;
begin
  if v_base = '' then return p_name; end if;
  while exists (
    select 1 from agent.definition d
     where d.organization_id = v_org
       and d.deleted_at is null
       and (p_except is null or d.id <> p_except)
       and lower(btrim(d.name)) = lower(v_try)
  ) loop
    v_n := v_n + 1;
    v_try := format('%s (%s)', v_base, v_n);
    exit when v_n > 999;
  end loop;
  return v_try;
end;
$function$;

-- THE CATALOG REFUSES A SECOND AGENT BY THE SAME NAME IN ONE ORGANIZATION, in words, with the offer.
CREATE OR REPLACE FUNCTION agent._refuse_duplicate_agent_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_free text;
  v_org_name text;
begin
  if NEW.deleted_at is not null or NEW.organization_id is null or btrim(coalesce(NEW.name, '')) = '' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE'
     and lower(btrim(NEW.name)) = lower(btrim(coalesce(OLD.name, '')))
     and NEW.organization_id is not distinct from OLD.organization_id
     and OLD.deleted_at is null then
    return NEW;
  end if;
  if exists (
    select 1 from agent.definition d
     where d.organization_id = NEW.organization_id
       and d.deleted_at is null
       and d.id <> NEW.id
       and lower(btrim(d.name)) = lower(btrim(NEW.name))
  ) then
    v_free := agent.next_free_agent_name(NEW.organization_id, NEW.name, NEW.id);
    select o.name into v_org_name from iam.organizations o where o.id = NEW.organization_id;
    raise exception 'An agent named "%" already exists in %. Name this one "%".',
      btrim(NEW.name), coalesce(v_org_name, 'this organization'), v_free
      using errcode = '23505', detail = v_free, hint = 'agent_name_taken';
  end if;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS zzz_refuse_duplicate_agent_name ON agent.definition;
CREATE TRIGGER zzz_refuse_duplicate_agent_name
  BEFORE INSERT OR UPDATE OF name, organization_id, deleted_at ON agent.definition
  FOR EACH ROW EXECUTE FUNCTION agent._refuse_duplicate_agent_name();

CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
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
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
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
      v_source.category, v_source.tags, true, false, false,
      NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
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
      v_source.category, v_source.tags, true, false, false,
      v_uid, p_organization_id, NULL, p_agent_id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_version(p_version_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ver        record;
  v_master     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM agent.definition_version
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent version not found';
  END IF;

  SELECT * INTO v_master
  FROM agent.definition
  WHERE id = v_ver.agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master agent not found for version';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT (
    iam.has_access_for(v_uid, 'agent', v_master.id, 'viewer')
    OR v_master.agent_type = 'builtin'
  ) THEN
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
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_ver.name || ' (Copy)'), v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      NULL, NULL, v_master.id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_ver.name || ' (Copy)'), v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      v_uid, p_organization_id, NULL, v_master.id, now()
    );
  END IF;

  RETURN v_new_id;
END;
$function$;
