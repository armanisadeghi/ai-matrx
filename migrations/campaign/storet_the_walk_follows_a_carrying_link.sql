-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agent_change_approval(uuid, uuid, uuid) 40cf83d39b86b2a9af08e8623941a32be59d451d0a7558283feda2a8efb884da
-- based-on: custom.agent_table_claim(uuid, uuid, uuid) 052604235a1eaa4229545247a9e6c6084cc6b621b82187c560517204ac56c89b
-- based-on: custom.query_relation_edges(uuid, text, text) 4c0147788f9776088caa92bab23fad8befe14c8b7176172e2da453889da786b3
--
-- STORE-T / T11 + the two doors that decided nothing.
--
-- T11, MEASURED FROM A SIGNED-IN SEAT on 2026-09-20. Company A partners with B and B with A,
-- both links made through `custom.relation_carry`, the door STORE-REL built for exactly this.
-- `custom.query_rollup` from A returns A and nothing else, and the sixth pass measured the
-- same thing as a number: "rolling headcount up from Company A returns 10 - A alone - where
-- the test wants A once and B once. The walk stops at the root."
--
-- WHY. The walk's edge set is `custom.query_relation_edges`, and its WHERE says
-- `a.relation_field_id is not null` - only edges that name a relation FIELD. A carrying link
-- is not one: `custom.relation_carry` writes a `data_class = 'relation'` record and
-- `custom._containment_association` turns it into a row of `platform.associations` with role
-- `references` and NO field, because there is no field - the link IS the relation (REL-6).
-- Measured on the main database: 322 record-to-record edges, and every carrying one of them
-- invisible to the walk. So the relation T11 is about was the one relation the rollup could
-- not follow, and the answer was always the root alone.
--
-- THE FIX IS THE EDGE SET, NOT THE WALK. `custom.query_relation_edges` returns carrying links
-- too, with the flavor they are declared with - `referenced`, which is what
-- `custom.relation_carry` writes and what `platform.relation_flavors()` names - so
-- `custom.query_rollup`, `custom.query_across_homes` and every other door that asks for the
-- organization's edges gets the same answer a person would give. A caller asking for the
-- `owned` flavor still sees only owned links, so nothing that filters gets more than it asked
-- for, and the DISTINCT-by-node group of the walk is what makes "A once and B once" true.
--
-- AND THE TWO DOORS `pnpm check:store-doors-decide` has been naming since lane READ-PERF:
-- `custom.agent_change_approval` and `custom.agent_table_claim` are client-callable, SECURITY
-- DEFINER, take a table id and never reach the one ladder. Worse, measured here:
-- `agent_change_approval` decides its caller with `pg_has_role(current_user, ...)`, and inside
-- a SECURITY DEFINER function `current_user` has ALREADY been rewritten to the definer - which
-- is the owner of `custom.record`. So that arm was TRUE for every caller on earth and the
-- organization test beside it was never reached. `custom.caller_role()` exists for precisely
-- this and says so in its own comment. Both doors now ask the store's own questions: the role
-- the caller actually held, the organization wall, and - when a table is named - whether the
-- caller may know that table at all.

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
    cross join lateral (select case when a.relation_field_id is not null
                                   then platform.relation_declaration(p_organization_id, a.relation_field_id)
                                   -- A carrying link is a `referenced` relation by construction:
                                   -- custom.relation_carry writes kind = 'referenced', carrying,
                                   -- role = 'references', and custom.carrying_rule caps what it
                                   -- conveys at viewer. There is no declaration row to read
                                   -- because there is no field.
                                   else jsonb_build_object('flavor', 'referenced')
                              end as declaration) d
   where a.organization_id = p_organization_id
     and a.deleted_at is null
     -- STORE-T / T11: an edge names a relation FIELD, **or** it is a carrying link, which
     -- has no field because the link itself is the relation (REL-6). Excluding the second
     -- kind was excluding the only relation T11 is about.
     and (a.relation_field_id is not null or a.role = 'references')
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
  -- STORE-T: `custom.caller_role()`, never `current_user`. Inside a SECURITY DEFINER
  -- function current_user has already been rewritten to the definer — the owner of
  -- custom.record — so `pg_has_role(current_user, v_owner, 'member')` was TRUE for every
  -- caller on earth and the organization test beside it was never reached.
  if not (pg_has_role(custom.caller_role(), v_owner, 'member') or iam.has_org_access(p_organization)) then
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

  -- STORE-T: AND THE ROW. A door that takes a table id decides that table on the one ladder
  -- (custom.assert_may_know_table -> custom.assert_client_may_open), so naming a table you
  -- cannot see tells you nothing about it — you get the un-exempt, stricter answer instead.
  if p_table is not null then
    perform custom.assert_may_know_table(p_organization, p_table, 'custom.agent_change_approval');
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
  perform custom.assert_client_may_reach(p_organization, 'custom.agent_table_claim');
  -- STORE-T: AND THE ROW, on the one ladder. Stamping a table as "the agent's own" buys that
  -- table the exemption from the approval knob, so it is a change to what the table MEANS and
  -- it takes the level a change takes — not merely membership of the organization.
  perform custom.assert_client_may_change(p_organization, p_table, 'custom.agent_table_claim',
                                          'editor'::public.permission_level, 'table');
  insert into custom.agent_table_origin (
    organization_id, table_id, conversation_id, created_by
  )
  values (p_organization, p_table, p_conversation, auth.uid())
  on conflict (organization_id, table_id) do nothing;
end;
$function$;
