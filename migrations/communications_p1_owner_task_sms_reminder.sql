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
    select p.* into preference
    from communication.sms_notification_preferences p
    where p.user_id = caller
      and p.organization_id = task_row.organization_id
      and p.assistant_program_key = p_program_key
      and p.deleted_at is null
    for share;
    if not found then
      block_code := 'sms_program_not_enrolled';
    elsif not preference.sms_enabled then
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
      task_row.organization_id,
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

create or replace function communication.has_exact_sms_task_done_offer(
  p_inbound_message_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select 1 = (
        select count(*)
        from platform.assists a
        cross join lateral (
          select a.metadata -> 'sms_reply_offer' as offer
        ) parsed
        join communication.sms_messages outbound
          on outbound.id = case
            when jsonb_typeof(parsed.offer -> 'outbound_sms_message_id') = 'string'
             and pg_input_is_valid(
               parsed.offer ->> 'outbound_sms_message_id', 'uuid'
             )
            then (parsed.offer ->> 'outbound_sms_message_id')::uuid
            else null
          end
         and outbound.direction = 'outbound'
         and outbound.conversation_id = m.conversation_id
         and outbound.organization_id = m.organization_id
         and outbound.deleted_at is null
        where a.user_id = c.user_id
          and a.organization_id = m.organization_id
          and a.source_key = 'notifications.task.sms_reply'
          and a.deleted_at is null
          and jsonb_typeof(a.metadata) = 'object'
          and jsonb_typeof(parsed.offer) = 'object'
          and not exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(parsed.offer) = 'object'
                then parsed.offer else '{}'::jsonb end
            ) offer_key
            where offer_key not in (
              'version', 'allowed_aliases', 'operation', 'target_entity_type',
              'target_entity_id', 'outbound_sms_message_id'
            )
          )
          and parsed.offer ?& array[
            'version', 'allowed_aliases', 'operation', 'target_entity_type',
            'target_entity_id', 'outbound_sms_message_id'
          ]
          and jsonb_typeof(parsed.offer -> 'version') = 'number'
          and parsed.offer -> 'version' = '1'::jsonb
          and jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
          and jsonb_array_length(
            case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
              then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
          ) between 1 and 10
          and not exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
            where jsonb_typeof(alias_value) <> 'string'
               or nullif(btrim(alias_value #>> '{}'), '') is null
          )
          and (
            select count(*) = count(distinct regexp_replace(
              upper(btrim(alias_value #>> '{}')), '[[:space:]]+', ' ', 'g'
            ))
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
          )
          and exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(parsed.offer -> 'allowed_aliases') = 'array'
                then parsed.offer -> 'allowed_aliases' else '[]'::jsonb end
            ) alias_value
            where jsonb_typeof(alias_value) = 'string'
              and regexp_replace(
                upper(btrim(alias_value #>> '{}')), '[[:space:]]+', ' ', 'g'
              ) = 'DONE'
          )
          and jsonb_typeof(parsed.offer -> 'operation') = 'object'
          and (parsed.offer -> 'operation') ?& array['kind', 'arguments']
          and not exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(parsed.offer -> 'operation') = 'object'
                then parsed.offer -> 'operation' else '{}'::jsonb end
            ) operation_key
            where operation_key not in ('kind', 'arguments')
          )
          and jsonb_typeof(parsed.offer -> 'operation' -> 'kind') = 'string'
          and parsed.offer -> 'operation' ->> 'kind' = 'task.complete'
          and parsed.offer -> 'operation' -> 'arguments' = '{}'::jsonb
          and jsonb_typeof(parsed.offer -> 'target_entity_type') = 'string'
          and parsed.offer ->> 'target_entity_type' = 'task'
          and a.entity_type = parsed.offer ->> 'target_entity_type'
          and jsonb_typeof(parsed.offer -> 'target_entity_id') = 'string'
          and pg_input_is_valid(parsed.offer ->> 'target_entity_id', 'uuid')
          and a.entity_id = case
            when jsonb_typeof(parsed.offer -> 'target_entity_id') = 'string'
             and pg_input_is_valid(parsed.offer ->> 'target_entity_id', 'uuid')
            then (parsed.offer ->> 'target_entity_id')::uuid
            else null
          end
          and jsonb_typeof(parsed.offer -> 'outbound_sms_message_id') = 'string'
          and pg_input_is_valid(parsed.offer ->> 'outbound_sms_message_id', 'uuid')
          and (
            a.status = 'pending'
            or (
              a.status = 'accepted'
              and jsonb_typeof(a.result) = 'object'
              and a.result ->> 'idempotency_key' = m.idempotency_key
              and a.result ->> 'sms_message_id' = m.id::text
              and regexp_replace(
                upper(btrim(coalesce(a.result ->> 'alias', ''))),
                '[[:space:]]+', ' ', 'g'
              ) = 'DONE'
              and (
                (
                  a.result ->> 'kind' = 'sms_command_claim'
                  and a.result -> 'version' = '1'::jsonb
                  and a.result ->> 'status' = 'executing'
                )
                or (
                  a.result ->> 'kind' = 'sms_command_receipt'
                  and a.result -> 'version' = '1'::jsonb
                  and a.result ->> 'actor_user_id' = c.user_id::text
                )
              )
            )
          )
      
    )
    from communication.sms_messages m
    join communication.sms_conversations c on c.id = m.conversation_id
    where m.id = p_inbound_message_id
  ), false);
