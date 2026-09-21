-- A CALL LANDS IN THE ORGANIZATION THE ENROLLMENT NAMES — never a hardcoded tenant.
--
-- based-on: communication.resolve_voice_owner_call_context(text, uuid, text, text, text, text) 7f8bd2abf640e1b0a4ff5b08829d39f68378e2a548cb72cb6ed98e6db116c9cf
-- based-on: communication.voice_call_consent_persistence_readiness(text) 705f2d360e268659706e58ef81505dcd33c04d92d9b9224ab85d23b6bc1eb2fb
--
-- THE DEFECT (measured live 2026-09-21 against db.matrxserver.com).
--
-- `communication.resolve_voice_owner_call_context` declared
--
--     v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'
--
-- and returned it as the call's organization, ignoring the organization on the
-- very enrollment row it had just joined. The SMS ingress derives the same
-- turn's organization from `preference.organization_id`
-- (matrx-frontend `lib/sms/receive.ts:421,529`). For the designated handset
-- `+1 949 807 2145` (admin@admin.com, user `87a6e699…`) those two answers were
-- DIFFERENT organizations: the enrollment says `884d1ce8…`, the resolver said
-- `5dc930e9…`.
--
-- The personal staff thread id is `uuid5(user, organization)`
-- (`aidream/services/personal_staff/thread.py`), so the two channels computed
-- two different conversations for one person:
--
--     text  -> 3af9e95c-699d-5e78-a506-736e4768273e   (org 884d1ce8…)
--     call  -> 8f695cf6-0bc4-5c85-b2c5-7eda0acfbc5c   (org 5dc930e9…)
--
-- One person, one staff member, two memories. That is the whole contract the
-- staff channel exists to deliver, broken by one constant.
--
-- THE FIX. The organization is READ from the enrollment row, exactly as the
-- SMS ingress reads it, and every identity join is narrowed to THAT
-- organization: the party, its verified phone medium, its contact point and
-- the membership check. The resolver keeps every other refusal it had — one
-- exact candidate or nothing — so it is no less strict than before; it is
-- strict about the right tenant.
--
-- WHY THE READINESS FUNCTION IS IN THE SAME FILE. It counted canonical
-- identity bindings through the same literal, so after this change it would
-- have reported readiness for a tenant the resolver no longer uses — a green
-- light measuring the wrong thing. The spoken contract and the meter must
-- never disagree; they change in one edit.
--
-- NOTHING IS DELETED AND NOTHING IS MIGRATED HERE. The conversations already
-- minted under the old organization keep every row and every `/chat/<id>`
-- door; they are linked forward by
-- `aidream/scripts/link_voice_threads_onto_one_staff_thread.py`.

set lock_timeout = '60s';
set statement_timeout = '10min';

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
as $function$
declare
  v_candidate_count bigint;
  v_party_id uuid;
  v_contact_point_id uuid;
  v_organization_id uuid;
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
    (array_agg(candidate.organization_id order by candidate.party_id))[1],
    (array_agg(candidate.owner_id order by candidate.party_id))[1]
  into
    v_candidate_count,
    v_party_id,
    v_contact_point_id,
    v_organization_id,
    v_owner_id
  from (
    select distinct
      party.id as party_id,
      point.id as contact_point_id,
      -- 🚨 THE ORGANIZATION IS THE ENROLLMENT'S, NOT A CONSTANT. This is the
      -- one line the SMS ingress and the voice ingress have to agree on, and
      -- it is why a text and a call now open the same conversation.
      preference.organization_id as organization_id,
      party.claimed_by as owner_id
    from communication.sms_phone_numbers destination
    join communication.sms_notification_preferences preference
      on preference.assistant_destination_id = destination.id
     and preference.assistant_program_key = destination.program_key
     and preference.phone_number = p_caller_phone
     and preference.user_id is not null
     and preference.organization_id is not null
     and preference.deleted_at is null
    join auth.users owner_user
      on owner_user.id = preference.user_id
     and owner_user.is_anonymous is false
    join crm.party party
      on party.organization_id = preference.organization_id
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
      and iam.is_org_member(preference.user_id, preference.organization_id)
  ) candidate;

  if v_candidate_count = 0 then
    raise exception 'No exact pre-existing enrolled CRM caller context matched'
      using errcode = 'P0002';
  end if;
  if v_candidate_count <> 1 then
    raise exception 'Enrolled CRM caller context is ambiguous'
      using errcode = '23505';
  end if;

  return query
    select v_party_id, v_contact_point_id, v_organization_id, v_owner_id;
