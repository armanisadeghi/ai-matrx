-- Fix owner task reminders for tasks in any workspace the caller can edit.
-- The caller's one active program enrollment owns every communications row;
-- the task organization remains only task context and never transport tenancy.

-- First canonical actionable notification producer: one authenticated user queues a
-- reminder for one task they can edit. The notification, durable outbound message,
-- and exact DONE offer are committed atomically; Twilio is never called here.

create or replace function communication.enqueue_my_task_sms_reminder(
  p_task_id uuid,
  p_program_key text default 'ai_matrx_owner_beta'
)
returns table (
  outcome text,
  notification_id uuid,
  outbound_message_id uuid,
  assist_id uuid,
  sms_conversation_id uuid,
  blocked_reason text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  task_row workspace.tasks%rowtype;
  preference communication.sms_notification_preferences%rowtype;
  destination communication.sms_phone_numbers%rowtype;
  conversation communication.sms_conversations%rowtype;
  event_key text;
  block_key text;
  block_code text;
  clean_title text;
  reminder_body text;
  local_now timestamp without time zone;
  local_time time without time zone;
  local_day_start timestamptz;
  local_day_end timestamptz;
  hourly_count integer;
  daily_count integer;
  created_notification_id uuid;
  created_message_id uuid;
  created_assist_id uuid;
  existing_notification communication.sms_notifications%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_task_id is null then
    raise exception 'Task is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  select t.* into task_row
  from workspace.tasks t
  where t.id = p_task_id
    and t.deleted_at is null
  for share;
  if not found then
    raise exception 'Task was not found' using errcode = 'P0002';
  end if;
  if not iam.has_access_for(caller, 'task', task_row.id, 'editor') then
    raise exception 'Task is not editable by this user' using errcode = '42501';
  end if;

  event_key := format(
    'notification:task_sms_reminder:v1:%s:%s:%s',
    caller,
    task_row.id,
    task_row.version
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(event_key, 0)
  );

  select n.* into existing_notification
  from communication.sms_notifications n
  where n.idempotency_key = event_key
    and n.deleted_at is null;
  if found then
    return query select
      'duplicate'::text,
      existing_notification.id,
      existing_notification.message_id,
      case
        when pg_catalog.pg_input_is_valid(
          existing_notification.metadata ->> 'assist_id',
          'uuid'
        ) then (existing_notification.metadata ->> 'assist_id')::uuid
        else null::uuid
      end,
      case
        when pg_catalog.pg_input_is_valid(
          existing_notification.metadata ->> 'sms_conversation_id',
          'uuid'
        ) then (existing_notification.metadata ->> 'sms_conversation_id')::uuid
        else null::uuid
      end,
      existing_notification.failure_reason,
      true;
    return;
  end if;

  begin
    select p.* into strict preference
    from communication.sms_notification_preferences p
    where p.user_id = caller
      and p.assistant_program_key = p_program_key
      and p.deleted_at is null
    for share;
  exception
    when no_data_found then
      return query select
        'blocked'::text,
        null::uuid,
        null::uuid,
        null::uuid,
        null::uuid,
        'sms_program_not_enrolled'::text,
        false;
      return;
    when too_many_rows then
      return query select
        'blocked'::text,
        null::uuid,
        null::uuid,
        null::uuid,
        null::uuid,
        'sms_program_enrollment_ambiguous'::text,
        false;
      return;
  end;

  clean_title := left(
    pg_catalog.regexp_replace(btrim(task_row.title), '[[:space:]]+', ' ', 'g'),
    240
  );

  if task_row.recurrence_rule is not null then
    block_code := 'recurring_task_unsupported';
  elsif task_row.status in ('completed', 'cancelled', 'dismissed') then
    block_code := 'task_not_actionable';
  end if;

  if block_code is null then
    if not preference.sms_enabled then
      block_code := 'sms_disabled';
    elsif not preference.task_notifications then
      block_code := 'task_notifications_disabled';
    elsif preference.phone_number is null then
      block_code := 'verified_phone_missing';
    end if;
  end if;

  if block_code is null then
    select d.* into destination
    from communication.sms_phone_numbers d
    where d.id = preference.assistant_destination_id
      and d.program_key = preference.assistant_program_key
      and d.program_key = p_program_key
      and d.is_active
      and d.provider_account_id is not null
      and d.deleted_at is null
    for share;
    if not found then
      block_code := 'destination_not_ready';
    end if;
  end if;

  if block_code is null then
    perform 1
    from communication.sms_consent consent
    where consent.user_id = caller
      and consent.organization_id = preference.organization_id
      and consent.phone_number = preference.phone_number
      and consent.consent_type in ('transactional', 'all')
      and consent.status = 'opted_in'
      and consent.deleted_at is null
    for share;
    if not found then
      block_code := 'consent_not_opted_in';
    end if;
  end if;

  if block_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        format(
          'sms-transport:%s:%s:%s:%s',
          destination.provider_account_id,
          destination.id,
          preference.phone_number,
          destination.program_key
        ),
        0
      )
    );
  end if;

  if block_code is null and exists (
    select 1
    from platform.assists suppressed
    where suppressed.user_id = caller
      and suppressed.source_key = 'notifications.task.sms_reply'
      and suppressed.suppressed_until > now()
      and suppressed.deleted_at is null
  ) then
    block_code := 'notification_source_suppressed';
  end if;

  if block_code is null then
    begin
      local_now := now() at time zone preference.timezone;
    exception
      when invalid_parameter_value then
        block_code := 'invalid_notification_timezone';
    end;
  end if;

  if block_code is null then
    local_time := local_now::time;
    if preference.quiet_hours_enabled and (
      case
        when preference.quiet_hours_start > preference.quiet_hours_end
          then local_time >= preference.quiet_hours_start
            or local_time < preference.quiet_hours_end
        when preference.quiet_hours_start < preference.quiet_hours_end
          then local_time >= preference.quiet_hours_start
            and local_time < preference.quiet_hours_end
        else false
      end
    ) then
      block_code := 'quiet_hours';
    end if;
  end if;

  if block_code is null then
    select count(*) into hourly_count
    from communication.sms_messages m
    where m.organization_id = preference.organization_id
      and m.to_number = preference.phone_number
      and m.direction = 'outbound'
      and m.created_at >= now() - interval '1 hour'
      and m.deleted_at is null;
    if hourly_count >= preference.max_messages_per_hour then
      block_code := 'hourly_rate_limit';
    end if;
  end if;

  if block_code is null then
    local_day_start := pg_catalog.date_trunc('day', local_now)
      at time zone preference.timezone;
    local_day_end := (pg_catalog.date_trunc('day', local_now) + interval '1 day')
      at time zone preference.timezone;
    select count(*) into daily_count
    from communication.sms_messages m
    where m.organization_id = preference.organization_id
      and m.to_number = preference.phone_number
      and m.direction = 'outbound'
      and m.created_at >= local_day_start
      and m.created_at < local_day_end
      and m.deleted_at is null;
    if daily_count >= preference.max_messages_per_day then
      block_code := 'daily_rate_limit';
    end if;
  end if;

  if block_code is not null then
    block_key := format(
      '%s:blocked:%s:%s',
      event_key,
      block_code,
      pg_catalog.to_char(now() at time zone 'UTC', 'YYYYMMDDHH24')
    );
    insert into communication.sms_notifications (
      organization_id,
      user_id,
      notification_type,
      category,
      reference_type,
      reference_id,
      status,
      failure_reason,
      idempotency_key,
      metadata,
      created_by
    ) values (
      preference.organization_id,
      caller,
      'task_due_date',
      'transactional',
      'task',
      task_row.id::text,
      case
        when block_code = 'quiet_hours' then 'blocked_quiet_hours'
        when block_code = 'consent_not_opted_in' then 'blocked_opt_out'
        when block_code in ('hourly_rate_limit', 'daily_rate_limit') then 'blocked_rate_limit'
        else 'skipped'
      end,
      block_code,
      block_key,
      pg_catalog.jsonb_build_object(
        'producer', 'communication.enqueue_my_task_sms_reminder',
        'event_key', event_key,
        'program_key', p_program_key,
        'task_title', clean_title
      ),
      caller
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into created_notification_id;

    if created_notification_id is null then
      select n.id into created_notification_id
      from communication.sms_notifications n
      where n.idempotency_key = block_key;
    end if;

    return query select
      'blocked'::text,
      created_notification_id,
      null::uuid,
      null::uuid,
      null::uuid,
      block_code,
      false;
    return;
  end if;

  select c.* into conversation
  from communication.sms_conversations c
  where c.provider_account_id = destination.provider_account_id
    and c.destination_identity_id = destination.id
    and c.external_phone_number = preference.phone_number
    and c.program_key = destination.program_key
    and c.status = 'active'
    and c.deleted_at is null;

  if not found then
    insert into communication.sms_conversations (
      organization_id,
      user_id,
      external_phone_number,
      our_phone_number,
      conversation_type,
      provider,
      provider_account_id,
      destination_identity_id,
      program_key,
      chat_conversation_id,
      agent_id,
      canonical_agent_version_id,
      identity_status
    ) values (
      preference.organization_id,
      caller,
      preference.phone_number,
      destination.phone_number,
      'notification',
      destination.provider,
      destination.provider_account_id,
      destination.id,
      destination.program_key,
      gen_random_uuid(),
      preference.preferred_agent_id,
      preference.preferred_agent_version_id,
      'resolved'
    ) returning * into conversation;
  end if;

  insert into communication.sms_notifications (
    organization_id,
    user_id,
    notification_type,
    category,
    reference_type,
    reference_id,
    status,
    idempotency_key,
    metadata,
    created_by
  ) values (
    preference.organization_id,
    caller,
    'task_due_date',
    'transactional',
    'task',
    task_row.id::text,
    'pending',
    event_key,
    pg_catalog.jsonb_build_object(
      'producer', 'communication.enqueue_my_task_sms_reminder',
      'program_key', destination.program_key,
      'destination_id', destination.id,
      'sms_conversation_id', conversation.id,
      'task_title', clean_title
    ),
    caller
  )
  returning id into created_notification_id;

  reminder_body := format(
    'AI Matrx: Task reminder — “%s”. Reply DONE to mark it complete.',
    clean_title
  );

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
    sent_by_user_id,
    sent_by_type,
    ai_processed,
    ai_processing_status,
    idempotency_key,
    attempt_count,
    next_attempt_at,
    metadata,
    created_by
  ) values (
    preference.organization_id,
    conversation.id,
    destination.provider,
    destination.provider_account_id,
    'outbound',
    destination.phone_number,
    preference.phone_number,
    reminder_body,
    'queued',
    caller,
    'notification',
    true,
    'completed',
    'outbound:' || event_key,
    0,
    now(),
    pg_catalog.jsonb_build_object(
      'notification_id', created_notification_id,
      'reference_type', 'task',
      'reference_id', task_row.id,
      'program_key', destination.program_key
    ),
    caller
  ) returning id into created_message_id;

  insert into platform.assists (
    user_id,
    organization_id,
    created_by,
    source_kind,
    source_key,
    title,
    body,
    action,
    surface_name,
    entity_type,
    entity_id,
    dedupe_key,
    expires_at,
    priority,
    evidence,
    metadata,
    visibility
  ) values (
    caller,
    preference.organization_id,
    caller,
    'deterministic',
    'notifications.task.sms_reply',
    'Complete task by text',
    clean_title,
    pg_catalog.jsonb_build_object(
      'kind', 'navigate',
      'href', '/tasks/' || task_row.id,
      'label', 'Open task'
    ),
    'matrx-user/tasks',
    'task',
    task_row.id,
    'notifications.task.sms_reply:' || event_key,
    now() + interval '7 days',
    10,
    pg_catalog.jsonb_build_object(
      'kind', 'task',
      'label', clean_title,
      'href', '/tasks/' || task_row.id,
      'ref', task_row.id
    ),
    pg_catalog.jsonb_build_object(
      'sms_reply_offer', pg_catalog.jsonb_build_object(
        'version', 1,
        'allowed_aliases', pg_catalog.jsonb_build_array('DONE'),
        'operation', pg_catalog.jsonb_build_object(
          'kind', 'task.complete',
          'arguments', '{}'::jsonb
        ),
        'target_entity_type', 'task',
        'target_entity_id', task_row.id,
        'outbound_sms_message_id', created_message_id
      )
    ),
    'personal'
  ) returning id into created_assist_id;

  update communication.sms_notifications n
  set message_id = created_message_id,
      metadata = n.metadata || pg_catalog.jsonb_build_object(
        'assist_id', created_assist_id,
        'outbound_sms_message_id', created_message_id
      ),
      updated_by = caller,
      updated_at = now()
  where n.id = created_notification_id;

  return query select
    'queued'::text,
    created_notification_id,
    created_message_id,
    created_assist_id,
    conversation.id,
    null::text,
    false;
end;
$$;

revoke all on function communication.enqueue_my_task_sms_reminder(uuid, text)
  from public, anon;
grant execute on function communication.enqueue_my_task_sms_reminder(uuid, text)
  to authenticated;

comment on function communication.enqueue_my_task_sms_reminder(uuid, text) is
  'Atomically queues one opted-in, quiet-hours/rate-limited non-recurring task reminder and its exact DONE assist offer for the authenticated user.';

