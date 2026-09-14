-- THE PRE-FIX BODY of public.agx_get_access_level, kept verbatim so
-- `pnpm check:door-rows:self-test` can prove the DISCLOSURE ORACLE fails it.
-- V-102 F1 measured this body handing test@test.com the NAME of an agent they
-- cannot SELECT and the EMAIL ADDRESS of its owner, in the same answer that said
-- access_level = "none". It is restored only inside a transaction that is always
-- rolled back, and the self-test re-reads the live body afterwards to prove the
-- guard is still there. NEVER apply this file.
create or replace function public.agx_get_access_level(p_agent_id uuid)
returns table(agent_id uuid, agent_name text, owner_id uuid, owner_email text, access_level text, is_owner boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE v_uid uuid := auth.uid(); v_agent record; v_level text := NULL; v_email text;
BEGIN
  SELECT a.id, a.name, a.created_by, a.organization_id, a.visibility INTO v_agent FROM agent.definition a WHERE a.id = p_agent_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_agent.created_by;
  IF v_agent.created_by = v_uid THEN v_level := 'owner';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'admin') THEN v_level := 'admin';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'editor') THEN v_level := 'editor';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN v_level := 'viewer';
  ELSIF v_agent.visibility = 'public'::platform.visibility THEN v_level := 'public';
  ELSE v_level := 'none'; END IF;
  RETURN QUERY SELECT v_agent.id, v_agent.name, v_agent.created_by, v_email, v_level, (v_agent.created_by = v_uid);
END;
$function$;
