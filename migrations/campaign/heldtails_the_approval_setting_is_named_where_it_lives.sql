-- based-on: custom.agent_change_approval(uuid, uuid, uuid) bc292c160af1a9260952665ee3cd471af207d3b8202b0b0208ccfcb1335ac92f
--
-- HELD-WRITE-TAILS — THE APPROVAL SETTING IS NAMED WHERE IT LIVES, AND OFFERED AS FIVE CHOICES.
--
-- 1. custom.agent_change_approval's how_to_change sentence sent people to "the organization's
--    data settings", a page that does not exist, and ended on the knob's key
--    (custom/agent_schema_changes). The setting is the row "Agent changes to this organization's
--    data" on the organization's Settings, Configuration page. Only the c_how constant changes;
--    the rest of the body is the live body, byte for byte.
-- 2. The knob row carries no words for its five values, so Settings, Configuration drew a
--    free-text box for a five-way choice. ui.control = select and ui.options (label + one plain
--    sentence each) give it a select in the registry's own words. value / default_value stay
--    'ask'.
--
-- Not a fingerprinted body: custom.agent_change_approval is outside
-- iam.entity_read_kernel_fingerprint()'s sixteen and outside the provisioner's set.
-- Inverse: migrations/inverse/heldtails_the_approval_setting_is_named_where_it_lives_down.sql.

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
$function$
;


-- THE FIVE CHOICES, IN WORDS (the registry is the one home for a setting's words;
-- lib/scoped-config/choices.ts reads ui.options). The default stays 'ask'; nothing else on
-- the row changes.
update platform.feature_knob
   set ui = coalesce(ui, '{}'::jsonb) || jsonb_build_object(
         'control', 'select',
         'options', jsonb_build_array(
           jsonb_build_object('value', 'never_ask', 'label', 'Never ask',
             'help', 'Agents change tables and write records without asking anyone. The tables'' own rules still apply.'),
           jsonb_build_object('value', 'ask', 'label', 'Ask',
             'help', 'An agent goes ahead on a table it made in the same conversation; a change to any table that already existed waits for a person to approve it.'),
           jsonb_build_object('value', 'always_ask', 'label', 'Always ask',
             'help', 'Every change an agent wants to make waits for a person to approve it, even on a table it just made.'),
           jsonb_build_object('value', 'propose', 'label', 'Ask (older name)',
             'help', 'The older word for Ask. It behaves exactly like Ask.'),
           jsonb_build_object('value', 'auto', 'label', 'Never ask (older name)',
             'help', 'The older word for Never ask. It behaves exactly like Never ask.')))
 where feature = 'custom' and key = 'agent_schema_changes';
