-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.booking_notify(uuid, uuid, uuid, uuid, text, text) d652e269820a384caeb288223a793231af59866c8ee8c44a415b5fa7d31cae70
--
-- LANE BOOKING — DEFECT 4: AN APPOINTMENT WAS MOVED AND CANCELLED IN SILENCE.
--
-- Measured on the main database, 2026-09-20. A consult was booked, moved and cancelled
-- within four minutes. The owner got exactly ONE notification — *"New response: Book a
-- 30-minute consult"* — and nothing about the move or the cancellation. Both
-- `custom.booking_notify` calls RAN and both returned a notification id: the id of the
-- message the BOOKING had already produced.
--
-- THE CAUSE IS DOOR-18's DEDUPE KEY. `custom.agg_deliver` keys a delivery on
-- `(rule, record, day)`, which is exactly right for the thing it was built for — replaying
-- the outbox must not send the same message twice — and wrong for two DIFFERENT things
-- happening to one record on one day. Rule, record and day cannot tell a booking from its
-- cancellation.
--
-- THE FIX IS ALREADY IN THE DOOR, put there by a peer lane while this one was measuring
-- the defect: `custom.agg_deliver` now takes `p_dedupe_suffix`, which it folds into the
-- key. So this file changes NOTHING shared — it passes what happened as the suffix, and
-- a booking made, moved and cancelled on one day becomes three messages while a replayed
-- outbox event, which carries the same suffix, is still one.
--
-- (This lane had written its own change to `custom.agg_deliver`'s key and threw it away on
-- finding the peer's argument live. Two lanes fixing one shared door two ways is how a
-- door ends up with two mechanisms and no owner.)

create or replace function custom.booking_notify(p_organization_id uuid, p_form_id uuid, p_record_id uuid,
                                      p_submission_id uuid, p_event text, p_when text)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
  s   record;
  v_subject text;
  v_body    text;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found or v_f.notify_rule_id is null then
    return null;
  end if;
  if p_event = 'cancelled' then
    v_subject := format('Cancelled: %s', coalesce(v_f.title, 'an appointment'));
    v_body := format('An appointment booked through %s was cancelled. It was %s, and that time is free again.',
                     coalesce(v_f.title, 'your booking page'), p_when);
  else
    v_subject := format('Moved: %s', coalesce(v_f.title, 'an appointment'));
    v_body := format('An appointment booked through %s was moved. It is now %s, and the old time is free again.',
                     coalesce(v_f.title, 'your booking page'), p_when);
  end if;

  -- THE SAME READER custom.form_notify and custom.agg_subscription_fire use, so a booking
  -- page's notify Rule is an ordinary subscription: the person can see it and switch it
  -- off in the same place as every other one.
  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where rule_id = v_f.notify_rule_id loop
    if s.recipient_user_id is null then
      continue;
    end if;
    return custom.agg_deliver(
      p_organization_id, s.rule_id, p_record_id, s.channel, s.recipient_user_id, s.event_key,
      v_subject, v_body,
      jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug, 'table_id', v_f.table_id,
                         'submission_id', p_submission_id, 'source', 'booking',
                         'event', p_event),
      -- A DIFFERENT EVENT IS A DIFFERENT MESSAGE. See this file's header.
      p_event);
  end loop;
  return null;
end;
$fn$;
