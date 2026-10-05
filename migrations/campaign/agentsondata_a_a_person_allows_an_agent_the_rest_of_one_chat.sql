-- lane: AGENTS-ON-DATA
-- chair-step: the REVOKEs only close the two NEW objects to direct client access (the door is the way in); nothing existing loses a grant
-- based-on: custom.agent_change_approval(uuid, uuid, uuid) fa9014b4ba355dff9258d624b9994d681fa76cc63bc339f4d553ca9a2180dd6b
--
-- AGENTS-ON-DATA item 2 — "Approve, and allow the rest in this chat".
-- Walked live 2026-10-04 (Cedar Ridge PT, admin): an agent asked to note a visit needed a column
-- (approval 1) and then the row write (approval 2) on the same table in the same chat. The person
-- now trusts the agent with THAT table for THAT conversation from the approval card; the
-- organization's setting is unchanged everywhere else.
--   custom.agent_table_trust                    (organization, table, conversation) trusted by a person
--   custom.agent_change_trust(org, approval)    the door: anyone who may decide that approval trusts the
--                                               agent with its table for its conversation
--   custom.agent_change_approval                the "own table" exemption also holds for a trusted table

set local statement_timeout = '60s';

create table if not exists custom.agent_table_trust (
  organization_id uuid not null,
  table_id        uuid not null,
  conversation_id uuid not null,
  trusted_by      uuid not null,
  approval_id     uuid,
  trusted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  primary key (organization_id, table_id, conversation_id)
);
alter table custom.agent_table_trust enable row level security;
insert into platform.entity_types (token, schema_name, table_name, label, audit_class, audit_class_reason, table_ref)
values ('custom_agent_table_trust', 'custom', 'agent_table_trust', 'Agent table trust', 'machinery',
        'machinery: read by custom.agent_change_approval, written by custom.agent_change_trust; no app reads it directly',
        'custom.agent_table_trust'::regclass);
revoke all on custom.agent_table_trust from public, anon, authenticated;
comment on table custom.agent_table_trust is
  'A person trusted an agent with one table for one conversation (AGENTS-ON-DATA item 2). Read by custom.agent_change_approval; written only by custom.agent_change_trust.';

create or replace function custom.agent_change_trust(p_organization_id uuid, p_approval_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me    uuid := custom.query_principal();
  v_row   custom.record;
  v_table uuid;
  v_conv  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.agent_change_trust');
  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'Only a person who can decide this change can allow the rest of this chat''s changes to that table.'
      using errcode = '42501';
  end if;
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  v_table := nullif(v_row.data ->> 'subject_table_id', '')::uuid;
  v_conv  := nullif(v_row.data ->> 'conversation_id', '')::uuid;
  if v_table is null or v_conv is null then
    raise exception 'This change did not come from an agent in a chat about one table, so there is nothing further to allow.'
      using errcode = '22023';
  end if;
  insert into custom.agent_table_trust (organization_id, table_id, conversation_id, trusted_by, approval_id)
  values (p_organization_id, v_table, v_conv, coalesce(v_me, '00000000-0000-0000-0000-000000000000'::uuid), p_approval_id)
  on conflict (organization_id, table_id, conversation_id)
  do update set revoked_at = null, trusted_by = excluded.trusted_by, approval_id = excluded.approval_id,
                trusted_at = now();
  return jsonb_build_object('table_id', v_table, 'conversation_id', v_conv);
end
$function$;
insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose, argument_rules)
values ('custom', 'agent_change_trust', 'p_organization_id uuid, p_approval_id uuid',
        'The approval card''s "allow the rest in this chat": only a person who may decide the approval passes (custom.work_approval_may_decide).',
        false, null,
        jsonb_build_object('version', 1,
          'declared_by', 'agentsondata_a_a_person_allows_an_agent_the_rest_of_one_chat.sql',
          'declared_at', '2026-10-04 lane AGENTS-ON-DATA, read from this body',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-10-04 lane AGENTS-ON-DATA — read from this body'),
            'p_approval_id', jsonb_build_object('type', 'uuid',
              'check', 'DERIVED BY ORGANIZATION. custom.work_approval_may_decide reads it only beside organization_id = p_organization_id, and every read here does the same; a row of another organization is refused 42501 exactly like an invented id.',
              'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
              'verified', '2026-10-04 lane AGENTS-ON-DATA — read from this body'))))
on conflict do nothing;
grant execute on function custom.agent_change_trust(uuid, uuid) to authenticated;

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
  -- WHERE IT NAMES IS WHERE THE CONTROL IS (lane HELD-WRITE-TAILS, 2026-09-26). Said
  -- word for word by matrx_records.store.client._HOW_TO_CHANGE; change both together.
  c_how constant text :=
    'An owner or admin changes this in the organization''s Settings, Configuration, under '
    '"Agent changes to this organization''s data": Never ask lets an agent change tables '
    'and write records freely, Ask (the default) lets it change only a table it made in '
    'this conversation, and Always ask asks a person about every change.';
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
    perform custom.assert_client_may_reach(p_organization, 'custom.agent_change_approval');
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
    -- A PERSON TRUSTED THIS AGENT WITH THIS TABLE FOR THIS CONVERSATION (AGENTS-ON-DATA item 2):
    -- on an approval card they chose "Approve, and allow the rest in this chat", so the agent's
    -- next changes to that same table in that same conversation go ahead like its own table's.
    if not v_own and exists (select 1 from custom.agent_table_trust t
                              where t.organization_id = p_organization
                                and t.table_id        = p_table
                                and t.conversation_id = p_conversation
                                and t.revoked_at is null) then
      v_own := true;
      v_why := coalesce(v_why,
        'A person allowed this agent to change this table for the rest of this conversation.');
    end if;
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
