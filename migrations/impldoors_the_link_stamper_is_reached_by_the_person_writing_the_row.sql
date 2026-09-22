-- THE LINK STAMPER IS REACHED BY THE PERSON WRITING THE ROW — `check:impl-doors:strict` D16a.
--
-- ════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS WRONG, measured live on db.matrxserver.com 2026-09-22 (lane GATES-2)
-- ════════════════════════════════════════════════════════════════════════════════════
-- Two `platform.client_callable_door` rows declare `signed_in_callers = false` and carry a
-- `non_client_lane` sentence reading "server_only", while `authenticated` holds a live
-- EXECUTE grant on the function:
--
--   platform.link_carries_its_organization(text, uuid)
--   platform.action_link_carries_its_organization(jsonb, uuid)
--
-- D16a's instruction is to fix WHICHEVER SIDE IS WRONG. Here it is the sentence, and the
-- reason is the shape of the call rather than anyone's intent: BOTH functions are SECURITY
-- INVOKER and both are called from SECURITY INVOKER BEFORE triggers that fire on tables a
-- signed-in person writes —
--
--   communication._notification_link_names_its_organization()  on communication.notification
--   communication._dm_action_names_its_organization()          on communication.dm_messages
--   platform._assist_action_names_its_organization()           on platform.assists
--
-- An invoker trigger runs AS THE WRITER, so the writer needs EXECUTE. Revoking it would not
-- make the function server-only; it would make every one of those inserts fail with
-- `42501 permission denied for function link_carries_its_organization` — the exact defect
-- D18 exists to catch, manufactured on purpose. So the grant is CORRECT and the register is
-- what is out of date: the sibling introspection helpers (`link_trigger_is_attached`,
-- `notice_link_trigger_is_attached`) really are server-only and lose their grant in
-- impldoors_the_server_only_helpers_hold_no_client_grant.sql; these two never were.
--
-- WHY NO GATE IS NAMED, stated rather than left as a hole: both functions are pure text over
-- their arguments plus the knob register — they read no row a caller could be refused, write
-- nothing, take no id they could be made to leak, and hold no elevated privilege (SECURITY
-- INVOKER, so a caller gains nothing by reaching them). The thing they protect is the
-- ORGANIZATION ON THE LINK, and that is enforced on the way OUT, in the trigger that stamps
-- it. `anonymous_callers` stays false and `anon` holds no grant, which D13 re-checks live.
--
-- NO `-- based-on:` LINE, DELIBERATELY: this file replaces no function body. It corrects two
-- rows in platform.client_callable_door. Rows updated: 2. Rows written: 0. Rows deleted: 0.

update platform.client_callable_door
   set signed_in_callers = true,
       non_client_lane   = null,
       reason = 'SIGNED-IN LANE. THE ONE rule that puts the employer on a link '
         || '(platform.link_carries_its_organization) and on an action payload '
         || '(platform.action_link_carries_its_organization). It is reached as the person '
         || 'writing the row: the BEFORE triggers on communication.notification, '
         || 'communication.dm_messages and platform.assists are SECURITY INVOKER and run as '
         || 'the writer, so a signed-in caller needs EXECUTE or the insert fails 42501. No '
         || 'gate is named because there is nothing to gate: pure text over the arguments '
         || 'plus the knob register, SECURITY INVOKER, no row read, no row written, no '
         || 'elevated privilege, no id it could be made to reveal. Corrected 2026-09-22 '
         || '(GATES-2, D16a) from a non_client_lane sentence that said "server_only" while '
         || 'the live grant said otherwise; its server-only siblings link_trigger_is_attached '
         || 'and notice_link_trigger_is_attached lost their grant in the same session.'
 where schema_name = 'platform'
   and function_name in ('link_carries_its_organization', 'action_link_carries_its_organization');

do $$
declare
  v_bad text;
begin
  select string_agg(schema_name || '.' || function_name, ', ') into v_bad
    from platform.client_callable_door d
   where d.schema_name = 'platform'
     and d.function_name in ('link_carries_its_organization', 'action_link_carries_its_organization')
     and (d.signed_in_callers is not true or d.non_client_lane is not null or d.anonymous_callers);
  if v_bad is not null then
    raise exception 'impldoors: the link stamper rows did not take the correction: %', v_bad;
  end if;

  -- The declaration is only true while the grant is: assert both directions, the way D16a does.
  select string_agg(d.schema_name || '.' || d.function_name, ', ') into v_bad
    from platform.client_callable_door d
    join pg_proc p on p.proname = d.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = d.schema_name
   where d.schema_name = 'platform'
     and d.function_name in ('link_carries_its_organization', 'action_link_carries_its_organization')
     and (has_function_privilege('authenticated', p.oid, 'execute') is not true
          or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'impldoors: the live grant does not match the corrected declaration: %', v_bad;
  end if;

  raise notice 'impldoors: 2 link stamper door rows now declare the signed-in lane they actually serve';
end $$;
