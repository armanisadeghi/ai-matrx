-- additive: yes
--   It ADDS ONE new function, `custom.record_table`, its `platform.client_callable_door` row
--   and its GRANT (the row FIRST, then the grant — `platform.enforce_definer_client_grants`
--   fires ON the grant). Nothing existing is replaced, dropped or revoked, so there is no
--   `-- based-on:` line to carry.
--   The inverse is `migrations/inverse/apprvtail_a_record_can_say_which_table_it_is_in_down.sql`.
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE. A file that NAMES production is
--   judged by an allow-list that refuses every GRANT by name, and this file's whole point is a
--   new client door: the declaration row and then the grant, in that order, in one transaction
--   (`platform.enforce_definer_client_grants` fires ON the grant). So it is production-only and
--   deny-list judged, the same judgement lane WORK-DOORS's five door files are under. The OFF
--   switch is not lost by dropping the header: the body's FIRST statement is
--   `custom.assert_store_door(p_organization_id, …)`, which IS custom/system_enabled.
--
-- WHAT WAS BROKEN, MEASURED FROM THE SEAT `authenticated` ON THE MAIN DATABASE, 2026-09-20.
--
-- A RECORD COULD NOT SAY WHICH TABLE IT WAS IN, and the organization's approval question is
-- asked ABOUT A TABLE. `matrx_records.RecordStore.record_read` reads the row's header off
-- `history.record_versions`, which is SECURITY INVOKER and holds NO EXECUTE for
-- `authenticated`; the client catches that refusal and hands back a view whose `table_id` is
-- None — honestly absent, exactly as designed for a header.
--
-- The trouble is who was reading it. `RecordStore.record_propose` resolves a PATCH's table
-- with `(await self.record_read(record_id)).table_id`, so from a real client seat it asked
-- `custom.agent_change_approval` about NO TABLE — and a question about no table is answered
-- `new_table_is_the_agents_own`, which means "go ahead". An agent CHANGING a record in
-- somebody's existing table was therefore never asked about, while ADDING one to the same
-- table waited. That is the defect APPROVAL-FIX closed for the create path and this closes for
-- the patch path; `record_delete` would have inherited it whole.
--
-- SO THE STORE GETS A DOOR FOR THE QUESTION. One uuid in, one uuid out, on the one ladder
-- (`custom.assert_client_may_reach` then `custom.assert_client_may_open` at viewer), behind the
-- OFF switch, and it answers for a DELETED record too — because "may I put this back?" is a
-- question about a record that is, by definition, not here.

create or replace function custom.record_table(p_organization_id uuid, p_record_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_table uuid;
  v_found boolean := false;
begin
  -- THE SWITCH, THEN THE WALL, THEN THE ROW — the store's one order.
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_table',
                                        'viewer'::public.permission_level, 'record');

  -- DELETED ROWS COUNT. A record in the trash still lives in a table, and the question
  -- "should this be put back" is asked about that table.
  select r.table_id, true into v_table, v_found
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not v_found then
    raise exception 'There is no record % in this organization, here or in the trash.', p_record_id
      using errcode = '02000',
            hint = 'The id belongs to another organization or to nothing at all — organizations are hard walls (REC-29).';
  end if;
  return v_table;
end
$function$;

comment on function custom.record_table(uuid, uuid) is
  'Which Table a record lives in, for a record that is here OR in the trash. The one door that answers the question every agent verb has to ask before it changes anything: custom.agent_change_approval is asked about a TABLE.';

-- THE DOOR ROW FIRST, THE GRANT SECOND. `platform.enforce_definer_client_grants` fires ON the
-- GRANT: sixteen grants issued before their rows were revoked inside the same transaction and
-- the run still reported SUCCESS (lane WORK-DOORS, 2026-09-20).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'record_table',
        'p_organization_id uuid, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id: the tenant, checked by custom.assert_client_may_reach — a caller who is not a member of it is refused 42501 before anything is read; NULL is refused by the same call. p_record_id: a record of THAT organization, checked by custom.assert_client_may_open at viewer on the one ladder, so the answer is only given to somebody who may open the record; a NULL or an id from another organization is refused 02000 with the same sentence, which is what stops the door being used to probe for ids. The answer is one uuid — the Table the record lives in — and nothing of the record''s contents.',
        'apprvtail_a_record_can_say_which_table_it_is_in.sql',
        true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.record_table(uuid, uuid) to authenticated;
