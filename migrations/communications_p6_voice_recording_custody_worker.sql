-- P6 Phase 2: durable callback-to-canonical-file custody work.
--
-- No new queue table is introduced. The already-claimed completed recording
-- lifecycle event in platform.activity_log is the durable frontier. Claims and
-- failures are append-only activity events; successful completion remains the
-- existing communication.finalize_voice_recording_file transaction.

create index if not exists activity_log_voice_recording_completed_queue_idx
  on platform.activity_log(id)
  where action = 'voice.recording.lifecycle'
    and metadata ->> 'status' = 'completed';

create index if not exists activity_log_voice_recording_custody_source_idx
  on platform.activity_log ((metadata ->> 'source_event_id'), id desc)
  where action in (
    'voice.recording.custody.claimed',
    'voice.recording.custody.failed'
  );

drop function if exists communication.claim_voice_recording_custody_work(
  text, integer, integer, integer
);

create function communication.claim_voice_recording_custody_work(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 300,
  p_max_attempts integer default 5
)
returns table (
  source_event_id bigint,
  claim_event_id bigint,
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer,
  interaction_id uuid,
  organization_id uuid,
  recording_owner_id uuid,
  program_key text,
  provider text,
  provider_account_id text,
  provider_call_id text,
  provider_recording_id text,
  source_event_key text,
  provider_media_url text,
  duration_seconds integer,
  channels smallint,
  recording_source text,
  recording_track text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'Voice recording custody worker id is required' using errcode = '22023';
  end if;
  if length(p_worker_id) > 200 then
    raise exception 'Voice recording custody worker id is too long' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select
      source.id as source_event_id,
      source.organization_id,
      source.entity_id as interaction_id,
      source.metadata,
      i.recording_owner_id,
      i.program_key,
      (
        select count(*)::integer + 1
        from platform.activity_log prior_claim
        where prior_claim.action = 'voice.recording.custody.claimed'
          and prior_claim.metadata ->> 'source_event_id' = source.id::text
      ) as attempt_count
    from platform.activity_log source
    join crm.interaction i
      on i.id = source.entity_id
     and source.entity_type = 'crm_interaction'
    where source.action = 'voice.recording.lifecycle'
      and source.metadata ->> 'status' = 'completed'
      and nullif(source.metadata ->> 'provider_media_url', '') is not null
      and i.channel_code = 'call'
      and i.deleted_at is null
      and i.recording_status = 'completed'
      and i.recording_file_id is null
      and i.recording_owner_id is not null
      and i.provider = source.metadata ->> 'provider'
      and i.provider_account_id = source.metadata ->> 'provider_account_id'
      and i.provider_interaction_id = source.metadata ->> 'provider_call_id'
      and i.provider_recording_id = source.metadata ->> 'provider_recording_id'
      and not exists (
        select 1
        from platform.activity_log custody
        where custody.action = 'voice.recording.custody'
          and custody.entity_type = 'crm_interaction'
          and custody.entity_id = source.entity_id
          and custody.metadata ->> 'source_event_key' =
            source.metadata ->> 'provider_event_key'
      )
      and not exists (
        select 1
        from platform.activity_log terminal_failure
        where terminal_failure.action = 'voice.recording.custody.failed'
          and terminal_failure.metadata ->> 'source_event_id' = source.id::text
          and terminal_failure.metadata ->> 'retryable' = 'false'
      )
      and coalesce((
        select (failure.metadata ->> 'next_attempt_at')::timestamptz
        from platform.activity_log failure
        where failure.action = 'voice.recording.custody.failed'
          and failure.metadata ->> 'source_event_id' = source.id::text
        order by failure.id desc
        limit 1
      ), '-infinity'::timestamptz) <= now()
      and (
        select count(*)
        from platform.activity_log prior_claim
        where prior_claim.action = 'voice.recording.custody.claimed'
          and prior_claim.metadata ->> 'source_event_id' = source.id::text
      ) < greatest(1, least(coalesce(p_max_attempts, 5), 20))
      and not exists (
        select 1
        from platform.activity_log active_claim
        where active_claim.action = 'voice.recording.custody.claimed'
          and active_claim.metadata ->> 'source_event_id' = source.id::text
          and (active_claim.metadata ->> 'lease_expires_at')::timestamptz > now()
          and not exists (
            select 1
            from platform.activity_log claim_failure
            where claim_failure.action = 'voice.recording.custody.failed'
              and claim_failure.metadata ->> 'claim_token' =
                active_claim.metadata ->> 'claim_token'
          )
      )
    order by source.id
    for update of source skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  ), prepared as (
    select
      candidates.*,
      gen_random_uuid() as claim_token,
      now() + pg_catalog.make_interval(
        secs => greatest(30, least(coalesce(p_lease_seconds, 300), 1800))
      ) as lease_expires_at
    from candidates
  ), inserted as (
    insert into platform.activity_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      actor_id,
      occurred_at,
      metadata
    )
    select
      prepared.organization_id,
      'crm_interaction',
      prepared.interaction_id,
      'voice.recording.custody.claimed',
      null,
      now(),
      jsonb_build_object(
        'source_event_id', prepared.source_event_id,
        'source_event_key', prepared.metadata ->> 'provider_event_key',
        'claim_token', prepared.claim_token,
        'worker_id', p_worker_id,
        'attempt_count', prepared.attempt_count,
        'lease_expires_at', prepared.lease_expires_at
      )
    from prepared
    returning id, entity_id, metadata
  )
  select
    source.id,
    inserted.id,
    (inserted.metadata ->> 'claim_token')::uuid,
    (inserted.metadata ->> 'lease_expires_at')::timestamptz,
    (inserted.metadata ->> 'attempt_count')::integer,
    i.id,
    i.organization_id,
    i.recording_owner_id,
    i.program_key,
    source.metadata ->> 'provider',
    source.metadata ->> 'provider_account_id',
    source.metadata ->> 'provider_call_id',
    source.metadata ->> 'provider_recording_id',
    source.metadata ->> 'provider_event_key',
    source.metadata ->> 'provider_media_url',
    (source.metadata ->> 'duration_seconds')::integer,
    (source.metadata ->> 'channels')::smallint,
    source.metadata ->> 'source',
    source.metadata ->> 'track'
  from inserted
  join platform.activity_log source
    on source.id = (inserted.metadata ->> 'source_event_id')::bigint
  join crm.interaction i on i.id = inserted.entity_id
  order by source.id;