$$;

revoke all on function communication.has_exact_sms_task_done_offer(uuid)
  from public, anon, authenticated;
grant execute on function communication.has_exact_sms_task_done_offer(uuid)
  to service_role;

comment on function communication.has_exact_sms_task_done_offer(uuid) is
  'Returns true only when one inbound SMS is correlated to exactly one valid v1 DONE task offer and replay-safe assist state.';

create or replace function communication.admit_pending_sms_command_turn(
  p_inbound_message_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbound communication.sms_messages%rowtype;
begin
  select m.* into inbound
  from communication.sms_messages m
  where m.id = p_inbound_message_id
    and m.direction = 'inbound'
    and m.status = 'received'
    and m.deleted_at is null
  for update;
  if not found then
    return 'not_found';
  end if;

  if inbound.ai_processing_status <> 'skipped'
    or inbound.error_code <> 'sms_command_offer_unverified'
    or regexp_replace(upper(btrim(coalesce(inbound.body, ''))), '[[:space:]]+', ' ', 'g') <> 'DONE'
    or nullif(btrim(inbound.provider), '') is null
    or nullif(btrim(inbound.provider_account_id), '') is null
    or nullif(btrim(inbound.twilio_sid), '') is null
    or inbound.idempotency_key <> concat(
      inbound.provider, ':inbound:', inbound.provider_account_id, ':', inbound.twilio_sid
    ) then
    return 'refused';
  end if;

  if not communication.has_exact_sms_task_done_offer(inbound.id) then
    update communication.sms_messages m
    set ai_processed = true,
        error_code = 'sms_command_offer_not_resolved',
        updated_at = now()
    where m.id = inbound.id;
    return 'refused';
  end if;

  update communication.sms_messages m
  set ai_processing_status = 'pending',
      ai_processed = false,
      error_code = null,
      next_attempt_at = now(),
      updated_at = now()
  where m.id = inbound.id;
  return 'admitted';
end;
$$;

revoke all on function communication.admit_pending_sms_command_turn(uuid)
  from public, anon, authenticated;
grant execute on function communication.admit_pending_sms_command_turn(uuid)
  to service_role;

comment on function communication.admit_pending_sms_command_turn(uuid) is
  'Atomically admits a skipped exact DONE candidate only after one correlated task offer is proven; unmatched, ambiguous, and malformed offers remain terminally skipped.';


drop function if exists communication.claim_pending_sms_command_turns(text, integer, integer);
create function communication.claim_pending_sms_command_turns(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  inbound_message_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  chat_conversation_is_new boolean,
  user_id uuid,
  organization_id uuid,
  agent_id uuid,
  agent_version_id uuid,
  text text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select m.id
    from communication.sms_messages m
    join communication.sms_conversations c on c.id = m.conversation_id
    join communication.sms_phone_numbers p on p.id = c.destination_identity_id
    where m.direction = 'inbound'
      and m.status = 'received'
      and m.deleted_at is null
      and m.ai_processing_status = 'pending'
      and m.next_attempt_at <= now()
      and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') = 'DONE'
      and nullif(btrim(m.idempotency_key), '') is not null
      and nullif(btrim(m.provider), '') is not null
      and nullif(btrim(m.provider_account_id), '') is not null
      and nullif(btrim(m.twilio_sid), '') is not null
      and m.idempotency_key = concat(
        m.provider, ':inbound:', m.provider_account_id, ':', m.twilio_sid
      )
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and p.is_active
      and p.deleted_at is null
      and communication.has_exact_sms_task_done_offer(m.id)
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set ai_processing_status = 'processing',
        claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
        ),
        processing_worker_id = p_worker_id,
        outcome_uncertain_at = null,
        updated_at = now()
    from candidates
    where m.id = candidates.id
      and m.ai_processing_status = 'pending'
      and m.next_attempt_at <= now()
    returning m.*
  )
  select
    claimed.id,
    c.id,
    c.chat_conversation_id,
    not exists (
      select 1
      from chat.conversation chat_row
      where chat_row.id = c.chat_conversation_id
    ),
    c.user_id,
    c.organization_id,
    c.agent_id,
    c.canonical_agent_version_id,
    claimed.body
  from claimed
  join communication.sms_conversations c on c.id = claimed.conversation_id
  order by claimed.created_at;
