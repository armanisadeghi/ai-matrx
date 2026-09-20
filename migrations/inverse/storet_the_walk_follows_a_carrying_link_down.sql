-- STORE-T, the inverse: the edge set and the two agent doors back byte-for-byte.

CREATE OR REPLACE FUNCTION custom.query_relation_edges(p_organization_id uuid, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(parent_id uuid, child_id uuid, role text, flavor text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_relation_edges');
  return query
select a.source_id, a.target_id, a.role, d.declaration ->> 'flavor'
    from platform.associations a
    cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id)
                          as declaration) d
   where a.organization_id = p_organization_id
     and a.deleted_at is null
     and a.relation_field_id is not null
     and a.source_type = 'record'
     and (p_role is null or a.role = p_role)
     and (p_flavor is null or d.declaration ->> 'flavor' = p_flavor);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agent_change_approval(p_organization uuid, p_conversation uuid DEFAULT NULL::uuid, p_table uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_raw      text;
  v_setting  text;
  v_own      boolean := false;
  v_required boolean;
  v_reason   text;
  v_why      text;
  v_owner    oid;
  c_how constant text :=
    'An administrator changes this on the organization''s data settings: '
    '`never ask` lets an agent change schema and write records freely, `ask` (the '
    'default) exempts only the table the agent made in this conversation, and '
    '`always ask` asks about every change. It is the knob custom/agent_schema_changes.';
begin
  if p_organization is null then
    raise exception 'agent_change_approval: an organization is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- THE ONE BRANCH THAT USED TO RAISE. It answers instead, at the strict end, and says
  -- which question it could not answer.
  -- THE TWO CALLERS THE STORE HAS, asked in the order they occur. A member is the
  -- ordinary case; the owner of `custom.record` is the server lane, admitted here on
  -- exactly the terms `custom.assert_store_door` admits it, and read off the CATALOGUE
  -- rather than named as a role literal so the two cannot drift.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not (pg_has_role(current_user, v_owner, 'member') or iam.has_org_access(p_organization)) then
    return jsonb_build_object(
      'setting',           'ask',
      'raw',               null,
      'approval_required', true,
      'own_table',         false,
      'reason',            'caller_not_verified',
      'why',               'This change was not made: the person it would be made for '
                           'could not be confirmed as a member of that organization, so '
                           'the organization''s own setting was never consulted.',
      'how_to_change',     c_how
    );
  end if;

  v_raw := trim(both '"' from coalesce(
    platform.knob_resolve('custom', 'agent_schema_changes', p_organization)::text, ''));

  v_setting := case lower(v_raw)
                 when 'auto'       then 'never_ask'
                 when 'never_ask'  then 'never_ask'
                 when 'always_ask' then 'always_ask'
                 when 'propose'    then 'ask'
                 when 'ask'        then 'ask'
                 else null
               end;

  if v_setting is null then
    v_setting := 'ask';
    v_why := format(
      'custom/agent_schema_changes resolved %L, which is not one of never_ask / ask / '
      'always_ask, so this organization is being treated as `ask`.', v_raw);
  end if;

  if p_table is not null and p_conversation is not null then
    select true into v_own
      from custom.agent_table_origin o
     where o.organization_id = p_organization
       and o.table_id        = p_table
       and o.conversation_id = p_conversation
     limit 1;
    v_own := coalesce(v_own, false);
  end if;

  if v_setting = 'never_ask' then
    v_required := false;
    v_reason   := 'organization_never_asks';
    v_why      := coalesce(v_why, 'This organization does not ask about agent changes.');
  elsif v_setting = 'always_ask' then
    v_required := true;
    v_reason   := 'organization_always_asks';
    v_why      := coalesce(v_why,
      'This organization asks a person about every agent change, including a table the '
      'agent made itself.');
  elsif v_own then
    v_required := false;
    v_reason   := 'own_table_this_conversation';
    v_why      := coalesce(v_why,
      'This is the table the agent made in this conversation, so it goes ahead without '
      'asking.');
  elsif p_table is null then
    v_required := false;
    v_reason   := 'new_table_is_the_agents_own';
    v_why      := coalesce(v_why,
      'A new table the agent makes for this conversation goes ahead without asking; '
      'tables that already existed do not.');
  else
    v_required := true;
    v_reason   := 'existing_table_needs_a_person';
    v_why      := coalesce(v_why,
      'That table already existed in this organization, so a person is asked before an '
      'agent changes it.');
  end if;

  return jsonb_build_object(
    'setting',           v_setting,
    'raw',               v_raw,
    'approval_required', v_required,
    'own_table',         v_own,
    'reason',            v_reason,
    'why',               v_why,
    'how_to_change',     c_how
  );
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agent_table_claim(p_organization uuid, p_table uuid, p_conversation uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_organization is null or p_table is null then
    raise exception 'agent_table_claim: both an organization and a table are required'
      using errcode = 'null_value_not_allowed';
  end if;
  -- THE CALLER'S OWN ACCESS DECIDES, not the definer's. Without this, a signed-in
  -- person could stamp any table in any organization as "the agent's own" and buy
  -- itself the exemption — which would make the knob decorative.
  if not iam.has_org_access(p_organization) then
    raise exception 'agent_table_claim: you are not a member of that organization'
      using errcode = 'insufficient_privilege';
  end if;
  insert into custom.agent_table_origin (
    organization_id, table_id, conversation_id, created_by
  )
  values (p_organization, p_table, p_conversation, auth.uid())
  on conflict (organization_id, table_id) do nothing;
end;
$function$;