end;
$$;

drop function if exists communication.fail_voice_recording_custody_work(
  bigint, uuid, text, text, boolean, integer, text, uuid, boolean, integer
);

create function communication.fail_voice_recording_custody_work(
  p_source_event_id bigint,
  p_claim_token uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean,
  p_retry_after_seconds integer default 30,
  p_operator_detail text default null,
  p_canonical_file_id uuid default null,
  p_cleanup_required boolean default false,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source platform.activity_log%rowtype;
  v_claim platform.activity_log%rowtype;
  v_attempt_count integer;
  v_effective_retryable boolean;
  v_next_attempt_at timestamptz;
begin
  if p_source_event_id is null or p_claim_token is null then
    raise exception 'Voice recording custody source and claim are required'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_worker_id), '') is null
     or nullif(btrim(p_error_code), '') is null then
    raise exception 'Voice recording custody worker and error code are required'
      using errcode = '22023';
  end if;
  if p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Voice recording custody error code is invalid' using errcode = '22023';
  end if;
  if p_operator_detail ~* '(https?://|s3://)' then
    raise exception 'Voice recording custody failure detail cannot contain a media location'
      using errcode = '22023';
  end if;

  select source.* into v_source
  from platform.activity_log source
  where source.id = p_source_event_id
    and source.entity_type = 'crm_interaction'
    and source.action = 'voice.recording.lifecycle'
    and source.metadata ->> 'status' = 'completed'
  for update;
  if not found then
    raise exception 'Completed voice recording lifecycle source does not exist'
      using errcode = 'P0002';
  end if;

  select claim.* into v_claim
  from platform.activity_log claim
  where claim.action = 'voice.recording.custody.claimed'
    and claim.metadata ->> 'source_event_id' = p_source_event_id::text
    and claim.metadata ->> 'claim_token' = p_claim_token::text
    and claim.metadata ->> 'worker_id' = p_worker_id
  order by claim.id desc
  limit 1;
  if not found then
    raise exception 'Voice recording custody claim does not match this worker'
      using errcode = '42501';
  end if;
  if v_claim.id is distinct from (
    select latest.id
    from platform.activity_log latest
    where latest.action = 'voice.recording.custody.claimed'
      and latest.metadata ->> 'source_event_id' = p_source_event_id::text
    order by latest.id desc
    limit 1
  ) then
    return false;
  end if;
  if exists (
    select 1
    from platform.activity_log prior
    where prior.action = 'voice.recording.custody.failed'
      and prior.metadata ->> 'claim_token' = p_claim_token::text
  ) then
    return false;
  end if;
  if exists (
    select 1
    from platform.activity_log custody
    where custody.action = 'voice.recording.custody'
      and custody.entity_id = v_source.entity_id
      and custody.metadata ->> 'source_event_key' =
        v_source.metadata ->> 'provider_event_key'
  ) then
    return false;
  end if;

  v_attempt_count := coalesce((v_claim.metadata ->> 'attempt_count')::integer, 1);
  v_effective_retryable := coalesce(p_retryable, false)
    and v_attempt_count < greatest(1, least(coalesce(p_max_attempts, 5), 20));
  v_next_attempt_at := case
    when v_effective_retryable then
      now() + pg_catalog.make_interval(
        secs => greatest(1, least(coalesce(p_retry_after_seconds, 30), 86400))
      )
    else null
  end;

  insert into platform.activity_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    occurred_at,
    metadata
  ) values (
    v_source.organization_id,
    'crm_interaction',
    v_source.entity_id,
    'voice.recording.custody.failed',
    null,
    now(),
    jsonb_strip_nulls(jsonb_build_object(
      'source_event_id', p_source_event_id,
      'source_event_key', v_source.metadata ->> 'provider_event_key',
      'claim_token', p_claim_token,
      'worker_id', p_worker_id,
      'attempt_count', v_attempt_count,
      'error_code', p_error_code,
      'retryable', v_effective_retryable,
      'next_attempt_at', v_next_attempt_at,
      'operator_detail', left(p_operator_detail, 500),
      'canonical_file_id', p_canonical_file_id,
      'cleanup_required', coalesce(p_cleanup_required, false)
    ))
  );
  return true;
end;
$$;

revoke all on function communication.claim_voice_recording_custody_work(
  text, integer, integer, integer
) from public, anon, authenticated;
revoke all on function communication.fail_voice_recording_custody_work(
  bigint, uuid, text, text, boolean, integer, text, uuid, boolean, integer
) from public, anon, authenticated;

grant execute on function communication.claim_voice_recording_custody_work(
  text, integer, integer, integer
) to service_role;
grant execute on function communication.fail_voice_recording_custody_work(
  bigint, uuid, text, text, boolean, integer, text, uuid, boolean, integer
) to service_role;

comment on function communication.claim_voice_recording_custody_work(
  text, integer, integer, integer
) is
  'Service-only SKIP LOCKED lease claim over completed voice.recording.lifecycle evidence. '
  'The activity log remains the durable frontier; provider media URLs are evidence only.';

comment on function communication.fail_voice_recording_custody_work(
  bigint, uuid, text, text, boolean, integer, text, uuid, boolean, integer
) is
  'Service-only append-only retry/dead-letter receipt for one exact custody claim. '
  'It stores no provider or S3 media location and never deletes a recording residual.';
