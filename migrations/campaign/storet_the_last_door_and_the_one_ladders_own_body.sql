-- chair-step: it replaces two bodies whose own subject is not the store switch, so neither
--   names `custom/system_enabled` as a literal string and the static guard check — a literal
--   search that cannot follow a call — sees no knob. `custom.agent_change_approval` reaches the
--   switch through `custom.assert_may_know_table` -> `custom.assert_client_may_open` ->
--   `custom.assert_client_may_reach`, and `custom.doors_not_on_one_ladder` is a CENSUS: it
--   reads the catalogue and writes nothing, so a switch over it would be meaningless. Writing a
--   redundant knob read into either would be a mention rather than a switch. Otherwise additive
--   in effect: both carry their `-- based-on:` lines, nothing is dropped, granted or revoked,
--   and no row of any feature is deleted or rewritten.
-- based-on: custom.agent_change_approval(uuid, uuid, uuid) 364e6c41ea6621834189a2fb4468e667362ae25fb950c5b7f092833c39174b41
-- based-on: custom.doors_not_on_one_ladder() 4edbdc5d79ec03b2dedc67d120f30e06b6f3d640db0a16fb54e39692a0ff786a
--
-- STORE-T — THE LAST DOOR ROUTED, AND THE CENSUS TOLD WHAT THE ONE LADDER IS MADE OF NOW.
--
-- 1. `custom.agent_change_approval` now asks the wall by name before it decides a table.
--    `custom.assert_may_know_table` was already added to it; the census that finds unrouted
--    doors STRIPS `--` comments and matches the CODE, on purpose, so a door that reaches the
--    ladder through one call still has to say one of the four names itself. It says the one it
--    means: the organization wall, before the table question, which is the order every other
--    door in this store uses.
--
-- 2. `custom.doors_not_on_one_ladder` excuses "the one function itself, its level form, its set
--    form and this census". Lane SHARED-ONLY split the one function's first three arms out of
--    `custom.has_visibility` into `custom.reaches_directly` an hour ago — its own comment says
--    it: "This is not a second ladder: custom.has_visibility has no copy of these arms any
--    more, it calls this." So the census was reporting the ladder's own body as a rival ladder.
--    It is named in the same list as the other forms of the one function, for the same reason
--    and in the same words. Nothing else is excused, and the census still goes red for any
--    OTHER function in this store that asks `iam.has_access_for`, `iam.effective_level` or
--    `public.has_permission_for` for itself — which is proven red-then-green by
--    `scripts/campaign-tests/storet_red.sql`.

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
$function$;

CREATE OR REPLACE FUNCTION custom.doors_not_on_one_ladder()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'decides a row with a ladder of its own (iam.has_access_for / iam.effective_level / '
         'public.has_permission_for) instead of custom.has_visibility, so reading and writing '
         'can disagree again'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     -- THE CODE, NOT THE PROSE: `--` comments are stripped before the body is read, so a
     -- sentence explaining the old ladder can never fail this census and a sentence
     -- promising the new one can never pass it.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(iam\.has_access_for|iam\.effective_level|public\.has_permission_for)'
     -- The one function itself, its level form, its set form and this census.
     and p.proname not in ('has_visibility', 'has_visibility_at', 'effective_level',
                           'visible_record_ids', 'doors_not_on_one_ladder',
                           -- `custom.reaches_directly` IS the one function: lane SHARED-ONLY
                           -- moved arms 1-3 of custom.has_visibility into it, and
                           -- custom.has_visibility has no copy of them any more, it calls this.
                           -- Excusing it is naming a form of the one function, exactly as the
                           -- four above are, and not excusing a rival ladder.
                           'reaches_directly')
     -- AND NOTHING ELSE. `custom._field_write_door` was excused here until 2026-09-19,
     -- when lane REACH routed it onto `custom.effective_level`. There is no excused
     -- object in this store any more, so there is no list to keep one on.
   order by 1;
$function$;
