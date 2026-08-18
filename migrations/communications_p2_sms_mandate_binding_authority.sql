-- Make the Mandate system the identity authority for the owner SMS assistant.
-- This migration is additive-first for live traffic: the legacy configure RPCs
-- remain callable until the frontend cutover is promoted, but the durable worker
-- no longer requires a transport-conversation agent snapshot.

set lock_timeout = '8s';

insert into agent.mandate (
  mandate_key,
  label,
  description,
  input_kind,
  output_kind,
  contract,
  default_agent_id,
  default_agent_version_id,
  use_latest,
  is_enabled,
  organization_id,
  metadata,
  visibility
)
select
  'sms.owner_beta',
  'SMS Owner Beta',
  'Runs the saved AI Matrx agent used for the owner-only SMS assistant.',
  voice.input_kind,
  'text',
  '{}'::jsonb,
  voice.default_agent_id,
  voice.default_agent_version_id,
  voice.use_latest,
  true,
  voice.organization_id,
  jsonb_build_object('declared_by', 'aidream.services.communications.mandates'),
  'public'::platform.visibility
from agent.mandate voice
where voice.mandate_key = 'voice.owner_beta'
  and voice.deleted_at is null
  and not exists (
    select 1
    from agent.mandate existing
    where existing.mandate_key = 'sms.owner_beta'
      and existing.deleted_at is null
  );

do $$
declare
  mandate_count integer;
begin
  select count(*) into mandate_count
  from agent.mandate
  where mandate_key = 'sms.owner_beta'
    and deleted_at is null
    and is_enabled;
  if mandate_count <> 1 then
    raise exception 'sms.owner_beta must resolve to exactly one enabled Mandate, found %', mandate_count;
  end if;
end;
$$;

-- Preserve every existing explicit SMS choice as that person's canonical user
-- Binding. Existing Bindings win; this backfill never overwrites a newer choice.
insert into agent.mandate_binding (
  mandate_id,
  principal_type,
  subject_user_id,
  agent_id,
  agent_version_id,
  use_latest,
  config_overrides,
  is_enabled,
  organization_id,
  created_by,
  updated_by,
  metadata,
  visibility
)
select
  mandate.id,
  'user',
  preference.user_id,
  preference.preferred_agent_id,
  preference.preferred_agent_version_id,
  preference.preferred_agent_version_id is null,
  null,
  true,
  preference.organization_id,
  preference.user_id,
  preference.user_id,
  jsonb_build_object(
    'migration', 'communications_p2_sms_mandate_binding_authority',
    'source_preference_id', preference.id
  ),
  'internal'::platform.visibility
from communication.sms_notification_preferences preference
join agent.mandate mandate
  on mandate.mandate_key = 'sms.owner_beta'
 and mandate.deleted_at is null
where preference.deleted_at is null
  and preference.assistant_program_key = 'ai_matrx_owner_beta'
  and preference.preferred_agent_id is not null
  and not exists (
    select 1
    from agent.mandate_binding existing
    where existing.mandate_id = mandate.id
      and existing.principal_type = 'user'
      and existing.subject_user_id = preference.user_id
      and existing.deleted_at is null
  );

create or replace function communication.set_my_sms_assistant_enabled(
  p_program_key text,
  p_enabled boolean
)
returns table (
  destination_id uuid,
  masked_phone text,
  program_key text,
  number_active boolean,
  global_assistant_enabled boolean,
  verified_user_phone text,
  sms_enabled boolean,
  user_assistant_enabled boolean,
  preferred_agent_id uuid,
  preferred_agent_version_id uuid,
  sms_conversation_id uuid,
  chat_conversation_id uuid,
  identity_status text,
  consent_status text,
  ready boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  updated_count integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from agent.mandate mandate
    where mandate.mandate_key = 'sms.owner_beta'
      and mandate.is_enabled
      and mandate.deleted_at is null
  ) then
    raise exception 'SMS assistant Mandate is unavailable' using errcode = '55000';
  end if;

  update communication.sms_notification_preferences preference
  set ai_agent_messages = coalesce(p_enabled, false),
      updated_by = caller,
      updated_at = now()
  where preference.user_id = caller
    and preference.assistant_program_key = p_program_key
    and preference.assistant_destination_id is not null
    and preference.deleted_at is null;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'SMS preferences and program must already be explicitly bound'
      using errcode = 'P0002';
  elsif updated_count > 1 then
    raise exception 'SMS assistant program binding is ambiguous' using errcode = '21000';
  end if;

  return query
  select * from communication.get_my_sms_assistant_program(p_program_key);
end;
$$;

revoke execute on function communication.set_my_sms_assistant_enabled(text, boolean)
  from public, anon;
grant execute on function communication.set_my_sms_assistant_enabled(text, boolean)
  to authenticated;

comment on function communication.set_my_sms_assistant_enabled(text, boolean) is
  'Toggles SMS assistant delivery only. Agent identity resolves exclusively through sms.owner_beta Mandate Bindings.';

-- A transport row no longer needs to carry an agent identity before it can be
-- claimed. The aidream worker resolves sms.owner_beta for the exact user/org.
create or replace function communication.claim_pending_sms_agent_turns(
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
    raise exception 'worker id is required';
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
      and m.next_attempt_at <= now()
      and m.ai_processing_status = 'pending'
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and p.is_active
      and p.assistant_enabled
      and p.deleted_at is null
      and nullif(btrim(coalesce(m.body, '')), '') is not null
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
    returning m.*
  )
  select
    claimed.id,
    c.id,
    c.chat_conversation_id,
    not exists (
      select 1 from chat.conversation chat_row
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

revoke execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  from public, anon, authenticated;
grant execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  to service_role;

comment on function communication.claim_pending_sms_agent_turns(text, integer, integer) is
  'Claims resolved inbound SMS turns without trusting a stored agent pointer; aidream resolves sms.owner_beta for the exact user and organization.';
