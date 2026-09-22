-- Offered SNOOZE 1H uses the durable scheduler and exact task reminder producer.
-- Keep the cross-organization task/transport boundary from communications_p1_cross_org_task_sms_reminder.sql.
-- based-on: communication.enqueue_my_task_sms_reminder(uuid, text) a0c862db16039174517709205d0bd3d84354be612e5f15328c6378f58d17a6ec
-- based-on: communication.admit_pending_sms_command_turn(uuid) 0696f23f82690a8b4f895d7086789bcc3d4f5f273b6e01932bf7bd2bdad806e0

create or replace function communication.task_sms_person_timing_gate(
  p_user_id uuid, p_organization_id uuid, p_phone text,
  p_now timestamptz default now()
) returns table (reason text, defer_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text;
  v_windows jsonb;
  v_window record;
  v_local_now timestamp;
  v_probe timestamp;
  v_end timestamp;
  v_start_time time;
  v_end_time time;
  v_hour_cap integer;
  v_day_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_i integer;
begin
  select w.timezone, w.quiet_windows into v_tz, v_windows
  from communication.person_notification_window(
    p_user_id, p_organization_id, 'sms'
  ) w;
  if v_tz is null then
    return query select 'invalid_notification_timezone'::text, null::timestamptz;
    return;
  end if;
  begin
    v_local_now := p_now at time zone v_tz;
  exception when invalid_parameter_value then
    return query select 'invalid_notification_timezone'::text, null::timestamptz;
    return;
  end;
  v_probe := v_local_now;
  for v_i in 1..4 loop
    for v_window in select value from jsonb_array_elements(
      coalesce(v_windows, '[]'::jsonb)
    ) loop
      v_start_time := (v_window.value ->> 'start')::time;
      v_end_time := (v_window.value ->> 'end')::time;
      if v_start_time = v_end_time then continue; end if;
      if (case when v_start_time > v_end_time
        then v_probe::time >= v_start_time or v_probe::time < v_end_time
        else v_probe::time >= v_start_time and v_probe::time < v_end_time
      end) then
        if v_start_time > v_end_time and v_probe::time >= v_start_time then
          v_end := date_trunc('day', v_probe) + interval '1 day' + v_end_time;
        else
          v_end := date_trunc('day', v_probe) + v_end_time;
        end if;
        if v_end > v_probe then v_probe := v_end; end if;
      end if;
    end loop;
    exit when v_probe = v_local_now;
  end loop;
  if v_probe > v_local_now then
    return query select 'quiet_hours'::text, v_probe at time zone v_tz;
    return;
  end if;
  select max_per_hour, max_per_day into v_hour_cap, v_day_cap
  from communication.person_notification_caps(
    p_user_id, p_organization_id, 'sms'
  );
  if v_hour_cap is null or v_day_cap is null then
    return query select 'notification_caps_unavailable'::text, null::timestamptz;
    return;
  end if;
  select count(*) into v_count from communication.sms_messages m
  where m.organization_id = p_organization_id and m.to_number = p_phone
    and m.direction = 'outbound' and m.deleted_at is null
    and m.created_at >= p_now - interval '1 hour';
  if v_count >= v_hour_cap then
    return query select 'hourly_rate_limit'::text, p_now + interval '1 hour';
    return;
  end if;
  v_day_start := date_trunc('day', v_local_now) at time zone v_tz;
  v_day_end := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_tz;
  select count(*) into v_count from communication.sms_messages m
  where m.organization_id = p_organization_id and m.to_number = p_phone
    and m.direction = 'outbound' and m.deleted_at is null
    and m.created_at >= v_day_start and m.created_at < v_day_end;
  if v_count >= v_day_cap then
    return query select 'daily_rate_limit'::text, v_day_end;
    return;
  end if;
  return query select null::text, null::timestamptz;
end;
$$;
revoke all on function communication.task_sms_person_timing_gate(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function communication.task_sms_person_timing_gate(uuid, uuid, text, timestamptz)
  to service_role;

create or replace function communication.enqueue_task_sms_reminder_for_user(
  p_caller uuid,
  p_task_id uuid,
  p_program_key text,
  p_event_key text default null
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
  caller uuid := p_caller;
  task_row workspace.tasks%rowtype;
  preference communication.sms_notification_preferences%rowtype;
  destination communication.sms_phone_numbers%rowtype;
  conversation communication.sms_conversations%rowtype;
  event_key text;
  block_key text;
  block_code text;
  person_block text;
  person_defer timestamptz;
  clean_title text;
  reminder_body text;
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

  event_key := coalesce(p_event_key, format(
    'notification:task_sms_reminder:v1:%s:%s:%s',
    caller,
    task_row.id,
    task_row.version
  ));
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

  -- STOP and DNC are keyed to the person/phone, independent of this old P1
  -- enrollment row. A later preference toggle cannot override them.
  if block_code is null and exists (
    select 1 from crm.contact_medium cm
    where cm.organization_id = preference.organization_id
      and cm.channel = 'phone'
      and cm.value_key = preference.phone_number
      and cm.deleted_at is null
      and (cm.suppressed_at is not null or cm.unsubscribed_at is not null
        or cm.dnc_state = 'listed')
  ) then
    block_code := 'phone_suppressed';
  end if;
  if block_code is null and exists (
    select 1 from communication.sms_consent consent
    where consent.phone_number = preference.phone_number
      and consent.consent_type in ('transactional', 'notifications', 'all')
      and consent.status = 'opted_out' and consent.deleted_at is null
  ) then
    block_code := 'consent_not_opted_in';
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
    -- The cap counts every outbound SMS for this person in this tenant,
    -- including other programs/destinations. Serialize that wider set too.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        format('sms-person-cap:%s:%s', preference.organization_id,
          preference.phone_number),
        0
      )
    );
  end if;

  -- Count under the same per-person transaction lock as the insert;
  -- two programs at the cap cannot both observe one remaining slot.
  if block_code is null then
    select g.reason, g.defer_until into person_block, person_defer
    from communication.task_sms_person_timing_gate(
      caller, preference.organization_id, preference.phone_number, now()
    ) g;
    block_code := person_block;
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
        'task_title', clean_title,
        'defer_until', person_defer
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
    'AI Matrx: Task reminder — “%s”. Reply DONE to complete it or SNOOZE 1H for one later reminder.',
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
    'Reply to task reminder by text',
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
        'version', 2,
        'operations', pg_catalog.jsonb_build_object(
          'DONE', pg_catalog.jsonb_build_object(
            'kind', 'task.complete', 'arguments', '{}'::jsonb
          ),
          'SNOOZE 1H', pg_catalog.jsonb_build_object(
            'kind', 'task.snooze',
            'arguments', pg_catalog.jsonb_build_object('delay_seconds', 3600)
          )
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

revoke all on function communication.enqueue_task_sms_reminder_for_user(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function communication.enqueue_task_sms_reminder_for_user(uuid, uuid, text, text)
  to service_role;

comment on function communication.enqueue_task_sms_reminder_for_user(uuid, uuid, text, text) is
  'Private task reminder producer for one validated actor and one stable event key.';

create or replace function communication.enqueue_my_task_sms_reminder(
  p_task_id uuid,
  p_program_key text default 'ai_matrx_owner_beta'
) returns table (
  outcome text, notification_id uuid, outbound_message_id uuid,
  assist_id uuid, sms_conversation_id uuid, blocked_reason text, duplicate boolean
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return query select * from communication.enqueue_task_sms_reminder_for_user(
    auth.uid(), p_task_id, p_program_key, null
  );
end;
$$;
revoke all on function communication.enqueue_my_task_sms_reminder(uuid, text)
  from public, anon;
grant execute on function communication.enqueue_my_task_sms_reminder(uuid, text)
  to authenticated;


create or replace function communication.has_exact_sms_task_reply_offer(
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
          and (
            (
              not exists (
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
                  and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') = 'DONE'
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
            )
            or (
              parsed.offer -> 'version' = '2'::jsonb
              and not exists (
                select 1 from jsonb_object_keys(
                  case when jsonb_typeof(parsed.offer) = 'object'
                    then parsed.offer else '{}'::jsonb end
                ) offer_key
                where offer_key not in (
                  'version', 'operations', 'target_entity_type',
                  'target_entity_id', 'outbound_sms_message_id'
                )
              )
              and parsed.offer ?& array[
                'version', 'operations', 'target_entity_type',
                'target_entity_id', 'outbound_sms_message_id'
              ]
              and parsed.offer -> 'operations' =
                '{"DONE":{"kind":"task.complete","arguments":{}},"SNOOZE 1H":{"kind":"task.snooze","arguments":{"delay_seconds":3600}}}'::jsonb
              and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g')
                in ('DONE', 'SNOOZE 1H')
            )
          )
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
              ) = regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g')
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

revoke all on function communication.has_exact_sms_task_reply_offer(uuid)
  from public, anon, authenticated;
grant execute on function communication.has_exact_sms_task_reply_offer(uuid)
  to service_role;

comment on function communication.has_exact_sms_task_reply_offer(uuid) is
  'Returns true only when one inbound SMS is correlated to one exact v1 DONE or v2 task reply offer and replay-safe assist state.';

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

  if inbound.ai_processing_status is distinct from 'skipped'
    or inbound.error_code is distinct from 'sms_command_offer_unverified'
    or regexp_replace(upper(btrim(coalesce(inbound.body, ''))), '[[:space:]]+', ' ', 'g') not in ('DONE', 'SNOOZE 1H')
    or nullif(btrim(inbound.provider), '') is null
    or nullif(btrim(inbound.provider_account_id), '') is null
    or nullif(btrim(inbound.twilio_sid), '') is null
    or inbound.idempotency_key is distinct from concat(
      inbound.provider, ':inbound:', inbound.provider_account_id, ':', inbound.twilio_sid
    ) then
    return 'refused';
  end if;

  if not communication.has_exact_sms_task_reply_offer(inbound.id) then
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
  'Atomically admits a skipped exact task reply candidate only after one correlated task offer is proven; unmatched, ambiguous, and malformed offers remain terminally skipped.';


-- These two functions change their return shape. Clear their prior door rows
-- before DROP/CREATE so a guarded rehearsal reapply can recreate them with
-- default client EXECUTE cleared at birth, then declare the new door below.
delete from platform.client_callable_door
where schema_name = 'communication'
  and function_name in (
    'claim_pending_sms_command_turns', 'claim_recoverable_sms_command_turns'
  );
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
      and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') in ('DONE', 'SNOOZE 1H')
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
      and communication.has_exact_sms_task_reply_offer(m.id)
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
  'Claims only fresh pending offered task reply turns with one exact correlated task offer; command execution does not require or fabricate an assistant-agent binding.';


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
      and regexp_replace(upper(btrim(coalesce(m.body, ''))), '[[:space:]]+', ' ', 'g') in ('DONE', 'SNOOZE 1H')
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
      and communication.has_exact_sms_task_reply_offer(m.id)
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
  'Reclaims only expired processing offered task reply turns with one exact, correlated, replay-safe SMS task offer; command execution does not require an assistant-agent binding. Ordinary agent claims never reclaim leases.';

-- The accepted Assist/provider event is the authority. A deterministic scheduler
-- identity makes a crash after this transaction safe to resume with the same key.
create or replace function communication.schedule_task_sms_snooze(
  p_assist_id uuid,
  p_inbound_message_id uuid,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_idempotency_key text
) returns table (schedule_id uuid, due_at timestamptz, duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_assist platform.assists%rowtype;
  v_inbound communication.sms_messages%rowtype;
  v_outbound communication.sms_messages%rowtype;
  v_task workspace.tasks%rowtype;
  v_schedule_id uuid;
  v_run_id uuid;
  v_due_at timestamptz;
  v_existing scheduler.sch_task%rowtype;
  v_taxonomy_node_id uuid;
begin
  if p_assist_id is null or p_inbound_message_id is null
    or p_actor_user_id is null or p_organization_id is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Exact SMS command identity required' using errcode = '22023';
  end if;

  select * into v_assist from platform.assists
  where id = p_assist_id and deleted_at is null for update;
  select * into v_inbound from communication.sms_messages
  where id = p_inbound_message_id and deleted_at is null for share;
  select * into v_outbound from communication.sms_messages
  where id = case when pg_catalog.pg_input_is_valid(
    v_assist.metadata -> 'sms_reply_offer' ->> 'outbound_sms_message_id', 'uuid'
  ) then (v_assist.metadata -> 'sms_reply_offer' ->> 'outbound_sms_message_id')::uuid
    else null end and deleted_at is null for share;
  if v_assist.id is null or v_inbound.id is null
    or v_outbound.id is null
    or v_assist.user_id is distinct from p_actor_user_id
    or v_assist.organization_id is distinct from p_organization_id
    or v_inbound.organization_id is distinct from p_organization_id
    or v_inbound.direction is distinct from 'inbound'
    or v_inbound.idempotency_key is distinct from p_idempotency_key
    or v_assist.status is distinct from 'accepted'
    or v_assist.source_key is distinct from 'notifications.task.sms_reply'
    or v_assist.result ->> 'kind' is distinct from 'sms_command_claim'
    or v_assist.result ->> 'status' is distinct from 'executing'
    or v_assist.result ->> 'alias' is distinct from 'SNOOZE 1H'
    or v_assist.result ->> 'idempotency_key' is distinct from p_idempotency_key
    or v_assist.result ->> 'sms_message_id' is distinct from p_inbound_message_id::text
    or v_assist.entity_type is distinct from 'task'
    or v_assist.entity_id::text is distinct from
      (v_assist.metadata -> 'sms_reply_offer' ->> 'target_entity_id')
    or v_assist.metadata -> 'sms_reply_offer' -> 'version' is distinct from '2'::jsonb
    or v_assist.metadata -> 'sms_reply_offer' ->> 'target_entity_type' is distinct from 'task'
    or v_assist.metadata -> 'sms_reply_offer' -> 'operations' is distinct from
      '{"DONE":{"kind":"task.complete","arguments":{}},"SNOOZE 1H":{"kind":"task.snooze","arguments":{"delay_seconds":3600}}}'::jsonb
    or v_outbound.direction is distinct from 'outbound'
    or v_outbound.conversation_id is distinct from v_inbound.conversation_id
    or v_outbound.organization_id is distinct from p_organization_id
    or not communication.has_exact_sms_task_reply_offer(p_inbound_message_id)
  then
    raise exception 'SMS snooze offer or provider event is not authorized'
      using errcode = '42501';
  end if;

  select * into v_task from workspace.tasks
  where id = v_assist.entity_id and deleted_at is null for share;
  if v_task.id is null or v_task.recurrence_rule is not null
    or v_task.status in ('completed', 'cancelled', 'dismissed')
    or not iam.has_access_for(p_actor_user_id, 'task', v_task.id, 'editor') then
    raise exception 'Task is no longer eligible for SMS snooze'
      using errcode = '42501';
  end if;

  v_schedule_id := md5('task-sms-snooze:v1:' || p_assist_id::text)::uuid;
  v_run_id := md5('task-sms-snooze-run:v1:' || p_assist_id::text)::uuid;
  select * into v_existing from scheduler.sch_task
  where id = v_schedule_id for update;
  if found then
    if v_existing.user_id is distinct from p_actor_user_id
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.metadata ->> 'assist_id' is distinct from p_assist_id::text
      or v_existing.metadata ->> 'inbound_message_id' is distinct from p_inbound_message_id::text
      or v_existing.metadata ->> 'provider_event_key' is distinct from p_idempotency_key then
      raise exception 'Scheduler identity collision' using errcode = '23505';
    end if;
    select r.due_at into v_due_at from scheduler.sch_run r
    where r.id = v_run_id and r.task_id = v_schedule_id;
    if v_due_at is null then
      raise exception 'Existing snooze schedule lost its initial run';
    end if;
    return query select v_schedule_id, v_due_at, true;
    return;
  end if;

  v_due_at := now() + interval '1 hour';
  select n.id into v_taxonomy_node_id from platform.taxonomy_node n
  where n.slug = 'notifications' and n.level = 'feature'
    and n.status = 'canonical';
  if v_taxonomy_node_id is null then
    raise exception 'Canonical notification taxonomy node is missing';
  end if;
  insert into scheduler.sch_task (
    id, user_id, kind, title, description, queue, surfaces, enabled,
    expires_at, tags, metadata, taxonomy_node_id, organization_id,
    created_by, updated_by
  ) values (
    v_schedule_id, p_actor_user_id, 'tool',
    'Snoozed task text reminder', 'One later reminder for an exact SMS reply offer.',
    'default', array['server']::text[], true,
    v_due_at + interval '7 days', array['communications', 'task', 'snooze']::text[],
    jsonb_build_object(
      'assist_id', p_assist_id,
      'inbound_message_id', p_inbound_message_id,
      'provider_event_key', p_idempotency_key,
      'task_id', v_task.id,
      'intent_key', 'notification:task_sms_snooze:v1:' || p_assist_id::text
    ),
    v_taxonomy_node_id, p_organization_id, p_actor_user_id, p_actor_user_id
  );
  insert into scheduler.sch_agent_task (
    id, agent_id, prompt, variables, auth_mode,
    max_runtime_seconds, max_concurrent
  ) values (
    v_schedule_id, null,
    'Deliver the governed snoozed task reminder when eligible.',
    jsonb_build_object('tool_name', 'task_sms_snooze_reminder',
      'args', jsonb_build_object('schedule_id', v_schedule_id)),
    'auto', 120, 1
  );
  insert into scheduler.sch_run (
    id, task_id, user_id, organization_id, due_at, status, queue,
    metadata, created_by, updated_by
  ) values (
    v_run_id, v_schedule_id, p_actor_user_id, p_organization_id,
    v_due_at, 'queued', 'default',
    jsonb_build_object('sms_snooze_intent', p_assist_id),
    p_actor_user_id, p_actor_user_id
  );
  return query select v_schedule_id, v_due_at, false;
end;
$$;
revoke all on function communication.schedule_task_sms_snooze(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function communication.schedule_task_sms_snooze(uuid, uuid, uuid, uuid, text)
  to service_role;

-- A claimed scheduler run may deliver this one intent. Every retry returns the
-- same notification/message identity; no scheduler row grants standing SMS authority.
create or replace function communication.dispatch_task_sms_snooze(
  p_schedule_id uuid,
  p_run_id uuid,
  p_claim_token uuid
) returns table (
  outcome text, notification_id uuid, blocked_reason text, defer_until timestamptz
) language plpgsql security definer set search_path = '' as $$
declare
  v_schedule scheduler.sch_task%rowtype;
  v_run scheduler.sch_run%rowtype;
  v_assist platform.assists%rowtype;
  v_inbound communication.sms_messages%rowtype;
  v_outbound communication.sms_messages%rowtype;
  v_task workspace.tasks%rowtype;
  v_pref communication.sms_notification_preferences%rowtype;
  v_existing communication.sms_notifications%rowtype;
  v_result record;
  v_program_key text;
  v_event_key text;
  v_reason text;
  v_defer timestamptz;
  v_deadline timestamptz;
begin
  select * into v_schedule from scheduler.sch_task
  where id = p_schedule_id for update;
  select * into v_run from scheduler.sch_run
  where id = p_run_id and task_id = p_schedule_id for share;
  if v_schedule.id is null or v_run.id is null
    or v_schedule.kind is distinct from 'tool'
    or v_schedule.surfaces is distinct from array['server']::text[]
    or not v_schedule.enabled
    or v_run.trigger_id is not null
    or v_run.status not in ('claimed', 'running')
    or v_run.claim_token is distinct from p_claim_token
    or v_run.claim_expires_at is null
    or v_run.claim_expires_at <= now()
    or v_run.due_at > now()
    or v_schedule.user_id is distinct from v_run.user_id
    or v_schedule.organization_id is distinct from v_run.organization_id
    or not exists (
      select 1 from scheduler.sch_agent_task carrier
      where carrier.id = v_schedule.id
        and carrier.variables ->> 'tool_name' = 'task_sms_snooze_reminder'
        and carrier.variables -> 'args' ->> 'schedule_id' = p_schedule_id::text
    ) then
    raise exception 'Active governed SMS snooze scheduler run required'
      using errcode = '42501';
  end if;

  v_event_key := v_schedule.metadata ->> 'intent_key';
  if v_event_key is distinct from 'notification:task_sms_snooze:v1:' ||
      (v_schedule.metadata ->> 'assist_id')
    or not pg_catalog.pg_input_is_valid(v_schedule.metadata ->> 'assist_id', 'uuid')
    or not pg_catalog.pg_input_is_valid(v_schedule.metadata ->> 'inbound_message_id', 'uuid')
    or v_schedule.id is distinct from md5(
      'task-sms-snooze:v1:' || (v_schedule.metadata ->> 'assist_id')
    )::uuid then
    raise exception 'Snooze schedule has invalid intent identity'
      using errcode = '42501';
  end if;
  select * into v_assist from platform.assists
  where id = (v_schedule.metadata ->> 'assist_id')::uuid
    and deleted_at is null for share;
  select * into v_inbound from communication.sms_messages
  where id = (v_schedule.metadata ->> 'inbound_message_id')::uuid
    and deleted_at is null for share;
  select * into v_outbound from communication.sms_messages
  where id = case
    when pg_catalog.pg_input_is_valid(
      v_assist.metadata -> 'sms_reply_offer' ->> 'outbound_sms_message_id', 'uuid'
    ) then (v_assist.metadata -> 'sms_reply_offer' ->> 'outbound_sms_message_id')::uuid
    else null end
    and deleted_at is null for share;
  if v_assist.id is null or v_inbound.id is null
    or v_assist.user_id is distinct from v_schedule.user_id
    or v_assist.organization_id is distinct from v_schedule.organization_id
    or v_inbound.organization_id is distinct from v_schedule.organization_id
    or v_inbound.idempotency_key is distinct from v_schedule.metadata ->> 'provider_event_key'
    or v_outbound.id is null
    or v_outbound.direction is distinct from 'outbound'
    or v_outbound.conversation_id is distinct from v_inbound.conversation_id
    or v_outbound.organization_id is distinct from v_schedule.organization_id
    or v_assist.status is distinct from 'accepted'
    or v_assist.entity_type is distinct from 'task'
    or v_assist.entity_id::text is distinct from
      (v_assist.metadata -> 'sms_reply_offer' ->> 'target_entity_id')
    or v_assist.metadata -> 'sms_reply_offer' -> 'version' is distinct from '2'::jsonb
    or v_assist.metadata -> 'sms_reply_offer' ->> 'target_entity_type' is distinct from 'task'
    or v_assist.metadata -> 'sms_reply_offer' -> 'operations' is distinct from
      '{"DONE":{"kind":"task.complete","arguments":{}},"SNOOZE 1H":{"kind":"task.snooze","arguments":{"delay_seconds":3600}}}'::jsonb
    or v_assist.result ->> 'idempotency_key' is distinct from v_inbound.idempotency_key
    or v_assist.result ->> 'alias' is distinct from 'SNOOZE 1H'
    or v_assist.result ->> 'sms_message_id' is distinct from v_inbound.id::text
    or coalesce(v_assist.result ->> 'kind', '') not in ('sms_command_claim', 'sms_command_receipt')
    or not communication.has_exact_sms_task_reply_offer(v_inbound.id) then
    v_reason := 'snooze_authority_lost';
  end if;

  select n.* into v_existing from communication.sms_notifications n
  where n.idempotency_key = v_event_key and n.deleted_at is null;
  if found and v_existing.message_id is not null then
    update scheduler.sch_task set metadata = metadata || jsonb_build_object(
        'outcome', 'queued', 'notification_id', v_existing.id
      ), updated_at = now()
    where id = p_schedule_id;
    return query select 'queued'::text, v_existing.id, null::text, null::timestamptz;
    return;
  end if;
  if found and v_existing.status = 'skipped' then
    return query select 'skipped'::text, v_existing.id,
      coalesce(v_existing.failure_reason, 'snooze_expired'), null::timestamptz;
    return;
  end if;

  -- A lease can outlive a task that expired while the worker was running.
  -- Existing receipts above remain replayable, but expiry grants no new send.
  if v_reason is null and v_schedule.expires_at is not null
    and v_schedule.expires_at <= now() then
    v_reason := 'snooze_expired';
  end if;

  if v_reason is null then
    select * into v_task from workspace.tasks
    where id = v_assist.entity_id and deleted_at is null for share;
    if v_task.id is null or v_task.recurrence_rule is not null
      or v_task.status in ('completed', 'cancelled', 'dismissed')
      or not iam.has_access_for(v_schedule.user_id, 'task', v_task.id, 'editor') then
      v_reason := 'task_not_actionable';
    end if;
  end if;

  if v_reason is null then
    v_program_key := v_outbound.metadata ->> 'program_key';
    select * into v_pref from communication.sms_notification_preferences
    where user_id = v_schedule.user_id
      and organization_id = v_schedule.organization_id
      and assistant_program_key = v_program_key
      and deleted_at is null
    limit 1 for share;
    if v_pref.user_id is null or not v_pref.sms_enabled
      or not v_pref.task_notifications or v_pref.phone_number is null
      or v_pref.phone_number is distinct from v_outbound.to_number then
      v_reason := 'task_notifications_disabled';
    end if;
  end if;

  if v_reason is null and exists (
    select 1 from crm.contact_medium cm
    where cm.organization_id = v_schedule.organization_id
      and cm.channel = 'phone'
      and cm.value_key = v_pref.phone_number
      and cm.deleted_at is null
      and (cm.suppressed_at is not null or cm.unsubscribed_at is not null
        or cm.dnc_state = 'listed')
  ) then
    v_reason := 'phone_suppressed';
  end if;
  if v_reason is null and (
    exists (
      select 1 from communication.sms_consent c
      where c.phone_number = v_pref.phone_number
        and c.consent_type in ('all', 'notifications', 'transactional')
        and c.status = 'opted_out' and c.deleted_at is null
    ) or not exists (
      select 1 from communication.sms_consent c
      where c.phone_number = v_pref.phone_number
        and c.consent_type in ('all', 'notifications', 'transactional')
        and c.status = 'opted_in' and c.deleted_at is null
    )
  ) then
    v_reason := 'consent_not_opted_in';
  end if;

  if v_reason is null then
    select g.reason, g.defer_until into v_reason, v_defer
    from communication.task_sms_person_timing_gate(
      v_schedule.user_id, v_schedule.organization_id, v_pref.phone_number, now()
    ) g;
  end if;

  if v_reason is null then
    select * into v_result from communication.enqueue_task_sms_reminder_for_user(
      v_schedule.user_id, v_task.id, v_program_key, v_event_key
    );
    if v_result.outcome in ('queued', 'duplicate')
      and v_result.outbound_message_id is not null then
      update scheduler.sch_task set metadata = metadata || jsonb_build_object(
          'outcome', 'queued', 'notification_id', v_result.notification_id
        ), updated_at = now()
      where id = p_schedule_id;
      return query select 'queued'::text, v_result.notification_id,
        null::text, null::timestamptz;
      return;
    end if;
    v_reason := coalesce(v_result.blocked_reason, 'reminder_not_queued');
    if v_reason = 'quiet_hours' then
      v_defer := now() + interval '1 hour';
    elsif v_reason = 'hourly_rate_limit' then
      v_defer := now() + interval '1 hour';
    elsif v_reason = 'daily_rate_limit' then
      v_defer := now() + interval '1 day';
    end if;
  end if;

  v_deadline := least(v_schedule.expires_at, v_run.due_at + interval '7 days');
  if v_defer is not null and v_defer < v_deadline then
    return query select 'deferred'::text, null::uuid, v_reason,
      greatest(v_defer, now() + interval '1 minute');
    return;
  end if;

  insert into communication.sms_notifications (
    organization_id, user_id, notification_type, category, reference_type,
    reference_id, status, failure_reason, idempotency_key, metadata, created_by
  ) values (
    v_schedule.organization_id, v_schedule.user_id, 'task_due_date',
    'transactional', 'task', v_schedule.metadata ->> 'task_id', 'skipped',
    coalesce(v_reason, 'snooze_expired'), v_event_key,
    jsonb_build_object('producer', 'communication.dispatch_task_sms_snooze',
      'schedule_id', p_schedule_id, 'inbound_message_id', v_inbound.id),
    v_schedule.user_id
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  select id into v_existing.id from communication.sms_notifications
  where idempotency_key = v_event_key;
  update scheduler.sch_task set metadata = metadata || jsonb_build_object(
      'outcome', 'skipped', 'reason', coalesce(v_reason, 'snooze_expired'),
      'notification_id', v_existing.id
    ), updated_at = now()
  where id = p_schedule_id;
  return query select 'skipped'::text, v_existing.id,
    coalesce(v_reason, 'snooze_expired'), null::timestamptz;
end;
$$;
revoke all on function communication.dispatch_task_sms_snooze(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function communication.dispatch_task_sms_snooze(uuid, uuid, uuid)
  to service_role;

-- The provision guard requires an explicit access decision for each new
-- SECURITY DEFINER function. Only the authenticated reminder wrapper is a
-- client door; the new helpers and scheduler operations remain server-only.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select 'communication', p.proname, pg_get_function_identity_arguments(p.oid),
  platform.door_argtypes(p.proargtypes),
  case p.proname
    when 'task_sms_person_timing_gate' then
      'p_user_id identifies the person, p_organization_id the tenant, p_phone the exact SMS destination, and p_now the evaluation instant. The function reads the person policy and outbound counts; no caller-supplied identity is authorized for client use.'
    when 'enqueue_task_sms_reminder_for_user' then
      'p_caller is an already validated actor, p_task_id the task, p_program_key the original enrollment, and p_event_key the durable event identity. The function independently checks task access, enrollment, consent, and transport policy before inserting.'
    when 'has_exact_sms_task_reply_offer' then
      'p_inbound_message_id selects a received inbound SMS. Correlation to exactly one offered Assist, task, conversation, and outbound message is checked in the function; it is an internal admission predicate only.'
    when 'admit_pending_sms_command_turn' then
      'p_inbound_message_id selects one received inbound SMS. The function admits it only when the provider event and exact offered task reply match, and never treats a NULL identity as a match.'
    when 'claim_pending_sms_command_turns' then
      'p_worker_id names the internal worker lease owner, while p_limit and p_lease_seconds bound one claim batch. The function selects only exact provider events with a correlated task offer.'
    when 'claim_recoverable_sms_command_turns' then
      'p_worker_id names the internal worker lease owner, while p_limit and p_lease_seconds bound a recovery batch. The function reclaims only expired leases for exact offered provider events.'
    when 'schedule_task_sms_snooze' then
      'p_assist_id and p_inbound_message_id select the accepted offer and provider event; p_actor_user_id, p_organization_id, and p_idempotency_key must match that offer. The function checks those identities and task edit access before scheduling.'
    when 'dispatch_task_sms_snooze' then
      'p_schedule_id selects the durable intent, p_run_id the claimed due run, and p_claim_token the live lease. The function rechecks the offered operation, task access, enrollment, consent, and current delivery policy.'
  end,
  'communications_p1_task_snooze_1h.sql',
  'server_only: called by the SMS command executor or claimed scheduler worker after their own authenticated event and live lease checks. Exposing this function to a client could reveal another person or schedule a message without the inbound SMS authority.',
  false, false
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'communication'
  and p.proname in (
    'task_sms_person_timing_gate', 'enqueue_task_sms_reminder_for_user',
    'has_exact_sms_task_reply_offer', 'admit_pending_sms_command_turn',
    'claim_pending_sms_command_turns', 'claim_recoverable_sms_command_turns',
    'schedule_task_sms_snooze', 'dispatch_task_sms_snooze'
  )
  and not exists (
    select 1 from platform.client_callable_door d
    where d.schema_name = 'communication'
      and d.function_name = p.proname
      and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
  );