end;
$function$;

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
        'communication.register_voice_call_interaction(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'
      ) is not null as registration_ready,
      to_regprocedure(
        'communication.claim_voice_call_consent_event(text,text,text,text,text,text,text,timestamptz,text,text,timestamptz,text)'
      ) is not null as consent_claim_ready,
      exists (
        select 1
        from pg_catalog.pg_indexes idx
        where idx.schemaname = 'platform'
          and idx.indexname = 'activity_log_voice_consent_event_key_uidx'
      ) as event_idempotency_ready,
      (
        select count(*)
        from communication.sms_phone_numbers destination
        join communication.sms_notification_preferences preference
          on preference.assistant_destination_id = destination.id
         and preference.assistant_program_key = destination.program_key
         and preference.user_id is not null
         and preference.organization_id is not null
         and preference.deleted_at is null
        join crm.party party
          on party.organization_id = preference.organization_id
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
          and iam.is_org_member(preference.user_id, preference.organization_id)
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
      and checks.canonical_identity_binding_count > 0
  from checks;
$$;

-- ── WHO MAY CALL THESE, IN DATA ─────────────────────────────────────────────
--
-- Both are SECURITY DEFINER and predate `platform.client_callable_door`, so
-- replacing a body now incurs the provision-shape debt. Neither has ever had a
-- client caller and neither may acquire one: both are reached only by the
-- Next.js voice webhook lane through `createAdminClient()`
-- (`lib/communications/voice/persistence.ts`).
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes,
  reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers
)
select
  'communication',
  'resolve_voice_owner_call_context',
  'p_program_key text, p_destination_id uuid, p_provider text, p_provider_account_id text, p_caller_phone text, p_called_phone text',
  array['text','uuid','text','text','text','text']::regtype[]::oid[],
  'p_destination_id is checked against communication.sms_phone_numbers: it must be the active, non-deleted destination row whose program_key, provider, provider_account_id and phone_number all equal the other arguments, so a guessed id resolves nothing. It is NOT NULL-tolerant — a null destination raises 22023 before any read. Every other argument is a provider-supplied string matched exactly; no argument selects a tenant, because the organization is read from the matched enrollment row.',
  'voice_lands_in_the_organization_the_enrollment_names.sql',
  'server_only: called by the Next.js Twilio voice webhook (matrx-frontend lib/communications/voice/persistence.ts, through createAdminClient) to resolve an already-enrolled caller before a call is accepted. No client may ever call it: a browser reaching it could enumerate which phone numbers are enrolled and which people and organizations they belong to, by trying numbers.',
  false,
  false
where not exists (
  select 1 from platform.client_callable_door d
  where d.schema_name = 'communication'
    and d.function_name = 'resolve_voice_owner_call_context'
);

insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes,
  reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers
)
select
  'communication',
  'voice_call_consent_persistence_readiness',
  'p_program_key text',
  array['text']::regtype[]::oid[],
  'There is no entity-id argument. p_program_key is a sender-program name matched exactly against communication.sms_phone_numbers.program_key; an unknown name simply counts zero bindings. Null is not special-cased because the parameter carries a default and a null program matches no destination row.',
  'voice_lands_in_the_organization_the_enrollment_names.sql',
  'server_only: called by the Next.js voice readiness probe (matrx-frontend lib/communications/voice/persistence.ts, through createAdminClient) to report whether the voice consent path is installed. No client may ever call it: its binding count tells an outsider how many people are enrolled on a sender program.',
  false,
  false
where not exists (
  select 1 from platform.client_callable_door d
  where d.schema_name = 'communication'
    and d.function_name = 'voice_call_consent_persistence_readiness'
);
