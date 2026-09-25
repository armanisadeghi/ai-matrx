-- chair-step: the INVERSE of storetails3_the_store_s_notices_can_be_switched_off.sql. Puts
--   `custom.agg_deliver`, `custom.inbox_remind_tick` and `custom.comment_mention_deliver` back to
--   the exact bodies that file was written against. The eleven registry rows STAY: aidream's
--   declarations own them and its reconcile would put them straight back; a person's preference
--   rows are theirs.
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, text) 3dc8d308c985f09d48dde3c8341418525777b005f92642fc699f487a8d68eba2
-- based-on: custom.inbox_remind_tick() e546142f8b379d387c98f59eeba211e30e36ea237efd2704ab56085aac519aa9
-- based-on: custom.comment_mention_deliver(uuid, uuid, uuid, uuid, uuid, text, text, text) b072b613795f25eaa067f0d9844f86c35c5b7f5c2f74599c18a4fbb907448b2f

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.agg_deliver(p_organization_id uuid, p_rule_id uuid, p_record_id uuid, p_channel text, p_recipient_user_id uuid, p_event_key text, p_subject text, p_body text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_suffix text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id  uuid;
  v_key text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');

  v_key := format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
                  coalesce(nullif(btrim(p_dedupe_suffix), ''),
                           to_char(now() at time zone 'utc', 'YYYY-MM-DD')));

  -- `communication.notification` IS the notification system: channel, recipient, dedupe key,
  -- retry counter, lease, worker. Writing a delivery anywhere else would mean a second sender,
  -- a second retry policy and a second place a message can get stuck.
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, visibility)
  values
    (p_organization_id, p_event_key, p_channel, p_recipient_user_id, 'user',
     v_key, p_subject, p_body,
     coalesce(p_payload, '{}'::jsonb) ||
       jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id),
     'custom.record', p_record_id, 'personal'::platform.visibility)
  -- IDEMPOTENT AS A CONSTRAINT, not as an intention. The dedupe key is UNIQUE, so a replayed
  -- outbox event does not raise 23505 and it does not send twice: it does nothing and returns
  -- the message that already exists. Anything else would make "replay the outbox" a thing an
  -- operator is afraid to do, which defeats the outbox.
  -- The index is PARTIAL (`where dedupe_key is not null`), so the inference clause must
  -- carry the same predicate or PostgreSQL refuses to match it (42P10).
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    select n.id into v_id from communication.notification n
     where n.organization_id = p_organization_id and n.dedupe_key = v_key;
  end if;
  return v_id;
end;
$function$;

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
    -- AN ARCHIVED ORGANIZATION IS NEVER REMINDED: nobody works there any more, and its leftover
    -- asks would otherwise nag everybody who ever belonged to it (54 such reminders were measured
    -- on production, in 14 archived organizations, before the first run of the tick).
    join iam.organizations g on g.id = c.organization_id and g.archived_at is null
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

CREATE OR REPLACE FUNCTION custom.comment_mention_deliver(p_organization_id uuid, p_record_id uuid, p_table_id uuid, p_comment_id uuid, p_recipient uuid, p_author_name text, p_record_title text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
  values
    (p_organization_id, 'custom.comment.mention', 'in_app', p_recipient, 'user',
     format('custom.mention:%s:%s', p_comment_id, p_recipient),
     format('%s mentioned you on %s', coalesce(p_author_name, 'Somebody'),
            coalesce(nullif(btrim(coalesce(p_record_title, '')), ''), 'a record')),
     -- The comment itself, trimmed to a line a person reads in a list. The whole thing is
     -- one click away and this store never keeps a second copy of it.
     left(btrim(coalesce(p_body, '')), 280),
     jsonb_build_object('comment_id', p_comment_id, 'record_id', p_record_id,
                        'table_id', p_table_id, 'source', 'comment_mention'),
     'custom.record', p_record_id,
     case when p_table_id is null then null
          else format('/data-v2/%s?record=%s&comment=%s', p_table_id, p_record_id, p_comment_id)
     end,
     'personal'::platform.visibility)
  -- IDEMPOTENT AS A CONSTRAINT. The key is UNIQUE, so replaying a write does not send twice.
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$function$;
