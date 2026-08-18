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
  task_organization_id uuid;
  cross_org_task_id uuid;
  ambiguous_task_id uuid;
  consent_id uuid;
  queued record;
  blocked record;
  notification communication.sms_notifications%rowtype;
  outbound communication.sms_messages%rowtype;
  offer platform.assists%rowtype;
  conversation communication.sms_conversations%rowtype;
begin
  if caller is null then
    raise exception 'Test requires one explicitly bound SMS preference';
  end if;

  select p.* into strict preference
  from communication.sms_notification_preferences p
  where p.user_id = caller
    and p.assistant_program_key = 'ai_matrx_owner_beta'
    and p.deleted_at is null;

  select om.organization_id into task_organization_id
  from iam.organization_member om
  join iam.organizations organization on organization.id = om.organization_id
  where om.user_id = caller
    and om.organization_id <> preference.organization_id
  order by (organization.name = 'Titanium') desc, organization.created_at
  limit 1;
  if task_organization_id is null then
    raise exception 'Test requires another organization accessible to the enrolled user';
  end if;

  select consent.id into strict consent_id
  from communication.sms_consent consent
  where consent.user_id = caller
    and consent.organization_id = preference.organization_id
    and consent.phone_number = preference.phone_number
    and consent.consent_type in ('transactional', 'all')
    and consent.deleted_at is null;

  update communication.sms_notification_preferences p
  set sms_enabled = true,
      task_notifications = true,
      quiet_hours_enabled = false,
      max_messages_per_hour = 1000,
      max_messages_per_day = 1000
  where p.id = preference.id;
  update communication.sms_consent consent
  set status = 'opted_in'
  where consent.id = consent_id;
  delete from platform.assists suppressed
  where suppressed.user_id = caller
    and suppressed.source_key = 'notifications.task.sms_reply'
    and suppressed.suppressed_until > now();

  insert into workspace.tasks (
    title,
    status,
    organization_id,
    created_by,
    assignee_id,
    recurrence_rule
  ) values (
    'P1 cross-workspace SMS reminder rollback proof',
    'incomplete',
    task_organization_id,
    caller,
    caller,
    null
  ) returning id into cross_org_task_id;

  if task_organization_id = preference.organization_id
    or not iam.has_access_for(caller, 'task', cross_org_task_id, 'editor') then
    raise exception 'Cross-workspace test task did not preserve exact editor access';
  end if;

  select * into strict queued
  from communication.enqueue_my_task_sms_reminder(
    cross_org_task_id,
    'ai_matrx_owner_beta'
  );
  if queued.outcome <> 'queued'
    or queued.notification_id is null
    or queued.outbound_message_id is null
    or queued.assist_id is null
    or queued.sms_conversation_id is null
    or queued.blocked_reason is not null
    or queued.duplicate then
    raise exception 'Expected one cross-workspace reminder, got %', row_to_json(queued);
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
  select c.* into strict conversation
  from communication.sms_conversations c
  where c.id = queued.sms_conversation_id;

  if notification.organization_id <> preference.organization_id
    or outbound.organization_id <> preference.organization_id
    or offer.organization_id <> preference.organization_id
    or conversation.organization_id <> preference.organization_id then
    raise exception 'A communications row escaped the enrollment organization';
  end if;
  if notification.organization_id = task_organization_id
    or notification.reference_id <> cross_org_task_id::text
    or offer.entity_id <> cross_org_task_id
    or offer.metadata #>> '{sms_reply_offer,operation,kind}' <> 'task.complete'
    or offer.metadata #>> '{sms_reply_offer,target_entity_id}' <> cross_org_task_id::text
    or offer.metadata #>> '{sms_reply_offer,outbound_sms_message_id}' <> outbound.id::text then
    raise exception 'Cross-workspace reminder lost exact task/action correlation';
  end if;

  alter table communication.sms_notification_preferences
    drop constraint sms_notification_preferences_user_id_key;
  insert into communication.sms_notification_preferences (
    user_id,
    phone_number,
    sms_enabled,
    task_notifications,
    quiet_hours_enabled,
    organization_id,
    created_by,
    assistant_destination_id,
    assistant_program_key
  ) select
    p.user_id,
    p.phone_number,
    true,
    true,
    false,
    task_organization_id,
    p.created_by,
    p.assistant_destination_id,
    p.assistant_program_key
  from communication.sms_notification_preferences p
  where p.id = preference.id;

  insert into workspace.tasks (
    title,
    status,
    organization_id,
    created_by,
    assignee_id,
    recurrence_rule
  ) values (
    'P1 ambiguous enrollment rollback refusal',
    'incomplete',
    task_organization_id,
    caller,
    caller,
    null
  ) returning id into ambiguous_task_id;

  select * into strict blocked
  from communication.enqueue_my_task_sms_reminder(
    ambiguous_task_id,
    'ai_matrx_owner_beta'
  );
  if blocked.outcome <> 'blocked'
    or blocked.blocked_reason <> 'sms_program_enrollment_ambiguous'
    or blocked.notification_id is not null
    or blocked.outbound_message_id is not null
    or blocked.assist_id is not null
    or blocked.sms_conversation_id is not null
    or blocked.duplicate then
    raise exception 'Ambiguous enrollment did not fail closed: %', row_to_json(blocked);
  end if;
  if exists (
    select 1
    from communication.sms_notifications n
    where n.reference_type = 'task'
      and n.reference_id = ambiguous_task_id::text
  ) or exists (
    select 1
    from platform.assists a
    where a.entity_type = 'task'
      and a.entity_id = ambiguous_task_id
      and a.source_key = 'notifications.task.sms_reply'
  ) then
    raise exception 'Ambiguous enrollment created durable communications intent';
  end if;
end;
$$;

rollback;
