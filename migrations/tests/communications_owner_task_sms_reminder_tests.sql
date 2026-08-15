begin;

select set_config(
  'request.jwt.claim.sub',
  (
    select p.user_id::text
    from communication.sms_notification_preferences p
    where p.assistant_destination_id is not null
      and p.assistant_program_key = 'ai_matrx_owner_beta'
      and p.deleted_at is null
    order by p.created_at
    limit 1
  ),
  true
);

do $$
declare
  caller uuid := auth.uid();
  preference communication.sms_notification_preferences%rowtype;
  task_id uuid;
  other_task_id uuid;
  consent_id uuid;
  inbound_sid text := 'SMrollbackownertaskreminder';
  queued record;
  duplicate_result record;
  blocked record;
  notification communication.sms_notifications%rowtype;
  outbound communication.sms_messages%rowtype;
  offer platform.assists%rowtype;
  inbound_id uuid;
  candidate_id uuid;
  admission text;
  recovered record;
begin
  if caller is null then
    raise exception 'Test requires one explicitly bound SMS preference';
  end if;

  select p.* into strict preference
  from communication.sms_notification_preferences p
  where p.user_id = caller
    and p.assistant_program_key = 'ai_matrx_owner_beta'
    and p.deleted_at is null;

  select c.id into strict consent_id
  from communication.sms_consent c
  where c.user_id = caller
    and c.organization_id = preference.organization_id
    and c.phone_number = preference.phone_number
    and c.consent_type = 'transactional'
    and c.deleted_at is null;

  update communication.sms_notification_preferences p
  set sms_enabled = true,
      task_notifications = true,
      quiet_hours_enabled = false,
      max_messages_per_hour = 1000,
      max_messages_per_day = 1000,
      preferred_agent_id = null,
      preferred_agent_version_id = null
  where p.id = preference.id;
  update communication.sms_phone_numbers d
  set assistant_enabled = false
  where d.id = preference.assistant_destination_id;
  update communication.sms_conversations c
  set agent_id = null,
      canonical_agent_version_id = null
  where c.provider_account_id = (
      select d.provider_account_id
      from communication.sms_phone_numbers d
      where d.id = preference.assistant_destination_id
    )
    and c.destination_identity_id = preference.assistant_destination_id
    and c.external_phone_number = preference.phone_number
    and c.program_key = preference.assistant_program_key
    and c.deleted_at is null;
  update communication.sms_consent c
  set status = 'opted_in'
  where c.id = consent_id;

  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id, recurrence_rule
  ) values (
    'P1 rollback reminder proof', 'incomplete', preference.organization_id,
    caller, caller, null
  ) returning id into task_id;

  select * into strict queued
  from communication.enqueue_my_task_sms_reminder(
    task_id,
    'ai_matrx_owner_beta'
  );
  if queued.outcome <> 'queued'
    or queued.notification_id is null
    or queued.outbound_message_id is null
    or queued.assist_id is null
    or queued.sms_conversation_id is null
    or queued.blocked_reason is not null
    or queued.duplicate then
    raise exception 'Expected one queued reminder, got %', row_to_json(queued);
  end if;

  select n.* into strict notification
  from communication.sms_notifications n
  where n.id = queued.notification_id;
  select m.* into strict outbound
  from communication.sms_messages m
  where m.id = queued.outbound_message_id;
  select a.* into strict offer
  from platform.assists a
  where a.id = queued.assist_id;

  if notification.message_id <> outbound.id
    or notification.status <> 'pending'
    or notification.reference_type <> 'task'
    or notification.reference_id <> task_id::text
    or notification.metadata ->> 'assist_id' <> offer.id::text then
    raise exception 'Notification did not link exact message/offer/task';
  end if;
  if outbound.status <> 'queued'
    or outbound.sent_by_type <> 'notification'
    or outbound.conversation_id <> queued.sms_conversation_id
    or outbound.body not like 'AI Matrx:%Reply DONE%' then
    raise exception 'Outbound row is not a branded durable DONE reminder';
  end if;
  if offer.source_key <> 'notifications.task.sms_reply'
    or offer.user_id <> caller
    or offer.organization_id <> preference.organization_id
    or offer.entity_type <> 'task'
    or offer.entity_id <> task_id
    or offer.action ->> 'kind' <> 'navigate'
    or offer.metadata #>> '{sms_reply_offer,allowed_aliases,0}' <> 'DONE'
    or offer.metadata #>> '{sms_reply_offer,operation,kind}' <> 'task.complete'
    or offer.metadata #>> '{sms_reply_offer,target_entity_id}' <> task_id::text
    or offer.metadata #>> '{sms_reply_offer,outbound_sms_message_id}' <> outbound.id::text then
    raise exception 'Assist does not carry the exact correlated DONE offer';
  end if;

  select * into strict duplicate_result
  from communication.enqueue_my_task_sms_reminder(
    task_id,
    'ai_matrx_owner_beta'
  );
  if duplicate_result.outcome <> 'duplicate'
    or not duplicate_result.duplicate
    or duplicate_result.notification_id <> notification.id
    or duplicate_result.outbound_message_id <> outbound.id
    or duplicate_result.assist_id <> offer.id then
    raise exception 'Reminder event dedupe did not return the canonical rows';
  end if;

  insert into communication.sms_messages (
    organization_id,
    conversation_id,
    provider,
    provider_account_id,
    direction,
    from_number,
    to_number,
    body,
    status,
    sent_by_type,
    ai_processed,
    ai_processing_status,
    error_code,
    twilio_sid,
    idempotency_key,
    lease_expires_at,
    processing_worker_id
  ) values (
    outbound.organization_id,
    outbound.conversation_id,
    outbound.provider,
    outbound.provider_account_id,
    'inbound',
    outbound.to_number,
    outbound.from_number,
    ' DONE ',
    'received',
    'user',
    false,
    'skipped',
    'sms_command_offer_unverified',
    inbound_sid,
    concat(outbound.provider, ':inbound:', outbound.provider_account_id, ':', inbound_sid),
    null,
    null
  ) returning id into inbound_id;

  select communication.admit_pending_sms_command_turn(inbound_id)
  into strict admission;
  if admission <> 'admitted' or not exists (
    select 1 from communication.sms_messages m
    where m.id = inbound_id
      and m.ai_processing_status = 'pending'
      and not m.ai_processed
      and m.error_code is null
  ) then
    raise exception 'Exact DONE offer was not atomically admitted';
  end if;

  select * into strict recovered
  from communication.claim_pending_sms_command_turns(
    'rollback-command-worker', 10, 900
  )
  where inbound_message_id = inbound_id;
  if recovered.sms_conversation_id <> outbound.conversation_id
    or recovered.text <> ' DONE '
    or recovered.user_id <> caller
    or recovered.organization_id <> preference.organization_id
    or recovered.agent_id is not null then
    raise exception 'Fresh DONE was not claimed without an assistant binding';
  end if;

  update communication.sms_messages m
  set lease_expires_at = now() - interval '1 minute',
      processing_worker_id = 'dead-test-worker'
  where m.id = inbound_id;

  select * into strict recovered
  from communication.claim_recoverable_sms_command_turns(
    'rollback-recovery-worker', 10, 900
  )
  where inbound_message_id = inbound_id;
  if recovered.sms_conversation_id <> outbound.conversation_id
    or recovered.text <> ' DONE '
    or recovered.user_id <> caller
    or recovered.organization_id <> preference.organization_id
    or recovered.agent_id is not null then
    raise exception 'Inbound DONE did not recover without an assistant binding';
  end if;

  update platform.assists a
  set deleted_at = now()
  where a.id = offer.id;
  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, error_code, twilio_sid, idempotency_key
  ) values (
    outbound.organization_id, outbound.conversation_id, outbound.provider,
    outbound.provider_account_id, 'inbound', outbound.to_number,
    outbound.from_number, 'DONE', 'received', 'user', true, 'skipped',
    'sms_command_offer_unverified', 'SMrollbackdonezerooffer',
    concat(outbound.provider, ':inbound:', outbound.provider_account_id, ':SMrollbackdonezerooffer')
  ) returning id into candidate_id;
  select communication.admit_pending_sms_command_turn(candidate_id) into strict admission;
  if admission <> 'refused' or exists (
    select 1 from communication.sms_messages m
    where m.id = candidate_id and m.ai_processing_status = 'pending'
  ) then
    raise exception 'DONE without an offer remained pending';
  end if;

  update platform.assists a
  set deleted_at = null,
      metadata = jsonb_set(a.metadata, '{sms_reply_offer,target_entity_id}', '"not-a-uuid"')
  where a.id = offer.id;
  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, error_code, twilio_sid, idempotency_key
  ) values (
    outbound.organization_id, outbound.conversation_id, outbound.provider,
    outbound.provider_account_id, 'inbound', outbound.to_number,
    outbound.from_number, 'DONE', 'received', 'user', true, 'skipped',
    'sms_command_offer_unverified', 'SMrollbackdonemalformed',
    concat(outbound.provider, ':inbound:', outbound.provider_account_id, ':SMrollbackdonemalformed')
  ) returning id into candidate_id;
  select communication.admit_pending_sms_command_turn(candidate_id) into strict admission;
  if admission <> 'refused' or exists (
    select 1 from communication.sms_messages m
    where m.id = candidate_id and m.ai_processing_status = 'pending'
  ) then
    raise exception 'DONE with malformed offer remained pending';
  end if;

  update platform.assists a
  set metadata = offer.metadata
  where a.id = offer.id;
  insert into platform.assists (
    user_id, organization_id, created_by, source_kind, source_key,
    title, body, action, surface_name, entity_type, entity_id, dedupe_key,
    expires_at, priority, evidence, metadata, visibility
  ) select
    a.user_id, a.organization_id, a.created_by, a.source_kind, a.source_key,
    'Ambiguous rollback offer', a.body, a.action, a.surface_name,
    a.entity_type, a.entity_id, a.dedupe_key || ':duplicate', a.expires_at,
    a.priority, a.evidence, a.metadata, a.visibility
  from platform.assists a
  where a.id = offer.id;
  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, error_code, twilio_sid, idempotency_key
  ) values (
    outbound.organization_id, outbound.conversation_id, outbound.provider,
    outbound.provider_account_id, 'inbound', outbound.to_number,
    outbound.from_number, 'DONE', 'received', 'user', true, 'skipped',
    'sms_command_offer_unverified', 'SMrollbackdoneambiguous',
    concat(outbound.provider, ':inbound:', outbound.provider_account_id, ':SMrollbackdoneambiguous')
  ) returning id into candidate_id;
  select communication.admit_pending_sms_command_turn(candidate_id) into strict admission;
  if admission <> 'refused' or exists (
    select 1 from communication.sms_messages m
    where m.id = candidate_id and m.ai_processing_status = 'pending'
  ) then
    raise exception 'DONE with ambiguous offers remained pending';
  end if;

  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, twilio_sid, idempotency_key
  ) values (
    outbound.organization_id, outbound.conversation_id, outbound.provider,
    outbound.provider_account_id, 'inbound', outbound.to_number,
    outbound.from_number, 'hello agent', 'received', 'user', false, 'pending',
    'SMrollbackgenericnoagent',
    concat(outbound.provider, ':inbound:', outbound.provider_account_id, ':SMrollbackgenericnoagent')
  ) returning id into other_task_id;
  if exists (
    select 1
    from communication.claim_pending_sms_command_turns('rollback-command-worker', 10, 900)
    where inbound_message_id = other_task_id
  ) then
    raise exception 'Generic text crossed the exact command claim';
  end if;
  if exists (
    select 1
    from communication.claim_pending_sms_agent_turns('rollback-agent-worker', 10, 900)
    where inbound_message_id = other_task_id
  ) then
    raise exception 'Generic text without an assistant binding was claimed';
  end if;

  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id, recurrence_rule
  ) values (
    'P1 recurring refusal', 'incomplete', preference.organization_id,
    caller, caller, 'FREQ=DAILY'
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.outcome <> 'blocked'
    or blocked.blocked_reason <> 'recurring_task_unsupported'
    or blocked.outbound_message_id is not null
    or blocked.assist_id is not null then
    raise exception 'Recurring task did not fail closed';
  end if;

  update communication.sms_notification_preferences p
  set task_notifications = false
  where p.id = preference.id;
  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id
  ) values (
    'P1 opt-in refusal', 'incomplete', preference.organization_id, caller, caller
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.blocked_reason <> 'task_notifications_disabled' then
    raise exception 'Task-notification opt-in was not enforced';
  end if;

  update communication.sms_notification_preferences p
  set task_notifications = true,
      quiet_hours_enabled = true,
      timezone = 'UTC',
      quiet_hours_start = ((now() at time zone 'UTC') - interval '1 hour')::time,
      quiet_hours_end = ((now() at time zone 'UTC') + interval '1 hour')::time
  where p.id = preference.id;
  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id
  ) values (
    'P1 quiet-hours refusal', 'incomplete', preference.organization_id, caller, caller
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.blocked_reason <> 'quiet_hours' then
    raise exception 'Quiet hours were not enforced';
  end if;

  update communication.sms_notification_preferences p
  set quiet_hours_enabled = false,
      max_messages_per_hour = 0
  where p.id = preference.id;
  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id
  ) values (
    'P1 rate refusal', 'incomplete', preference.organization_id, caller, caller
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.blocked_reason <> 'hourly_rate_limit' then
    raise exception 'Hourly rate cap was not enforced';
  end if;

  update communication.sms_notification_preferences p
  set max_messages_per_hour = 1000
  where p.id = preference.id;
  update communication.sms_consent c
  set status = 'opted_out'
  where c.id = consent_id;
  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id
  ) values (
    'P1 consent refusal', 'incomplete', preference.organization_id, caller, caller
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.blocked_reason <> 'consent_not_opted_in' then
    raise exception 'Transactional consent was not enforced';
  end if;

  update communication.sms_consent c
  set status = 'opted_in'
  where c.id = consent_id;
  insert into platform.assists (
    user_id, organization_id, created_by, source_kind, source_key,
    title, action, status, dedupe_key, suppressed_until, visibility
  ) values (
    caller, preference.organization_id, caller, 'deterministic',
    'notifications.task.sms_reply', 'Rollback source suppression',
    jsonb_build_object('kind', 'navigate', 'href', '/tasks'),
    'pending', 'rollback:notifications.task.sms_reply:suppression',
    'infinity', 'personal'
  );
  insert into workspace.tasks (
    title, status, organization_id, created_by, assignee_id
  ) values (
    'P1 source refusal', 'incomplete', preference.organization_id, caller, caller
  ) returning id into other_task_id;
  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    other_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.blocked_reason <> 'notification_source_suppressed' then
    raise exception 'Assist producer suppression was not enforced';
  end if;
end;
$$;

rollback;