end;
$$;

revoke execute on function communication.claim_pending_sms_command_turns(text, integer, integer)
  from public, anon, authenticated;
grant execute on function communication.claim_pending_sms_command_turns(text, integer, integer)
  to service_role;

comment on function communication.claim_pending_sms_command_turns(text, integer, integer) is
  'Claims only fresh pending DONE turns with one exact correlated task offer; command execution does not require or fabricate an assistant-agent binding.';


drop function if exists communication.claim_recoverable_sms_command_turns(text, integer, integer);
create function communication.claim_recoverable_sms_command_turns(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 900
)
returns table (
  inbound_message_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  chat_conversation_is_new boolean,
  user_id uuid,
  organization_id uuid,
  agent_id uuid,
  agent_version_id uuid,
  text text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select m.id
    from communication.sms_messages m
    join communication.sms_conversations c on c.id = m.conversation_id
    join communication.sms_phone_numbers p on p.id = c.destination_identity_id
    where m.direction = 'inbound'
      and m.status = 'received'
      and m.deleted_at is null
      and m.ai_processing_status = 'processing'
      and m.lease_expires_at is not null
      and m.lease_expires_at <= now()
      and nullif(btrim(m.processing_worker_id), '') is not null
      and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') = 'DONE'
      and nullif(btrim(m.idempotency_key), '') is not null
      and nullif(btrim(m.provider), '') is not null
      and nullif(btrim(m.provider_account_id), '') is not null
      and nullif(btrim(m.twilio_sid), '') is not null
      and m.idempotency_key = concat(
        m.provider, ':inbound:', m.provider_account_id, ':', m.twilio_sid
      )
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and p.is_active
      and p.deleted_at is null
      and communication.has_exact_sms_task_done_offer(m.id)
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 900), 900))
        ),
        processing_worker_id = p_worker_id,
        outcome_uncertain_at = null,
        updated_at = now()
    from candidates
    where m.id = candidates.id
      and m.ai_processing_status = 'processing'
      and m.lease_expires_at <= now()
    returning m.*
  )
  select
    claimed.id,
    c.id,
    c.chat_conversation_id,
    not exists (
      select 1
      from chat.conversation chat_row
      where chat_row.id = c.chat_conversation_id
    ),
    c.user_id,
    c.organization_id,
    c.agent_id,
    c.canonical_agent_version_id,
    claimed.body
  from claimed
  join communication.sms_conversations c on c.id = claimed.conversation_id
  order by claimed.created_at;
end;
$$;

revoke execute on function communication.claim_recoverable_sms_command_turns(text, integer, integer)
  from public, anon, authenticated;
grant execute on function communication.claim_recoverable_sms_command_turns(text, integer, integer)
  to service_role;

comment on function communication.claim_recoverable_sms_command_turns(text, integer, integer) is
  'Reclaims only expired processing DONE turns with one exact, correlated, replay-safe SMS task offer; command execution does not require an assistant-agent binding. Ordinary agent claims never reclaim leases.';
