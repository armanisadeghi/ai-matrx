-- P6 Phase 2A: durable, provider-neutral voice call and recording lifecycle.
--
-- Reuses crm.interaction as the canonical call and platform.activity_log as the
-- append-only provider evidence ledger. Provider media URLs remain evidence;
-- durable playback resolves only through recording_file_id -> files.files.

alter table crm.interaction
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_interaction_id text,
  add column if not exists provider_status text,
  add column if not exists provider_status_sequence integer,
  add column if not exists provider_status_at timestamptz,
  add column if not exists program_key text,
  add column if not exists recording_owner_id uuid,
  add column if not exists provider_recording_id text,
  add column if not exists recording_status text,
  add column if not exists recording_started_at timestamptz,
  add column if not exists recording_status_at timestamptz,
  add column if not exists recording_duration_seconds integer,
  add column if not exists recording_channels smallint,
  add column if not exists recording_source text,
  add column if not exists recording_track text,
  add column if not exists recording_file_id uuid,
  add column if not exists recording_custody_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_owner_id_fkey'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_owner_id_fkey
      foreign key (recording_owner_id) references auth.users(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_file_id_fkey'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_file_id_fkey
      foreign key (recording_file_id) references files.files(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_provider_status_check'
  ) then
    alter table crm.interaction
      add constraint interaction_provider_status_check check (
        provider_status is null or provider_status in (
          'initiated', 'ringing', 'in_progress', 'completed', 'busy',
          'failed', 'no_answer', 'canceled'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_provider_status_sequence_check'
  ) then
    alter table crm.interaction
      add constraint interaction_provider_status_sequence_check
      check (provider_status_sequence is null or provider_status_sequence >= -1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_status_check'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_status_check check (
        recording_status is null or recording_status in (
          'in_progress', 'completed', 'absent', 'failed'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_duration_check'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_duration_check
      check (recording_duration_seconds is null or recording_duration_seconds >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_channels_check'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_channels_check
      check (recording_channels is null or recording_channels in (1, 2));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_track_check'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_track_check
      check (recording_track is null or recording_track in ('inbound', 'outbound', 'both'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_voice_provider_identity_check'
  ) then
    alter table crm.interaction
      add constraint interaction_voice_provider_identity_check check (
        channel_code <> 'call'
        or (
          provider is null
          and provider_account_id is null
          and provider_interaction_id is null
        )
        or (
          nullif(btrim(provider), '') is not null
          and nullif(btrim(provider_account_id), '') is not null
          and nullif(btrim(provider_interaction_id), '') is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'crm.interaction'::regclass
      and conname = 'interaction_recording_canonical_file_check'
  ) then
    alter table crm.interaction
      add constraint interaction_recording_canonical_file_check check (
        recording_file_id is null
        or (
          recording_status = 'completed'
          and recording_custody_at is not null
          and recording_owner_id is not null
        )
      );
  end if;
end
$$;

create unique index if not exists interaction_voice_provider_identity_uidx
  on crm.interaction(provider, provider_account_id, provider_interaction_id)
  where channel_code = 'call' and deleted_at is null;

create unique index if not exists interaction_voice_provider_recording_uidx
  on crm.interaction(provider, provider_account_id, provider_recording_id)
  where channel_code = 'call'
    and provider_recording_id is not null
    and deleted_at is null;

create index if not exists interaction_voice_program_time_idx
  on crm.interaction(program_key, occurred_at desc)
  where channel_code = 'call' and deleted_at is null;

create index if not exists interaction_recording_owner_idx
  on crm.interaction(recording_owner_id);

create index if not exists interaction_recording_file_idx
  on crm.interaction(recording_file_id);

create unique index if not exists activity_log_voice_provider_event_key_uidx
  on platform.activity_log ((metadata ->> 'provider_event_key'))
  where action in (
    'voice.call.registered',
    'voice.call.lifecycle',
    'voice.recording.lifecycle',
    'voice.recording.custody'
  )
    and nullif(metadata ->> 'provider_event_key', '') is not null;

create or replace function communication.register_voice_call_interaction(
  p_party_id uuid,
  p_contact_point_id uuid,
  p_organization_id uuid,
  p_recording_owner_id uuid,
  p_direction text,
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_program_key text,
  p_from_address text,
  p_to_address text,
  p_occurred_at timestamptz default null
)
returns table (
  interaction_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_contact_party_id uuid;
  v_contact_org_id uuid;
  v_event_key text;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_program_key), '') is null then
    raise exception 'Voice provider identity and program key are required'
      using errcode = '22023';
  end if;
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'Unsupported voice direction: %', p_direction using errcode = '22023';
  end if;
  if not exists (
    select 1 from crm.party p
    where p.id = p_party_id
      and p.organization_id = p_organization_id
      and p.deleted_at is null
  ) then
    raise exception 'Voice party does not belong to the call organization'
      using errcode = '23503';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_recording_owner_id
  ) then
    raise exception 'Voice recording owner does not exist' using errcode = '23503';
  end if;
  if not iam.is_org_member(p_recording_owner_id, p_organization_id) then
    raise exception 'Voice recording owner is not a member of the call organization'
      using errcode = '42501';
  end if;
  if p_contact_point_id is not null then
    select cp.party_id, cp.organization_id
      into v_contact_party_id, v_contact_org_id
    from crm.party_contact_point cp
    where cp.id = p_contact_point_id and cp.deleted_at is null;
    if v_contact_party_id is distinct from p_party_id
       or v_contact_org_id is distinct from p_organization_id then
      raise exception 'Voice contact point does not belong to the exact party and organization'
        using errcode = '23503';
    end if;
  end if;

  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.deleted_at is null
  for update;

  if found then
    if v_interaction.party_id is distinct from p_party_id
       or v_interaction.organization_id is distinct from p_organization_id
       or v_interaction.recording_owner_id is distinct from p_recording_owner_id
       or v_interaction.program_key is distinct from p_program_key
       or v_interaction.contact_point_id is distinct from p_contact_point_id
       or v_interaction.direction is distinct from p_direction
       or v_interaction.attributes ->> 'from_address' is distinct from p_from_address
       or v_interaction.attributes ->> 'to_address' is distinct from p_to_address then
      raise exception 'Voice call identity is already bound to different canonical context'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, 'replay'::text;
    return;
  end if;

  insert into crm.interaction (
    party_id,
    contact_point_id,
    direction,
    channel_code,
    status,
    occurred_at,
    subject,
    thread_key,
    attributes,
    organization_id,
    created_by,
    provider,
    provider_account_id,
    provider_interaction_id,
    provider_status,
    provider_status_sequence,
    provider_status_at,
    program_key,
    recording_owner_id
  ) values (
    p_party_id,
    p_contact_point_id,
    p_direction,
    'call',
    'in_progress',
    coalesce(p_occurred_at, now()),
    'AI Matrx voice call',
    concat_ws(':', 'voice', p_provider, p_provider_account_id, p_provider_call_id),
    jsonb_build_object(
      'from_address', p_from_address,
      'to_address', p_to_address
    ),
    p_organization_id,
    null,
    p_provider,
    p_provider_account_id,
    p_provider_call_id,
    'initiated',
    -1,
    coalesce(p_occurred_at, now()),
    p_program_key,
    p_recording_owner_id
  )
  on conflict (provider, provider_account_id, provider_interaction_id)
    where channel_code = 'call' and deleted_at is null
  do nothing
  returning * into v_interaction;

  if not found then
    select i.* into v_interaction
    from crm.interaction i
    where i.channel_code = 'call'
      and i.provider = p_provider
      and i.provider_account_id = p_provider_account_id
      and i.provider_interaction_id = p_provider_call_id
      and i.deleted_at is null
    for update;
    if not found then
      raise exception 'Voice call identity conflict could not be correlated'
        using errcode = '40001';
    end if;
    if v_interaction.party_id is distinct from p_party_id
       or v_interaction.organization_id is distinct from p_organization_id
       or v_interaction.recording_owner_id is distinct from p_recording_owner_id
       or v_interaction.program_key is distinct from p_program_key
       or v_interaction.contact_point_id is distinct from p_contact_point_id
       or v_interaction.direction is distinct from p_direction
       or v_interaction.attributes ->> 'from_address' is distinct from p_from_address
       or v_interaction.attributes ->> 'to_address' is distinct from p_to_address then
      raise exception 'Voice call identity is already bound to different canonical context'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, 'replay'::text;
    return;
  end if;

  v_event_key := concat_ws(
    ':', p_provider, 'voice-call', p_provider_account_id, p_provider_call_id, 'registered'
  );
  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    p_organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.call.registered',
    null,
    coalesce(p_occurred_at, now()),
    jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_event_key', v_event_key,
      'program_key', p_program_key,
      'direction', p_direction
    )
  );

  return query select v_interaction.id, 'created'::text;
end;
$$;

create or replace function communication.claim_voice_call_lifecycle_event(
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_provider_event_key text,
  p_sequence integer,
  p_status text,
  p_occurred_at timestamptz default null
)
returns table (
  interaction_id uuid,
  event_id bigint,
  disposition text,
  effective_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_disposition text;
  v_status_rank integer;
  v_current_rank integer;
  v_terminal boolean;
  v_interaction_status text;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null then
    raise exception 'Voice call event provider identity is required' using errcode = '22023';
  end if;
  if p_sequence is null or p_sequence < 0 then
    raise exception 'Voice call event sequence must be non-negative' using errcode = '22023';
  end if;
  v_status_rank := case p_status
    when 'initiated' then 0
    when 'ringing' then 1
    when 'in_progress' then 2
    when 'completed' then 3
    when 'busy' then 3
    when 'failed' then 3
    when 'no_answer' then 3
    when 'canceled' then 3
    else null
  end;
  if v_status_rank is null then
    raise exception 'Unsupported voice call status: %', p_status using errcode = '22023';
  end if;

  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical voice interaction matches the exact provider account and call'
      using errcode = 'P0002';
  end if;

  select a.* into v_existing
  from platform.activity_log a
  where a.action = 'voice.call.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.metadata ->> 'provider' is distinct from p_provider
       or v_existing.metadata ->> 'provider_account_id' is distinct from p_provider_account_id
       or v_existing.metadata ->> 'provider_call_id' is distinct from p_provider_call_id
       or v_existing.metadata ->> 'status' is distinct from p_status
       or (v_existing.metadata ->> 'sequence')::integer is distinct from p_sequence
       or (v_existing.metadata ->> 'provider_occurred_at')::timestamptz
          is distinct from p_occurred_at then
      raise exception 'Voice call provider event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query
      select v_interaction.id, v_existing.id, 'replay'::text, v_interaction.provider_status;
    return;
  end if;

  v_current_rank := case v_interaction.provider_status
    when 'initiated' then 0
    when 'ringing' then 1
    when 'in_progress' then 2
    when 'completed' then 3
    when 'busy' then 3
    when 'failed' then 3
    when 'no_answer' then 3
    when 'canceled' then 3
    else -1
  end;
  v_terminal := v_current_rank = 3;

  if v_terminal then
    v_disposition := 'ignored_terminal';
  elsif p_sequence <= coalesce(v_interaction.provider_status_sequence, -1)
        or v_status_rank < v_current_rank then
    v_disposition := 'ignored_out_of_order';
  elsif p_status = v_interaction.provider_status then
    -- A provider may emit the same state at a later sequence. Advance the
    -- sequence watermark so a different callback cannot reuse that sequence
    -- to move the lifecycle forward.
    v_disposition := 'ignored_duplicate_state';
    update crm.interaction
    set provider_status_sequence = p_sequence,
        provider_status_at = coalesce(p_occurred_at, now())
    where id = v_interaction.id
    returning * into v_interaction;
  else
    v_disposition := 'applied';
    v_interaction_status := case p_status
      when 'completed' then 'completed'
      when 'canceled' then 'cancelled'
      when 'busy' then 'failed'
      when 'failed' then 'failed'
      when 'no_answer' then 'failed'
      else 'in_progress'
    end;
    update crm.interaction
    set provider_status = p_status,
        provider_status_sequence = p_sequence,
        provider_status_at = coalesce(p_occurred_at, now()),
        status = v_interaction_status,
        occurred_at = coalesce(occurred_at, p_occurred_at, now())
    where id = v_interaction.id
    returning * into v_interaction;
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.call.lifecycle',
    null,
    coalesce(p_occurred_at, now()),
    jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_event_key', p_provider_event_key,
      'sequence', p_sequence,
      'status', p_status,
      'provider_occurred_at', p_occurred_at,
      'disposition', v_disposition
    )
  ) returning id into v_event_id;

  return query
    select v_interaction.id, v_event_id, v_disposition, v_interaction.provider_status;
end;
$$;

-- The result intentionally excludes recording_file_id: provider completion is
-- claimable before canonical file custody exists, and PostgreSQL function
-- output columns cannot express that nullability to generated clients.
drop function if exists communication.claim_voice_recording_lifecycle_event(
  text, text, text, text, text, text, timestamptz, integer, smallint, text, text, text
);

create function communication.claim_voice_recording_lifecycle_event(
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_provider_recording_id text,
  p_provider_event_key text,
  p_status text,
  p_recording_started_at timestamptz default null,
  p_duration_seconds integer default null,
  p_channels smallint default null,
  p_source text default null,
  p_track text default null,
  p_provider_media_url text default null
)
returns table (
  interaction_id uuid,
  event_id bigint,
  disposition text,
  effective_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_disposition text;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_recording_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null then
    raise exception 'Voice recording event provider identity is required'
      using errcode = '22023';
  end if;
  if p_status not in ('in_progress', 'completed', 'absent', 'failed') then
    raise exception 'Unsupported voice recording status: %', p_status using errcode = '22023';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'Voice recording duration must be non-negative' using errcode = '22023';
  end if;
  if p_channels is not null and p_channels not in (1, 2) then
    raise exception 'Voice recording channels must be one or two' using errcode = '22023';
  end if;
  if p_track is not null and p_track not in ('inbound', 'outbound', 'both') then
    raise exception 'Unsupported voice recording track: %', p_track using errcode = '22023';
  end if;
  if p_status = 'completed' and nullif(btrim(p_provider_media_url), '') is null then
    raise exception 'Completed voice recording evidence requires a provider media URL'
      using errcode = '22023';
  end if;

  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical voice interaction matches the exact provider account and call'
      using errcode = 'P0002';
  end if;

  select a.* into v_existing
  from platform.activity_log a
  where a.action = 'voice.recording.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.metadata ->> 'provider' is distinct from p_provider
       or v_existing.metadata ->> 'provider_account_id' is distinct from p_provider_account_id
       or v_existing.metadata ->> 'provider_call_id' is distinct from p_provider_call_id
       or v_existing.metadata ->> 'provider_recording_id' is distinct from p_provider_recording_id
       or v_existing.metadata ->> 'status' is distinct from p_status
       or (v_existing.metadata ->> 'recording_started_at')::timestamptz
          is distinct from p_recording_started_at
       or (v_existing.metadata ->> 'duration_seconds')::integer
          is distinct from p_duration_seconds
       or (v_existing.metadata ->> 'channels')::smallint is distinct from p_channels
       or v_existing.metadata ->> 'source' is distinct from p_source
       or v_existing.metadata ->> 'track' is distinct from p_track
       or v_existing.metadata ->> 'provider_media_url' is distinct from p_provider_media_url then
      raise exception 'Voice recording provider event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query select
      v_interaction.id,
      v_existing.id,
      'replay'::text,
      v_interaction.recording_status;
    return;
  end if;

  if v_interaction.provider_recording_id is not null
     and v_interaction.provider_recording_id <> p_provider_recording_id then
    raise exception 'Canonical voice interaction is already bound to a different recording'
      using errcode = '23505';
  end if;

  if v_interaction.recording_status in ('completed', 'absent', 'failed') then
    v_disposition := 'ignored_terminal';
  elsif v_interaction.recording_status = p_status then
    v_disposition := 'ignored_duplicate_state';
  else
    v_disposition := 'applied';
    update crm.interaction
    set provider_recording_id = p_provider_recording_id,
        recording_status = p_status,
        recording_started_at = coalesce(recording_started_at, p_recording_started_at),
        recording_status_at = now(),
        recording_duration_seconds = case
          when p_status = 'completed' then p_duration_seconds
          else recording_duration_seconds
        end,
        recording_channels = coalesce(p_channels, recording_channels),
        recording_source = coalesce(p_source, recording_source),
        recording_track = coalesce(p_track, recording_track)
    where id = v_interaction.id
    returning * into v_interaction;
  end if;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.recording.lifecycle',
    null,
    now(),
    jsonb_strip_nulls(jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_recording_id', p_provider_recording_id,
      'provider_event_key', p_provider_event_key,
      'status', p_status,
      'recording_started_at', p_recording_started_at,
      'duration_seconds', p_duration_seconds,
      'channels', p_channels,
      'source', p_source,
      'track', p_track,
      'provider_media_url', p_provider_media_url,
      'disposition', v_disposition
    ))
  ) returning id into v_event_id;

  return query select
    v_interaction.id,
    v_event_id,
    v_disposition,
    v_interaction.recording_status;
end;
$$;

create or replace function communication.finalize_voice_recording_file(
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_provider_recording_id text,
  p_source_event_key text,
  p_file_id uuid
)
returns table (
  interaction_id uuid,
  canonical_file_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_file files.files%rowtype;
  v_source_event platform.activity_log%rowtype;
  v_event_key text;
begin
  select i.* into v_interaction
  from crm.interaction i
  where i.channel_code = 'call'
    and i.provider = p_provider
    and i.provider_account_id = p_provider_account_id
    and i.provider_interaction_id = p_provider_call_id
    and i.provider_recording_id = p_provider_recording_id
    and i.deleted_at is null
  for update;
  if not found then
    raise exception 'No exact completed voice recording interaction is available for file binding'
      using errcode = 'P0002';
  end if;
  if v_interaction.recording_status <> 'completed' then
    raise exception 'Voice recording must be completed before canonical file binding'
      using errcode = '55000';
  end if;

  select a.* into v_source_event
  from platform.activity_log a
  where a.entity_type = 'crm_interaction'
    and a.entity_id = v_interaction.id
    and a.action = 'voice.recording.lifecycle'
    and a.metadata ->> 'provider_event_key' = p_source_event_key
    and a.metadata ->> 'provider' = p_provider
    and a.metadata ->> 'provider_account_id' = p_provider_account_id
    and a.metadata ->> 'provider_call_id' = p_provider_call_id
    and a.metadata ->> 'provider_recording_id' = p_provider_recording_id
    and a.metadata ->> 'status' = 'completed';
  if not found then
    raise exception 'Canonical file binding lacks exact completed provider evidence'
      using errcode = '23503';
  end if;

  select f.* into v_file
  from files.files f
  where f.id = p_file_id and f.deleted_at is null;
  if not found then
    raise exception 'Canonical recording file does not exist' using errcode = '23503';
  end if;
  if v_file.organization_id is distinct from v_interaction.organization_id
     or v_file.created_by is distinct from v_interaction.recording_owner_id then
    raise exception 'Canonical recording file owner or organization does not match the call'
      using errcode = '42501';
  end if;
  if v_interaction.recording_file_id is not null then
    if v_interaction.recording_file_id is distinct from p_file_id then
      raise exception 'Voice recording is already bound to a different canonical file'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, p_file_id, 'replay'::text;
    return;
  end if;

  update crm.interaction
  set recording_file_id = p_file_id,
      recording_custody_at = now()
  where id = v_interaction.id;

  v_event_key := 'custody:' || p_source_event_key;
  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.recording.custody',
    null,
    now(),
    jsonb_build_object(
      'provider', p_provider,
      'provider_account_id', p_provider_account_id,
      'provider_call_id', p_provider_call_id,
      'provider_recording_id', p_provider_recording_id,
      'provider_event_key', v_event_key,
      'source_event_key', p_source_event_key,
      'canonical_file_id', p_file_id
    )
  );

  return query select v_interaction.id, p_file_id, 'bound'::text;
end;
$$;

create or replace function communication.voice_recording_persistence_readiness()
returns table (
  schema_ready boolean,
  provider_identity_unique boolean,
  event_idempotency_ready boolean,
  call_claim_ready boolean,
  recording_claim_ready boolean,
  file_binding_ready boolean,
  ambiguous_call_count bigint,
  provider_url_violation_count bigint,
  ready boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with checks as (
    select
      (
        select count(*) = 18
        from information_schema.columns c
        where c.table_schema = 'crm'
          and c.table_name = 'interaction'
          and c.column_name in (
            'provider', 'provider_account_id', 'provider_interaction_id',
            'provider_status', 'provider_status_sequence', 'provider_status_at',
            'program_key', 'recording_owner_id', 'provider_recording_id',
            'recording_status', 'recording_started_at', 'recording_status_at',
            'recording_duration_seconds', 'recording_channels', 'recording_source',
            'recording_track', 'recording_file_id', 'recording_custody_at'
          )
      ) as schema_ready,
      to_regclass('crm.interaction_voice_provider_identity_uidx') is not null
        as provider_identity_unique,
      to_regclass('platform.activity_log_voice_provider_event_key_uidx') is not null
        as event_idempotency_ready,
      to_regprocedure(
        'communication.claim_voice_call_lifecycle_event(text,text,text,text,integer,text,timestamp with time zone)'
      ) is not null as call_claim_ready,
      to_regprocedure(
        'communication.claim_voice_recording_lifecycle_event(text,text,text,text,text,text,timestamp with time zone,integer,smallint,text,text,text)'
      ) is not null as recording_claim_ready,
      to_regprocedure(
        'communication.finalize_voice_recording_file(text,text,text,text,text,uuid)'
      ) is not null as file_binding_ready,
      (
        select count(*)
        from (
          select i.provider, i.provider_account_id, i.provider_interaction_id
          from crm.interaction i
          where i.channel_code = 'call' and i.deleted_at is null
          group by i.provider, i.provider_account_id, i.provider_interaction_id
          having count(*) > 1
        ) duplicates
      ) as ambiguous_call_count,
      (
        select count(*)
        from crm.interaction i
        where i.channel_code = 'call'
          and i.deleted_at is null
          and i.recording_url is not null
      ) as provider_url_violation_count
  )
  select
    checks.schema_ready,
    checks.provider_identity_unique,
    checks.event_idempotency_ready,
    checks.call_claim_ready,
    checks.recording_claim_ready,
    checks.file_binding_ready,
    checks.ambiguous_call_count,
    checks.provider_url_violation_count,
    checks.schema_ready
      and checks.provider_identity_unique
      and checks.event_idempotency_ready
      and checks.call_claim_ready
      and checks.recording_claim_ready
      and checks.file_binding_ready
      and checks.ambiguous_call_count = 0
      and checks.provider_url_violation_count = 0 as ready
  from checks;
$$;

revoke all on function communication.register_voice_call_interaction(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function communication.claim_voice_call_lifecycle_event(
  text, text, text, text, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function communication.claim_voice_recording_lifecycle_event(
  text, text, text, text, text, text, timestamptz, integer, smallint, text, text, text
) from public, anon, authenticated;
revoke all on function communication.finalize_voice_recording_file(
  text, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function communication.voice_recording_persistence_readiness()
  from public, anon, authenticated;

grant execute on function communication.register_voice_call_interaction(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function communication.claim_voice_call_lifecycle_event(
  text, text, text, text, integer, text, timestamptz
) to service_role;
grant execute on function communication.claim_voice_recording_lifecycle_event(
  text, text, text, text, text, text, timestamptz, integer, smallint, text, text, text
) to service_role;
grant execute on function communication.finalize_voice_recording_file(
  text, text, text, text, text, uuid
) to service_role;
grant execute on function communication.voice_recording_persistence_readiness()
  to service_role;
