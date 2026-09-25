-- INVERSE of migrations/campaign/uichamp_s5b2_an_archived_organization_is_never_reminded.sql
-- (lane S5-PRIME-2). Puts custom.inbox_remind_tick() back to the body uichamp_s5b landed (which
-- reminds people about asks in archived organizations) and PAUSES the job, because that body is
-- the defect: an inverse puts the bytes back, it does not start the nagging again.
--
-- chair-step: restores the S5b tick body and leaves pg_cron job custom-inbox-remind-tick inactive.
-- based-on: custom.inbox_remind_tick() f9b1e7134735c4be4d7b9f04f229c8d32268397241cbc0d431cdaf6a057e4930

set lock_timeout = '2s';
set statement_timeout = '120s';

select cron.alter_job(j.jobid, active := false)
  from cron.job j
 where j.jobname = 'custom-inbox-remind-tick';

CREATE OR REPLACE FUNCTION custom.inbox_remind_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_now      timestamptz := custom._inbox_now();
  p          record;
  x          record;
  v_days     integer;
  v_id       uuid;
  v_reminded integer := 0;
  v_back     integer := 0;
begin
  -- WHO MIGHT BE OWED SOMETHING: approvers of a pending ask at least a day old, assignees of open
  -- work untouched for at least a day, and anybody whose snooze has come due. Each is then asked
  -- through custom._inbox_items — the SAME predicate their inbox and badge read — so a reminder
  -- is never about something they cannot see, have cleared, or have snoozed.
  for p in
    select distinct c.organization_id, c.user_id from (
      select a.organization_id, ap.user_id
        from custom.record a
        cross join lateral custom.work_approval_approvers(a.organization_id,
                     nullif(a.data ->> 'subject_id', '')::uuid,
                     nullif(a.data ->> 'approver_id', '')::uuid) ap
       where a.data_class = 'work_approval' and a.deleted_at is null
         and coalesce(a.data ->> 'state', 'pending') = 'pending'
         and a.created_at < v_now - interval '1 day'
      union
      select r.organization_id,
             case when pr.data ->> 'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (pr.data ->> 'user_id')::uuid end
        from custom.record r
        join custom.record pr
          on pr.organization_id = r.organization_id
         and pr.id::text = r.data ->> 'assignee'
         and pr.table_id = custom.person_kernel_id()
       where r.data_class = 'record' and r.deleted_at is null
         and nullif(r.data ->> 'assignee', '') is not null
         and r.updated_at < v_now - interval '1 day'
      union
      select s.organization_id, s.person_id
        from custom.inbox_item_state s
       where s.snoozed_until is not null and s.snoozed_until <= v_now and s.woke_at is null
    ) c
    where c.user_id is not null
  loop
    begin
      v_days := coalesce((platform.knob_resolve('custom', 'inbox_reminder_after_days', p.organization_id) #>> '{}')::integer, 3);
      for x in
        select * from custom._inbox_items(p.organization_id, p.user_id, false) i
         where i.inbox_state = 'waiting'
           and ((i.snoozed_until is not null and i.snoozed_until <= v_now and i.woke_at is null)
                or (i.reminded_at is null and v_days > 0 and i.at < v_now - make_interval(days => v_days)))
      loop
        if x.snoozed_until is not null and x.snoozed_until <= v_now and x.woke_at is null then
          -- A SNOOZE THAT CAME DUE says so once. It counts as the item's reminder.
          v_id := custom.agg_deliver(p.organization_id, null, x.item_id, 'in_app', p.user_id,
                    'custom.inbox.snooze_ended',
                    format('Back in your inbox: %s', x.title),
                    'You snoozed this until now. It is at the top of your inbox.',
                    jsonb_build_object('source', 'inbox', 'reason', 'snooze_ended', 'item_id', x.item_id,
                                       'kind', x.kind, 'table_id', x.table_id, 'snoozed_until', x.snoozed_until),
                    format('inbox:%s:back:%s', p.user_id, extract(epoch from x.snoozed_until)::bigint));
          update custom.inbox_item_state s
             set woke_at = v_now, reminded_at = coalesce(s.reminded_at, v_now), updated_at = now()
           where s.organization_id = p.organization_id and s.person_id = p.user_id and s.item_id = x.item_id;
          v_back := v_back + 1;
        else
          -- ONE REMINDER, EVER, per person and item: the stamp here and the notification's unique
          -- dedupe key both say so.
          v_id := custom.agg_deliver(p.organization_id, null, x.item_id, 'in_app', p.user_id,
                    'custom.inbox.reminder',
                    format('Still waiting on you: %s', x.title),
                    case when x.kind = 'assignment'
                         then format('Assigned to you in %s and untouched for %s days. Open your inbox to finish it, snooze it, or clear it.',
                                     coalesce(x.table_name, 'a table'), v_days)
                         else format('%s asked %s days ago. Approve or decline it in your inbox, or snooze it until you can.',
                                     coalesce(x.requested_by_name, 'Somebody'), v_days) end,
                    jsonb_build_object('source', 'inbox', 'reason', 'reminder', 'item_id', x.item_id,
                                       'kind', x.kind, 'table_id', x.table_id, 'after_days', v_days),
                    format('inbox:%s:reminder', p.user_id));
          insert into custom.inbox_item_state as s (organization_id, person_id, item_id, reminded_at, updated_at)
          values (p.organization_id, p.user_id, x.item_id, v_now, now())
          on conflict (organization_id, person_id, item_id)
          do update set reminded_at = coalesce(s.reminded_at, excluded.reminded_at), updated_at = now();
          v_reminded := v_reminded + 1;
        end if;
        if v_id is not null then
          update communication.notification n
             set deep_link = coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
           where n.id = v_id and n.organization_id = p.organization_id;
        end if;
      end loop;
    exception when others then
      -- ONE ORGANIZATION'S TROUBLE NEVER STOPS EVERYBODY ELSE'S REMINDERS — and it is loud.
      raise warning 'custom.inbox_remind_tick: organization % person %: % (%)', p.organization_id, p.user_id, sqlerrm, sqlstate;
    end;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'back', v_back, 'at', v_now);
end
$function$;
