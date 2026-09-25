-- INVERSE of migrations/campaign/uichamp_s5b_each_person_snoozes_and_clears_their_own_inbox_and_is_reminded_once.sql
-- (lane S5-PRIME-2). Puts custom.work_inbox back to its S5-PRIME body and argument list (the
-- bytes below are pg_get_functiondef from production before the file), its door row back to four
-- arguments, and removes the reminder tick, the five inbox_* doors, the one predicate, the clock,
-- the knob and custom.inbox_item_state.
--
-- 🚨 DROPPING custom.inbox_item_state FORGETS EVERY PERSON'S SNOOZES AND CLEARS. Nothing about an
-- approval or a record is lost (none was ever written there), but a snoozed item reappears at once.
-- Reminders already delivered stay in communication.notification.
--
-- ORDER WITH ITS SIBLING: this inverse is meant to run BEFORE (and only on top of) lane S5-PRIME's
-- file. The work_inbox body it restores is S5-PRIME's own and calls custom.work_approval_withdrawal,
-- which exists for as long as S5-PRIME is applied; unwinding both means running this file first,
-- then uichamp_s5_an_archived_thing_takes_its_approvals_out_of_the_inbox_down.sql, which restores
-- the work_inbox that came before it.
-- ground-standing-ok: b
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) ce03303d26a363130d40553ed92023a2f76c31ea04a58e570db11486223b51f7

set lock_timeout = '2s';
set statement_timeout = '300s';

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'custom-inbox-remind-tick';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('inbox_snooze', 'inbox_unsnooze', 'inbox_clear', 'inbox_unclear', 'inbox_counts')
   and declared_by = 'uichamp_s5b_each_person_snoozes_and_clears_their_own_inbox_and_is_reminded_once.sql';

drop function if exists custom.inbox_remind_tick();
drop function if exists custom.inbox_counts(uuid);
drop function if exists custom.inbox_unclear(uuid, uuid);
drop function if exists custom.inbox_clear(uuid, uuid);
drop function if exists custom.inbox_unsnooze(uuid, uuid);
drop function if exists custom.inbox_snooze(uuid, uuid, timestamptz);
drop function if exists custom.work_inbox(uuid, integer, integer, boolean, text);
drop function if exists custom._inbox_items(uuid, uuid, boolean);
drop function if exists custom._inbox_now();
drop table if exists custom.inbox_item_state;


CREATE FUNCTION custom.work_inbox(p_organization_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_at,
           -- THE TABLE IT IS ABOUT: the table itself for a column / records / template, the
           -- record's table otherwise. A new table waits on a home, not a table: none.
           case when coalesce(r.data ->> 'subject_kind', 'record') = 'table'
                  then nullif(r.data ->> 'subject_id', '')::uuid
                when lower(coalesce(r.data #>> '{change,kind}', '')) = 'table_add' then null
                else nullif(r.data ->> 'subject_table_id', '')::uuid end as tid,
           nullif(coalesce(r.data ->> 'decided_by', r.data ->> 'withdrawn_by'), '')::uuid as who
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       -- LANE S5-PRIME: A DECISION ABOUT AN ARCHIVED THING IS NEVER LISTED AS WAITING.
       and (coalesce(r.data ->> 'state', 'pending') <> 'pending'
            or custom.work_approval_withdrawal(p_organization_id, r.data) is null)
       and custom.work_approval_may_decide(p_organization_id, r.id)
  )
  select a.id,
         case when coalesce(a.d ->> 'origin', 'person') = 'agent' then 'proposal' else 'approval' end,
         coalesce(a.d ->> 'origin', 'person'),
         case when (a.d -> 'change') ->> 'kind' = 'field_add'
              then format('Add %s to %s',
                          coalesce(nullif(a.d #>> '{change,field,label}', ''),
                                   nullif(a.d #>> '{change,field,key}', ''), 'a column'),
                          coalesce(a.d ->> 'subject_title', 'a table'))
              else format('Change %s', coalesce(a.d ->> 'subject_title', 'a record')) end,
         nullif(a.d ->> 'subject_id', '')::uuid,
         coalesce(a.d ->> 'subject_kind', 'record'),
         coalesce(nullif(a.d ->> 'note', ''),
                  case when (a.d -> 'change') ->> 'kind' = 'field_add'
                       then 'A new column on a table that already existed.'
                       else (select string_agg(k, ', ' order by k)
                               from jsonb_object_keys(a.d #> '{change,patch}') k) end),
         coalesce(a.d ->> 'state', 'pending'),
         null::timestamptz,
         null::text,
         coalesce(a.d ->> 'state', 'pending') = 'pending',
         nullif(a.d ->> 'requested_by', '')::uuid,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = nullif(a.d ->> 'requested_by', '')::uuid),
         a.created_at,
         a.tid,
         (select coalesce(nullif(t.data ->> 'name', ''), 'a table')
            from custom.record t where t.organization_id = p_organization_id and t.id = a.tid),
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then a.who end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = a.who) end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
              then nullif(a.d ->> 'decided_at', '')::timestamptz end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
              then coalesce(nullif(a.d ->> 'outcome', ''), nullif(a.d ->> 'withdrawn_reason', '')) end
    from approvals a
  union all
  select w.record_id, 'assignment', 'person',
         coalesce(w.title, 'Untitled'), w.record_id, 'record',
         format('%s · %s', coalesce(w.table_name, 'a table'), coalesce(w.status, 'no state')),
         coalesce(w.status, 'open'), w.due_on, w.due_state, true,
         w.assigned_by,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = w.assigned_by),
         w.updated_at,
         w.table_id, w.table_name,
         null::uuid, null::text, null::timestamptz, null::text
    from custom.work_list(p_organization_id, 'mine', coalesce(p_include_decided, false), 500, 0) w
   order by 11 desc, 8 nulls last, 14 desc
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, 200)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$

;
comment on function custom.work_inbox(uuid, integer, integer, boolean) is
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my approval, and the agent''s proposals — the same queue and the same right to approve. Lane S5-PRIME: never lists a pending decision whose subject is archived; every row carries table_id/table_name, and a closed row decided_by/decided_by_name/decided_at/outcome (a withdrawn one names whoever archived the subject).';

update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_limit integer, p_offset integer, p_include_decided boolean',
       identity_argtypes = array['uuid'::regtype, 'integer'::regtype, 'integer'::regtype, 'boolean'::regtype]::oid[],
       reason = 'THE one inbox: what is assigned to me, what is waiting on my approval, and the agent''s proposals, in one ordered list with one row shape. The agent''s wait and a colleague''s request are the same queue with the same right to approve.'
 where schema_name = 'custom' and function_name = 'work_inbox';

delete from platform.feature_knob where feature = 'custom' and key = 'inbox_reminder_after_days';

select custom.reopen_declared_doors();
