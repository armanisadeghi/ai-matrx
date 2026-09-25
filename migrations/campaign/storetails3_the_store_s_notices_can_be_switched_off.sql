-- chair-step: a STORE FIX + REGISTRY ROWS (STORE-TAILS-3, the chair's follow-up of 2026-09-24;
--   S5-PRIME-2 found it: the store's reminders were in-app only and nobody could switch them off).
--   INSERTS eleven `communication.notification_event_type` rows (the record store's own notices —
--   exactly the rows aidream's `reconcile_notification_event_types()` creates from the matching
--   declarations in aidream `aidream/services/notifications/declarations.py`, `on conflict do
--   nothing`, so whichever lands first the other finds it there), and REPLACES three bodies, each
--   declared below with the body it was written against: `custom.agg_deliver` (the one store
--   sender), `custom.inbox_remind_tick` and `custom.comment_mention_deliver`. No table, column,
--   trigger, policy or grant is added; no existing notice is rewritten.
--   Inverse: `migrations/inverse/storetails3_the_store_s_notices_can_be_switched_off_down.sql`.
--   Applied directly (owner, 2026-09-24 ~17:30 PT), proven on the dev clone first.
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, text) 4bacb94c38373637343a11084b1f9707b8a94281f151fe82ecffb095d6f31cdc
-- based-on: custom.inbox_remind_tick() f9b1e7134735c4be4d7b9f04f229c8d32268397241cbc0d431cdaf6a057e4930
-- based-on: custom.comment_mention_deliver(uuid, uuid, uuid, uuid, uuid, text, text, text) 052a93ae7dd0f86887ca9c4508170dd3cfde90ce12a33e079cc7a8ee2377ed9c
--
-- WHY. The record store tells people things on its own — a followed table changed, a form was
-- answered, a booking was made, a capture arrived, an item has waited in their inbox, a snooze
-- ran out, a signature moved, they were mentioned, a record reached a pipeline stage — and none
-- of those events had a registry row. So none of them appeared among a person's notification
-- settings, none could be switched off on any channel, the store's sender never asked, and the
-- one email subscription on production failed `missing_recipient_address` because the sender
-- wrote an email row with no address.
--
-- WHAT CHANGES.
--   1. The eleven events are registered — label, description, default channels (in the app, and
--      by email where the store sends email: default ON), templates for the email.
--   2. `custom.agg_deliver` asks the person's switch (the one channel ladder) before it writes a
--      channel, and an email row resolves the address and waits for the render pass, or is a
--      named skip.
--   3. The inbox reminder and the snooze-ended notice go on every channel the person has on.
--   4. A comment mention asks the same switch.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id, visibility)
select v.event_key, v.label, v.description, v.default_channels, v.config, true,
       '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'internal'::platform.visibility
  from (values
  ('records.changed', 'A table you follow changed', 'A record in a Data Table you subscribed to was added or changed.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "A table you follow changed", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.form.response', 'A form was answered', 'Somebody answered a form you are told about.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "A form was answered", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('pipeline.stage_entered', 'A record reached a stage', 'A record in a pipeline you are told about entered one of its stages.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "A record reached a stage", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.booking.made', 'A booking was made', 'Somebody booked a time on a booking page you are told about.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "A booking was made", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.capture.arrived', 'A capture arrived', 'Something was captured into one of your tables (a photo, a reading, a note from the field).', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "A capture arrived", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.inbox.reminder', 'Still waiting on you', 'An approval or an assigned record has waited in your inbox for the organization''s reminder interval.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "Still waiting on you", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.inbox.snooze_ended', 'Back in your inbox', 'Something you snoozed in your inbox is back.', '{"in_app": true, "email": true}'::jsonb, '{"templates": {"email": {"subject": "{{notice.subject}}", "body": "{{notice.body}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because of a setting in one of your tables. Manage notifications: {{link.preferences}}"}, "in_app": {"subject": "Back in your inbox", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.signature.signed', 'A document was signed', 'Somebody signed a document you sent for signature.', '{"in_app": true}'::jsonb, '{"templates": {"in_app": {"subject": "A document was signed", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.signature.declined', 'A signature was declined', 'Somebody declined to sign a document you sent for signature.', '{"in_app": true}'::jsonb, '{"templates": {"in_app": {"subject": "A signature was declined", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.signature.reminder', 'A signature is waiting on you', 'A document is still waiting for your signature.', '{"in_app": true}'::jsonb, '{"templates": {"in_app": {"subject": "A signature is waiting on you", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb),
  ('custom.comment.mention', 'You were mentioned', 'Somebody mentioned you in a comment on a record.', '{"in_app": true}'::jsonb, '{"templates": {"in_app": {"subject": "You were mentioned", "body": "{{notice.body}}"}}, "max_attempts": 5, "retry_base_seconds": 60, "target_kind": "custom.record", "deep_link_template": null, "sensitivity_ceiling": "internal", "mandatory": false, "digestible": true, "quiet_hours_exempt": false, "sms_locked": true, "sender_program_key": null, "routing_mode": "declared_audience", "alert_tier": "informational", "non_user_capable": false, "push_declared": false}'::jsonb)
  ) as v(event_key, label, description, default_channels, config)
on conflict (event_key) do nothing;

CREATE OR REPLACE FUNCTION custom.agg_deliver(p_organization_id uuid, p_rule_id uuid, p_record_id uuid, p_channel text, p_recipient_user_id uuid, p_event_key text, p_subject text, p_body text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_suffix text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_key     text;
  v_chan    text[];
  v_addr    record;
  v_status  text := 'pending';
  v_err     text;
  v_errmsg  text;
  v_link    text;
  v_to      text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');

  -- STORE-TAILS-3: THE PERSON'S OWN SWITCH, ASKED BEFORE A CHANNEL IS WRITTEN. The one channel
  -- ladder — the event's registry row, the organization's override, then this person's own
  -- preference (`hr._notify_channels` → `communication.notification_user_channels`, the ladder
  -- every other producer asks). A channel the person switched off for this kind of notice is
  -- not written at all: a choice they made is not a failure and is not queued.
  if p_recipient_user_id is not null then
    v_chan := hr._notify_channels(p_event_key, p_organization_id, p_recipient_user_id, null);
    if not (coalesce(p_channel, 'in_app') = any (coalesce(v_chan, array['in_app']))) then
      return null;
    end if;
  end if;

  v_key := format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
                  coalesce(nullif(btrim(p_dedupe_suffix), ''),
                           to_char(now() at time zone 'utc', 'YYYY-MM-DD')));

  -- STORE-TAILS-3: AN EMAIL GOES TO AN ADDRESS, AND IS WORDED BY ITS REGISTRY ROW. The in-app
  -- row carries its words and is the delivery; an email row (until today written with no
  -- address, so every one failed `missing_recipient_address`) resolves the person's address
  -- through the one resolver and waits at `render_pending` for the render pass, which words it
  -- from the event's template with `payload.notice` and the record's link. No address is a
  -- named skip, never a silent drop.
  if coalesce(p_channel, 'in_app') <> 'in_app' then
    v_key := v_key || ':' || p_channel;
    v_link := case when p_record_id is not null then '/o/' || p_record_id::text end;
    select * into v_addr
      from communication.resolve_channel_address(p_channel, p_organization_id, 'user',
                                                 p_recipient_user_id, null, null, null)
     limit 1;
    v_to := v_addr.address;
    if v_to is null then
      v_status := 'skipped';
      v_err    := coalesce(v_addr.refusal, 'no_contact_point');
      v_errmsg := format('There is no %s address for this person, so this notice went to their AI Matrx inbox only.', p_channel);
    else
      v_status := 'render_pending';
    end if;
  end if;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind, to_address,
     status, error_code, error_message,
     dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
  values
    (p_organization_id, p_event_key, coalesce(p_channel, 'in_app'), p_recipient_user_id, 'user', v_to,
     v_status, v_err, v_errmsg,
     v_key, p_subject, p_body,
     coalesce(p_payload, '{}'::jsonb) ||
       jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id,
                          'notice', jsonb_build_object('subject', p_subject, 'body', p_body)),
     'custom.record', p_record_id, v_link, 'personal'::platform.visibility)
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
  v_ch       text;                  -- STORE-TAILS-3: the channel being written
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
          -- STORE-TAILS-3: every channel the person has on for this kind of notice (in the app and,
          -- by default, by email); `custom.agg_deliver` asks their switch and writes each one.
          foreach v_ch in array array['in_app', 'email'] loop
            v_id := custom.agg_deliver(p.organization_id, null, x.item_id, v_ch, p.user_id,
                      'custom.inbox.snooze_ended',
                      format('Back in your inbox: %s', x.title),
                      'You snoozed this until now. It is at the top of your inbox.',
                      jsonb_build_object('source', 'inbox', 'reason', 'snooze_ended', 'item_id', x.item_id,
                                         'kind', x.kind, 'table_id', x.table_id, 'snoozed_until', x.snoozed_until),
                      format('inbox:%s:back:%s', p.user_id, extract(epoch from x.snoozed_until)::bigint));
            if v_id is not null then
              update communication.notification n
                 set deep_link = case when v_ch = 'in_app' then coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
                                      else '/o/' || coalesce(x.subject_id, x.item_id)::text end
               where n.id = v_id and n.organization_id = p.organization_id and n.status in ('pending', 'render_pending');
            end if;
          end loop;
          update custom.inbox_item_state s
             set woke_at = v_now, reminded_at = coalesce(s.reminded_at, v_now), updated_at = now()
           where s.organization_id = p.organization_id and s.person_id = p.user_id and s.item_id = x.item_id;
          v_back := v_back + 1;
        else
          -- ONE REMINDER, EVER, per person and item: the stamp here and the notification's unique
          -- dedupe key both say so.
          foreach v_ch in array array['in_app', 'email'] loop
            v_id := custom.agg_deliver(p.organization_id, null, x.item_id, v_ch, p.user_id,
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
            if v_id is not null then
              update communication.notification n
                 set deep_link = case when v_ch = 'in_app' then coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
                                      else '/o/' || coalesce(x.subject_id, x.item_id)::text end
               where n.id = v_id and n.organization_id = p.organization_id and n.status in ('pending', 'render_pending');
            end if;
          end loop;
          insert into custom.inbox_item_state as s (organization_id, person_id, item_id, reminded_at, updated_at)
          values (p.organization_id, p.user_id, x.item_id, v_now, now())
          on conflict (organization_id, person_id, item_id)
          do update set reminded_at = coalesce(s.reminded_at, excluded.reminded_at), updated_at = now();
          v_reminded := v_reminded + 1;
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
  -- STORE-TAILS-3: the person's own switch for this kind of notice (the one channel ladder,
  -- `hr._notify_channels`). Switched off in the app: nothing is written, and the caller counts
  -- them as not told.
  if p_recipient is not null
     and not ('in_app' = any (coalesce(hr._notify_channels('custom.comment.mention', p_organization_id, p_recipient, null), array['in_app']))) then
    return null;
  end if;
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
