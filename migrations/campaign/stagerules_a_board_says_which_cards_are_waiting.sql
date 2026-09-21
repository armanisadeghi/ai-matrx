-- additive: yes
-- guard: custom/system_enabled
--
-- STAGE-RULES — A BOARD SAYS WHICH CARDS ARE WAITING, IN ONE QUESTION.
--
-- `custom.record_stage_pending` answers for ONE card, which is what a record page needs. A
-- board draws a hundred of them, and asking that door once per card would be a hundred
-- round trips to draw one screen — so the board would not ask at all, and a card that was
-- filed for approval would look exactly like a card nobody ever dragged. A screen never
-- lies, and the cheapest way to keep that true is to make the honest answer cheap.
--
-- It answers ONLY this Table's own cards, ONLY approvals whose change would write this
-- Table's own stage column, and ONLY the ones nobody has decided — over the records this
-- person may see, on the one ladder, exactly like every other read here.
create or replace function custom.pipeline_pending(p_organization_id uuid, p_table_id uuid)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_key text;
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_pending');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_pending');
  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'record_id',    s.id,
           'approval_id',  a.id,
           'to',           a.data #>> array['change', 'patch', v_key],
           'why',          a.data ->> 'note',
           'requested_at', a.data ->> 'requested_at',
           'state',        coalesce(a.data ->> 'state', 'pending')) order by a.created_at), '[]'::jsonb)
    into v_out
    from custom.record a
    join custom.record s
      on s.organization_id = a.organization_id
     and s.id = nullif(a.data ->> 'subject_id', '')::uuid
   where a.organization_id = p_organization_id
     and a.data_class = 'work_approval'
     and a.deleted_at is null
     and coalesce(a.data ->> 'state', 'pending') = 'pending'
     and a.data #> array['change', 'patch', v_key] is not null
     and s.table_id = p_table_id
     and s.deleted_at is null
     -- THE ONE LADDER, on every row. A wait on a card this person cannot see is not their
     -- business, and a badge is a leak like any other read.
     and custom.has_visibility(custom.query_principal(), 'record', s.id, 'viewer'::public.permission_level);
  return v_out;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'pipeline_pending', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/stagerules_a_board_says_which_cards_are_waiting.sql (lane STAGE-RULES)',
       'Which cards on this board are waiting for somebody to approve a move, in ONE question over the records this person may see — so a board can say "waiting" instead of drawing a card that silently did not move.'
  from pg_proc p
 where p.proname = 'pipeline_pending' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'pipeline_pending'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.pipeline_pending(uuid, uuid) to authenticated;
