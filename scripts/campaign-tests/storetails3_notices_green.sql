-- LANE STORE-TAILS-3 — THE STORE'S NOTICES ARE REGISTERED, AND A PERSON CAN SWITCH EACH OFF PER CHANNEL.
--
-- THE USE CASE. The Birchwood owner (admin@admin.com) is reminded when an approval has waited in
-- her inbox, in the app and by email. She keeps the app reminder and turns the email off; later
-- she turns the app reminder off too, and a colleague's mention of her on the Kitchen record is
-- switched off the same way. Every one of those is a setting she makes once, per kind of notice
-- and per channel, and the store obeys it.
--
-- WHAT MAKES IT FAIL (RED before storetails3_the_store_s_notices_can_be_switched_off.sql): the
-- store's events have no registry row (N1); an email notice is written with no address, so it
-- can only fail (N2); her switch is not asked — the email is written after she turned it off
-- (N3), the app notice after she turned that off (N4), the mention likewise (N5).

\set ON_ERROR_STOP on
\timing off
\set suite 'storetails3_notices_green.sql'
\set requires 'function:custom.agg_deliver|relation:communication.notification_event_type'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_kitchen uuid; v_rooms uuid; v_id uuid; v_row record; v_n int; v_keys text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_kitchen from st3 where k = 'Kitchen';
  select v into v_rooms from st3 where k = 'rooms';
  perform set_config('app.actor_system', 'campaign-test/storetails3-notices', true);

  -- N1. the store's events are in the registry
  select count(*), string_agg(event_key, ', ' order by event_key) into v_n, v_keys
    from communication.notification_event_type
   where deleted_at is null and enabled
     and event_key in ('records.changed', 'pipeline.stage_entered', 'custom.form.response', 'custom.booking.made',
                       'custom.capture.arrived', 'custom.inbox.reminder', 'custom.inbox.snooze_ended',
                       'custom.signature.signed', 'custom.signature.declined', 'custom.signature.reminder',
                       'custom.comment.mention');
  if v_n <> 11 then raise exception 'N1: % of the 11 store events are registered: %', v_n, v_keys; end if;
  if (select default_channels from communication.notification_event_type where event_key = 'custom.inbox.reminder')
       is distinct from '{"email": true, "in_app": true}'::jsonb then
    raise exception 'N1: the inbox reminder is not on by default in the app and by email';
  end if;
  raise notice 'N1 PASS — all 11 store events registered; the inbox reminder defaults ON in the app and by email';

  -- N2. with nothing switched off: the app notice, and an email with an address waiting to be worded
  v_id := custom.agg_deliver(v_org, null, v_kitchen, 'in_app', c_admin, 'custom.inbox.reminder',
            'Still waiting on you: Kitchen', 'Kitchen has waited three days for your approval.', '{}'::jsonb, 'st3-n2');
  if v_id is null then raise exception 'N2: the app reminder was not written'; end if;
  v_id := custom.agg_deliver(v_org, null, v_kitchen, 'email', c_admin, 'custom.inbox.reminder',
            'Still waiting on you: Kitchen', 'Kitchen has waited three days for your approval.', '{}'::jsonb, 'st3-n2');
  select * into v_row from communication.notification where id = v_id;
  if v_row.id is null or not ((v_row.status = 'render_pending' and v_row.to_address is not null)
                              or (v_row.status = 'skipped' and v_row.error_code is not null)) then
    raise exception 'N2: the email reminder is % with address % (want render_pending with an address, or a named skip)', v_row.status, v_row.to_address;
  end if;
  if v_row.deep_link is distinct from '/o/' || v_kitchen::text or v_row.payload -> 'notice' ->> 'subject' <> 'Still waiting on you: Kitchen' then
    raise exception 'N2: the email carries link % and notice % (want /o/<Kitchen> and its words)', v_row.deep_link, v_row.payload -> 'notice';
  end if;
  raise notice 'N2 PASS — app reminder written; email reminder % (address %), linked to Kitchen, words in payload.notice',
    v_row.status, case when v_row.to_address is null then 'none' else 'resolved' end;

  -- N3. she turns the EMAIL reminder off: the app one still comes, the email does not
  insert into communication.notification_preference (user_id, event_key, channel, enabled, organization_id)
  values (c_admin, 'custom.inbox.reminder', 'email', false, v_org);
  if custom.agg_deliver(v_org, null, v_kitchen, 'email', c_admin, 'custom.inbox.reminder',
       'Still waiting on you: Kitchen', 'Kitchen has waited four days.', '{}'::jsonb, 'st3-n3') is not null then
    raise exception 'N3: an email reminder was written after she switched email reminders off';
  end if;
  if custom.agg_deliver(v_org, null, v_kitchen, 'in_app', c_admin, 'custom.inbox.reminder',
       'Still waiting on you: Kitchen', 'Kitchen has waited four days.', '{}'::jsonb, 'st3-n3') is null then
    raise exception 'N3: switching email off also stopped the app reminder';
  end if;
  raise notice 'N3 PASS — email reminders off: no email, the app reminder still comes';

  -- N4. she turns the APP reminder off too
  insert into communication.notification_preference (user_id, event_key, channel, enabled, organization_id)
  values (c_admin, 'custom.inbox.reminder', 'in_app', false, v_org);
  if custom.agg_deliver(v_org, null, v_kitchen, 'in_app', c_admin, 'custom.inbox.reminder',
       'Still waiting on you: Kitchen', 'Kitchen has waited five days.', '{}'::jsonb, 'st3-n4') is not null then
    raise exception 'N4: an app reminder was written after she switched app reminders off';
  end if;
  -- … and another kind of notice is untouched by that switch
  if custom.agg_deliver(v_org, null, v_kitchen, 'in_app', c_admin, 'custom.form.response',
       'New response: Room walk-through', 'Somebody answered Room walk-through.', '{}'::jsonb, 'st3-n4') is null then
    raise exception 'N4: switching reminders off stopped a form-response notice';
  end if;
  raise notice 'N4 PASS — app reminders off: none written; a form response still arrives';

  -- N5. a mention, switched off in the app
  insert into communication.notification_preference (user_id, event_key, channel, enabled, organization_id)
  values (c_admin, 'custom.comment.mention', 'in_app', false, v_org);
  if custom.comment_mention_deliver(v_org, v_kitchen, v_rooms, gen_random_uuid(), c_admin,
       'Dana Whitfield', 'Kitchen', 'Can you look at the cabinet quote?') is not null then
    raise exception 'N5: a mention was written after she switched mentions off in the app';
  end if;
  raise notice 'N5 PASS — mentions off in the app: not written';
  raise notice 'storetails3_notices_green.sql: ALL PASS (N1-N5)';
end
$t$;

rollback;
