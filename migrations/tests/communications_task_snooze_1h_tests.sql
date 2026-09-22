-- Exact offered SMS command -> triggerless scheduler -> governed later reminder.
-- Clone only: all fixture changes roll back; no transport worker runs here.
\set suite 'communications_task_snooze_1h_tests.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claim.sub', id::text, true)
from auth.users where email = 'admin@admin.com';

do $$
declare
  actor uuid := auth.uid();
  pref communication.sms_notification_preferences%rowtype;
  task_id uuid;
  outbound communication.sms_messages%rowtype;
  offer platform.assists%rowtype;
  inbound_id uuid;
  event_key text := 'twilio:inbound:clone-snooze:SMclonesnooze1h';
  produced record;
  scheduled record;
  replay record;
  dispatched record;
  token uuid := gen_random_uuid();
  run_id uuid;
  caught boolean;
  cap integer;
  baseline_due timestamptz;
begin
  if actor is null then raise exception 'Admin fixture absent'; end if;
  select * into strict pref from communication.sms_notification_preferences
  where user_id = actor and assistant_program_key = 'ai_matrx_owner_beta'
    and deleted_at is null order by created_at desc limit 1;
  update communication.sms_notification_preferences
    set sms_enabled = true, task_notifications = true,
      quiet_hours_enabled = false, timezone = 'America/Los_Angeles',
      -- A low historical enrollment value must not override an explicit
      -- current channel preference. The immediate+later sends exceed this one.
      max_messages_per_hour = 1, max_messages_per_day = 1000,
      preferred_agent_id = null, preferred_agent_version_id = null
    where id = pref.id;
  -- Retain the admin's actual enrollment; allow only current live-guard test
  -- handsets, never redirect this fixture to a newly invented destination.
  if pref.phone_number not in ('+19497027626', '+19498072145', '+19496662578') then
    raise exception 'Fixture requires a guard-designated admin handset';
  end if;
  insert into communication.notification_channel_preference
    (organization_id, user_id, channel, quiet_hours_enabled, timezone,
     max_per_hour, max_per_day, metadata)
  values (pref.organization_id, actor, 'sms', false, 'UTC', 1000, 1000,
    '{"declared":["quiet_hours","volume_caps"]}'::jsonb)
  on conflict (organization_id, user_id, channel) where deleted_at is null
  do update set quiet_hours_enabled=false, timezone='UTC', max_per_hour=1000,
    max_per_day=1000, metadata=excluded.metadata;
  update communication.sms_phone_numbers set assistant_enabled = false
    where id = pref.assistant_destination_id;
  update communication.sms_consent set status = 'opted_in'
    where user_id = actor and organization_id = pref.organization_id
      and phone_number = pref.phone_number and consent_type = 'transactional'
      and deleted_at is null;
  insert into workspace.tasks
    (title, status, organization_id, created_by, assignee_id, recurrence_rule)
    values ('Clone rollback SNOOZE 1H proof', 'incomplete',
      pref.organization_id, actor, actor, null) returning id into task_id;
  select due_date into baseline_due from workspace.tasks where id = task_id;
  select * into strict produced from communication.enqueue_my_task_sms_reminder(
    task_id, 'ai_matrx_owner_beta');
  if produced.outcome is distinct from 'queued' then
    raise exception 'Fixture producer refused: %', row_to_json(produced);
  end if;
  select * into strict offer from platform.assists where id = produced.assist_id;
  select * into strict outbound from communication.sms_messages
    where id = produced.outbound_message_id;
  if offer.metadata #>> '{sms_reply_offer,operations,SNOOZE 1H,kind}'
      is distinct from 'task.snooze'
    or offer.metadata #>> '{sms_reply_offer,operations,SNOOZE 1H,arguments,delay_seconds}'
      is distinct from '3600' then
    raise exception 'Producer did not make the exact v2 SNOOZE offer';
  end if;
  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, error_code, twilio_sid, idempotency_key
  ) values (
    outbound.organization_id, outbound.conversation_id, outbound.provider,
    outbound.provider_account_id, 'inbound', outbound.to_number,
    outbound.from_number, 'SNOOZE 1H', 'received', 'user', true, 'skipped',
    'sms_command_offer_unverified', 'SMclonesnooze1h',
    concat(outbound.provider, ':inbound:', outbound.provider_account_id,
      ':SMclonesnooze1h')
  ) returning id, idempotency_key into inbound_id, event_key;
  if communication.admit_pending_sms_command_turn(inbound_id)
      is distinct from 'admitted' then
    raise exception 'Exact SNOOZE offer was not admitted';
  end if;
  update platform.assists set status = 'accepted',
    result = jsonb_build_object('kind', 'sms_command_claim', 'version', 1,
      'status', 'executing', 'alias', 'SNOOZE 1H',
      'idempotency_key', event_key, 'sms_message_id', inbound_id)
    where id = offer.id;

  -- Missing required receipt keys must fail closed even when another offer
  -- happens to validate the inbound event.
  update platform.assists set result = result - 'sms_message_id'
    where id = offer.id;
  caught := false;
  begin
    perform * from communication.schedule_task_sms_snooze(
      offer.id, inbound_id, actor, pref.organization_id, event_key);
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'Missing receipt key scheduled a reminder'; end if;
  update platform.assists set result = result ||
    jsonb_build_object('sms_message_id', inbound_id) where id = offer.id;

  update platform.assists set metadata = metadata #- '{sms_reply_offer,operations,SNOOZE 1H}'
    where id = offer.id;
  caught := false;
  begin
    perform * from communication.schedule_task_sms_snooze(
      offer.id, inbound_id, actor, pref.organization_id, event_key);
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'Missing selected operation scheduled a reminder'; end if;
  update platform.assists set metadata = offer.metadata where id = offer.id;

  select * into strict scheduled from communication.schedule_task_sms_snooze(
    offer.id, inbound_id, actor, pref.organization_id, event_key);
  select * into strict replay from communication.schedule_task_sms_snooze(
    offer.id, inbound_id, actor, pref.organization_id, event_key);
  if scheduled.duplicate or replay.duplicate is distinct from true
    or replay.schedule_id is distinct from scheduled.schedule_id
    or replay.due_at is distinct from scheduled.due_at
    or scheduled.due_at < now() + interval '59 minutes'
    or exists (select 1 from scheduler.sch_trigger trig
      where trig.task_id = scheduled.schedule_id) then
    raise exception 'One-hour triggerless schedule/replay contract failed';
  end if;
  select r.id into strict run_id from scheduler.sch_run r
    where r.task_id = scheduled.schedule_id;
  caught := false;
  begin
    perform * from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'Unclaimed future run dispatched'; end if;

  update scheduler.sch_run set due_at = now() - interval '1 minute',
    status = 'running', claim_token = token,
    claim_expires_at = now() + interval '5 minutes',
    metadata = metadata || '{"claim_protocol":"2"}'::jsonb
    where id = run_id;
  caught := false;
  begin
    perform * from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, gen_random_uuid());
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'Wrong scheduler lease dispatched'; end if;
  update scheduler.sch_run set claim_expires_at = now() - interval '1 minute'
    where id = run_id;
  caught := false;
  begin
    perform * from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'Expired scheduler lease dispatched'; end if;
  update scheduler.sch_run set claim_expires_at = now() + interval '5 minutes'
    where id = run_id;
  begin
    update scheduler.sch_task set expires_at=now()-interval '1 minute'
      where id=scheduled.schedule_id;
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'skipped'
      or dispatched.blocked_reason is distinct from 'snooze_expired' then
      raise exception 'Expired in-flight reminder queued: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  -- Each policy branch rolls back to the SAME accepted schedule. ZX001 is a
  -- private test savepoint signal; real SQL/assertion failures remain failures.
  begin
    update communication.notification_channel_preference
      set quiet_hours_enabled=true,
        quiet_hours_start=((now() at time zone 'UTC') - interval '1 hour')::time,
        quiet_hours_end=((now() at time zone 'UTC') + interval '1 hour')::time
      where organization_id=pref.organization_id and user_id=actor
        and channel='sms' and deleted_at is null;
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'deferred'
      or dispatched.blocked_reason is distinct from 'quiet_hours'
      or dispatched.defer_until <= now() then
      raise exception 'Current personal quiet hours did not defer: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    select max_per_hour into strict cap from communication.person_notification_caps(
      actor, pref.organization_id, 'sms');
    insert into communication.sms_messages
      (organization_id, conversation_id, provider, provider_account_id,
       direction, from_number, to_number, body, status, sent_by_type,
       ai_processed, ai_processing_status, idempotency_key)
    select outbound.organization_id, outbound.conversation_id, outbound.provider,
      outbound.provider_account_id, 'outbound', outbound.from_number,
      outbound.to_number, 'Rollback cap fixture', 'sent', 'notification',
      true, 'completed', 'clone-snooze-cap:' || gen_random_uuid()::text
    from generate_series(1, cap);
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'deferred'
      or dispatched.blocked_reason is distinct from 'hourly_rate_limit'
      or dispatched.defer_until <= now() then
      raise exception 'Current personal cap did not defer: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update communication.sms_consent set status='opted_out'
      where phone_number=pref.phone_number and consent_type='transactional'
        and deleted_at is null;
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'skipped'
      or dispatched.blocked_reason is distinct from 'consent_not_opted_in' then
      raise exception 'Opt-out did not stop reminder: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update workspace.tasks set status='completed' where id=task_id;
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'skipped'
      or dispatched.blocked_reason is distinct from 'task_not_actionable' then
      raise exception 'Completed task queued reminder: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
    update workspace.tasks set deleted_at=now() where id=task_id;
    select * into strict dispatched from communication.dispatch_task_sms_snooze(
      scheduled.schedule_id, run_id, token);
    if dispatched.outcome is distinct from 'skipped'
      or dispatched.blocked_reason is distinct from 'task_not_actionable' then
      raise exception 'Removed task queued reminder: %', row_to_json(dispatched);
    end if;
    raise sqlstate 'ZX001';
  exception when sqlstate 'ZX001' then null;
  end;
  select * into strict dispatched from communication.dispatch_task_sms_snooze(
    scheduled.schedule_id, run_id, token);
  if dispatched.outcome is distinct from 'queued' then
    raise exception 'Eligible due run did not queue: %',
      row_to_json(dispatched);
  end if;
  if dispatched.outcome = 'queued' and (
    select count(*) from communication.sms_notifications
    where idempotency_key = 'notification:task_sms_snooze:v1:' || offer.id::text
  ) <> 1 then
    raise exception 'Due run did not use one stable notification event';
  end if;
  -- Same-transaction RPC replay: the SAME lease can read the stable
  -- receipt again after expiry without a second message. This is not a cross-commit
  -- connection-loss proof.
  update scheduler.sch_task set expires_at=now()-interval '1 minute'
    where id=scheduled.schedule_id;
  select * into strict replay from communication.dispatch_task_sms_snooze(
    scheduled.schedule_id, run_id, token);
  if replay.outcome is distinct from 'queued'
    or replay.notification_id is distinct from dispatched.notification_id
    or not (select enabled from scheduler.sch_task where id=scheduled.schedule_id)
    or (select count(*) from communication.sms_notifications
      where idempotency_key='notification:task_sms_snooze:v1:' || offer.id::text) <> 1 then
    raise exception 'Same-transaction dispatch broke stable replay';
  end if;
  if (select due_date from workspace.tasks where id=task_id) is distinct from baseline_due then
    raise exception 'Text snooze changed the task due date';
  end if;
  raise notice 'SNOOZE clone proof: schedule %, due %, dispatch %',
    scheduled.schedule_id, scheduled.due_at, dispatched.outcome;
end;
$$;
rollback;
