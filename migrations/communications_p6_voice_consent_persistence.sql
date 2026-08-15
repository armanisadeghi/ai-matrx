-- P6 Voice: exact CRM identity resolution and durable affirmative consent.
--
-- Reuses the normal AI Matrx CRM tenant, crm.interaction, and
-- platform.activity_log. The webhook can resolve only an already-enrolled,
-- already-claimed, already-verified caller; it never creates identity here.

create unique index if not exists activity_log_voice_consent_event_key_uidx
  on platform.activity_log ((metadata ->> 'provider_event_key'))
  where action = 'voice.call.consent'
    and nullif(metadata ->> 'provider_event_key', '') is not null;

create or replace function communication.resolve_voice_owner_call_context(
  p_program_key text,
  p_destination_id uuid,
  p_provider text,
  p_provider_account_id text,
  p_caller_phone text,
  p_called_phone text
)
returns table (
  party_id uuid,
  contact_point_id uuid,
  organization_id uuid,
  recording_owner_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
  v_candidate_count bigint;
  v_party_id uuid;
  v_contact_point_id uuid;
  v_owner_id uuid;
begin
  if nullif(btrim(p_program_key), '') is null
     or p_destination_id is null
     or nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or p_caller_phone !~ '^\+[1-9][0-9]{6,14}$'
     or p_called_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Voice owner call context requires exact canonical identity inputs'
      using errcode = '22023';
  end if;

  select
    count(*),
    (array_agg(candidate.party_id order by candidate.party_id))[1],
    (array_agg(candidate.contact_point_id order by candidate.party_id))[1],
    (array_agg(candidate.owner_id order by candidate.party_id))[1]
  into v_candidate_count, v_party_id, v_contact_point_id, v_owner_id
  from (
    select distinct
      party.id as party_id,
      point.id as contact_point_id,
      party.claimed_by as owner_id
    from communication.sms_phone_numbers destination
    join communication.sms_notification_preferences preference
      on preference.assistant_destination_id = destination.id
     and preference.assistant_program_key = destination.program_key
     and preference.phone_number = p_caller_phone
     and preference.user_id is not null
     and preference.deleted_at is null
    join auth.users owner_user
      on owner_user.id = preference.user_id
     and owner_user.is_anonymous is false
    join crm.party party
      on party.organization_id = v_ai_matrx_org
     and party.claimed_by = preference.user_id
     and party.party_kind = 'person'
     and party.canonical_id is null
     and party.deleted_at is null
    join crm.contact_medium medium
      on medium.organization_id = party.organization_id
     and medium.channel = 'phone'
     and coalesce(medium.platform_slug, '') = ''
     and medium.value_key = p_caller_phone
     and medium.verification_status = 'verified'
     and medium.deleted_at is null
    join crm.party_contact_point point
      on point.party_id = party.id
     and point.medium_id = medium.id
     and point.organization_id = party.organization_id
     and point.deleted_at is null
    where destination.id = p_destination_id
      and destination.program_key = p_program_key
      and destination.provider = p_provider
      and destination.provider_account_id = p_provider_account_id
      and destination.phone_number = p_called_phone
      and destination.is_active is true
      and destination.deleted_at is null
      and iam.is_org_member(preference.user_id, v_ai_matrx_org)
  ) candidate;

  if v_candidate_count = 0 then
    raise exception 'No exact pre-existing AI Matrx CRM caller context matched'
      using errcode = 'P0002';
  end if;
  if v_candidate_count <> 1 then
    raise exception 'AI Matrx CRM caller context is ambiguous'
      using errcode = '23505';
  end if;

  return query
    select v_party_id, v_contact_point_id, v_ai_matrx_org, v_owner_id;
end;
$$;

create or replace function communication.claim_voice_call_consent_event(
  p_provider text,
  p_provider_account_id text,
  p_provider_call_id text,
  p_provider_event_key text,
  p_program_key text,
  p_disclosure_version text,
  p_disclosure_text_hash text,
  p_disclosed_at timestamptz,
  p_response_kind text,
  p_response_value text,
  p_consented_at timestamptz,
  p_source text
)
returns table (
  interaction_id uuid,
  event_id bigint,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interaction crm.interaction%rowtype;
  v_existing platform.activity_log%rowtype;
  v_event_id bigint;
  v_evidence jsonb;
begin
  if nullif(btrim(p_provider), '') is null
     or nullif(btrim(p_provider_account_id), '') is null
     or nullif(btrim(p_provider_call_id), '') is null
     or nullif(btrim(p_provider_event_key), '') is null
     or nullif(btrim(p_program_key), '') is null
     or nullif(btrim(p_disclosure_version), '') is null
     or p_disclosure_text_hash !~ '^sha256:[0-9a-f]{64}$'
     or p_disclosed_at is null
     or p_consented_at is null
     or p_consented_at < p_disclosed_at
     or p_response_kind not in ('dtmf', 'speech', 'continued_after_disclosure')
     or nullif(btrim(p_response_value), '') is null
     or p_source not in ('twiml', 'conversation_relay') then
    raise exception 'Complete affirmative Voice consent evidence is required'
      using errcode = '22023';
  end if;

  select interaction.* into v_interaction
  from crm.interaction interaction
  where interaction.channel_code = 'call'
    and interaction.provider = p_provider
    and interaction.provider_account_id = p_provider_account_id
    and interaction.provider_interaction_id = p_provider_call_id
    and interaction.program_key = p_program_key
    and interaction.deleted_at is null
  for update;
  if not found then
    raise exception 'No canonical Voice interaction matches the exact call and program'
      using errcode = 'P0002';
  end if;

  v_evidence := jsonb_build_object(
    'provider', p_provider,
    'provider_account_id', p_provider_account_id,
    'provider_call_id', p_provider_call_id,
    'provider_event_key', p_provider_event_key,
    'program_key', p_program_key,
    'disclosure_version', p_disclosure_version,
    'disclosure_text_hash', p_disclosure_text_hash,
    'disclosed_at', p_disclosed_at,
    'response_kind', p_response_kind,
    'response_value', p_response_value,
    'consented', true,
    'consented_at', p_consented_at,
    'source', p_source
  );

  select activity.* into v_existing
  from platform.activity_log activity
  where activity.action = 'voice.call.consent'
    and activity.metadata ->> 'provider_event_key' = p_provider_event_key;
  if found then
    if v_existing.entity_id is distinct from v_interaction.id
       or v_existing.organization_id is distinct from v_interaction.organization_id
       or v_existing.metadata is distinct from v_evidence then
      raise exception 'Voice consent event key was replayed with different evidence'
        using errcode = '23505';
    end if;
    return query select v_interaction.id, v_existing.id, 'replay'::text;
    return;
  end if;

  if v_interaction.attributes ? 'voice_consent'
     and v_interaction.attributes -> 'voice_consent' is distinct from v_evidence then
    raise exception 'Voice interaction already carries different consent evidence'
      using errcode = '23505';
  end if;

  update crm.interaction
  set attributes = jsonb_set(
        coalesce(attributes, '{}'::jsonb),
        '{voice_consent}',
        v_evidence,
        true
      )
  where id = v_interaction.id;

  insert into platform.activity_log (
    organization_id, entity_type, entity_id, action, actor_id, occurred_at, metadata
  ) values (
    v_interaction.organization_id,
    'crm_interaction',
    v_interaction.id,
    'voice.call.consent',
    v_interaction.recording_owner_id,
    p_consented_at,
    v_evidence
  ) returning id into v_event_id;

  return query select v_interaction.id, v_event_id, 'created'::text;
end;
$$;

create or replace function communication.voice_call_consent_persistence_readiness(
  p_program_key text default 'ai_matrx_owner_beta'
)
returns table (
  resolver_ready boolean,
  registration_ready boolean,
  consent_claim_ready boolean,
  event_idempotency_ready boolean,
  canonical_identity_binding_count bigint,
  ready boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with checks as (
    select
      to_regprocedure(
        'communication.resolve_voice_owner_call_context(text,uuid,text,text,text,text)'
      ) is not null as resolver_ready,
      to_regprocedure(
        'communication.register_voice_call_interaction(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone)'
      ) is not null as registration_ready,
      to_regprocedure(
        'communication.claim_voice_call_consent_event(text,text,text,text,text,text,text,timestamp with time zone,text,text,timestamp with time zone,text)'
      ) is not null as consent_claim_ready,
      to_regclass('platform.activity_log_voice_consent_event_key_uidx') is not null
        as event_idempotency_ready,
      (
        select count(*)
        from communication.sms_phone_numbers destination
        join communication.sms_notification_preferences preference
          on preference.assistant_destination_id = destination.id
         and preference.assistant_program_key = destination.program_key
         and preference.phone_number is not null
         and preference.user_id is not null
         and preference.deleted_at is null
        join auth.users owner_user
          on owner_user.id = preference.user_id
         and owner_user.is_anonymous is false
        join crm.party party
          on party.organization_id = '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid
         and party.claimed_by = preference.user_id
         and party.party_kind = 'person'
         and party.canonical_id is null
         and party.deleted_at is null
        join crm.contact_medium medium
          on medium.organization_id = party.organization_id
         and medium.channel = 'phone'
         and coalesce(medium.platform_slug, '') = ''
         and medium.value_key = preference.phone_number
         and medium.verification_status = 'verified'
         and medium.deleted_at is null
        join crm.party_contact_point point
          on point.party_id = party.id
         and point.medium_id = medium.id
         and point.organization_id = party.organization_id
         and point.deleted_at is null
        where destination.program_key = p_program_key
          and destination.is_active is true
          and destination.deleted_at is null
          and iam.is_org_member(
            preference.user_id,
            '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid
          )
      ) as canonical_identity_binding_count
  )
  select
    checks.resolver_ready,
    checks.registration_ready,
    checks.consent_claim_ready,
    checks.event_idempotency_ready,
    checks.canonical_identity_binding_count,
    checks.resolver_ready
      and checks.registration_ready
      and checks.consent_claim_ready
      and checks.event_idempotency_ready
      and checks.canonical_identity_binding_count = 1 as ready
  from checks;
$$;

revoke all on function communication.resolve_voice_owner_call_context(
  text, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function communication.claim_voice_call_consent_event(
  text, text, text, text, text, text, text, timestamptz, text, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function communication.voice_call_consent_persistence_readiness(text)
  from public, anon, authenticated;

grant execute on function communication.resolve_voice_owner_call_context(
  text, uuid, text, text, text, text
) to service_role;
grant execute on function communication.claim_voice_call_consent_event(
  text, text, text, text, text, text, text, timestamptz, text, text, timestamptz, text
) to service_role;
grant execute on function communication.voice_call_consent_persistence_readiness(text)
  to service_role;

