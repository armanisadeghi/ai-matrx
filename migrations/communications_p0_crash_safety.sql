-- Communications P0 corrective migration: canonical agent FKs and no unsafe replay.
-- Replay-safe by construction. The assistant kill switch remains disabled during rollout.

alter table communication.sms_notification_preferences
  add column if not exists preferred_agent_id uuid,
  add column if not exists preferred_agent_version_id uuid;

alter table communication.sms_conversations
  add column if not exists agent_id uuid,
  add column if not exists canonical_agent_version_id uuid;

alter table communication.sms_messages
  add column if not exists outcome_uncertain_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_notification_preferences_preferred_agent_id_fkey'
      and conrelid = 'communication.sms_notification_preferences'::regclass
  ) then
    alter table communication.sms_notification_preferences
      add constraint sms_notification_preferences_preferred_agent_id_fkey
      foreign key (preferred_agent_id) references agent.definition(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_notification_preferences_preferred_agent_version_id_fkey'
      and conrelid = 'communication.sms_notification_preferences'::regclass
  ) then
    alter table communication.sms_notification_preferences
      add constraint sms_notification_preferences_preferred_agent_version_id_fkey
      foreign key (preferred_agent_version_id)
      references agent.definition_version(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_conversations_agent_id_fkey'
      and conrelid = 'communication.sms_conversations'::regclass
  ) then
    alter table communication.sms_conversations
      add constraint sms_conversations_agent_id_fkey
      foreign key (agent_id) references agent.definition(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_conversations_canonical_agent_version_id_fkey'
      and conrelid = 'communication.sms_conversations'::regclass
  ) then
    alter table communication.sms_conversations
      add constraint sms_conversations_canonical_agent_version_id_fkey
      foreign key (canonical_agent_version_id)
      references agent.definition_version(id) on delete set null;
  end if;
end;
$$;

-- Backfill only values that are valid UUIDs and resolve to the canonical agent tables.
update communication.sms_notification_preferences pref
set preferred_agent_id = legacy.id
from agent.definition legacy
where pref.preferred_agent_id is null
  and pref.preferred_ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and legacy.id = pref.preferred_ai_agent_id::uuid;

update communication.sms_notification_preferences pref
set preferred_agent_version_id = legacy.id,
    preferred_agent_id = coalesce(pref.preferred_agent_id, legacy.agent_id)
from agent.definition_version legacy
where pref.preferred_agent_version_id is null
  and pref.preferred_ai_agent_version_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and legacy.id = pref.preferred_ai_agent_version_id::uuid;

update communication.sms_conversations c
set agent_id = legacy.id
from agent.definition legacy
where c.agent_id is null
  and c.ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and legacy.id = c.ai_agent_id::uuid;

update communication.sms_conversations c
set canonical_agent_version_id = legacy.id,
    agent_id = coalesce(c.agent_id, legacy.agent_id)
from agent.definition_version legacy
where c.canonical_agent_version_id is null
  and c.agent_version_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and legacy.id = c.agent_version_id::uuid;

create or replace function communication.sms_fill_canonical_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  destination communication.sms_phone_numbers%rowtype;
  preference communication.sms_notification_preferences%rowtype;
begin
  select p.* into destination
  from communication.sms_phone_numbers p
  where p.phone_number = new.our_phone_number
    and p.provider = new.provider
    and p.is_active
    and p.deleted_at is null
  limit 1;

  if new.user_id is not null then
    select pref.* into preference
    from communication.sms_notification_preferences pref
    where pref.user_id = new.user_id
      and pref.phone_number = new.external_phone_number
      and pref.deleted_at is null
    limit 1;
  end if;

  new.provider_account_id := coalesce(new.provider_account_id, destination.provider_account_id);
  new.destination_identity_id := coalesce(new.destination_identity_id, destination.id);
  new.program_key := coalesce(new.program_key, destination.program_key);
  new.chat_conversation_id := coalesce(new.chat_conversation_id, gen_random_uuid());
  new.agent_id := coalesce(new.agent_id, preference.preferred_agent_id);
  new.canonical_agent_version_id := coalesce(
    new.canonical_agent_version_id,
    preference.preferred_agent_version_id
  );
  if new.identity_status = 'unresolved' then
    new.identity_status := case
      when new.user_id is not null and destination.id is not null then 'resolved'
      else 'not_found'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_conversations_fill_canonical_context
  on communication.sms_conversations;
create trigger sms_conversations_fill_canonical_context
before insert on communication.sms_conversations
for each row execute function communication.sms_fill_canonical_context();

drop function if exists communication.claim_pending_sms_agent_turns(text, integer, integer);
create function communication.claim_pending_sms_agent_turns(
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
      and c.agent_id is not null
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

drop function if exists communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer
);
create function communication.finalize_sms_agent_turn(
  p_inbound_message_id uuid,
  p_worker_id text,
  p_status text,
  p_request_id uuid default null,
  p_reply text default null,
  p_error_code text default null,
  p_operator_detail text default null,
  p_execution_known_not_started boolean default false,
  p_retry_after_seconds integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbound communication.sms_messages%rowtype;
  outbound_id uuid;
  terminal_status text;
begin
  if p_status not in ('completed', 'duplicate', 'retry', 'failed', 'disabled') then
    raise exception 'unsupported SMS agent result status: %', p_status;
  end if;

  select m.* into inbound
  from communication.sms_messages m
  where m.id = p_inbound_message_id
  for update;
  if not found or inbound.direction <> 'inbound' then
    raise exception 'inbound SMS message not found';
  end if;
  if inbound.ai_processing_status <> 'processing'
     or inbound.processing_worker_id is distinct from p_worker_id then
    raise exception 'SMS agent turn is not leased by this worker';
  end if;

  if p_status = 'completed' and nullif(btrim(coalesce(p_reply, '')), '') is not null then
    insert into communication.sms_messages (
      organization_id, conversation_id, provider, provider_account_id,
      direction, from_number, to_number, body, status, sent_by_type,
      ai_processed, ai_processing_status, idempotency_key, in_reply_to_message_id,
      interaction_id, attempt_count, next_attempt_at
    ) values (
      inbound.organization_id, inbound.conversation_id, inbound.provider,
      inbound.provider_account_id, 'outbound', inbound.to_number, inbound.from_number,
      p_reply, 'queued', 'ai_agent', true, 'completed',
      'sms-agent-reply:' || inbound.id::text, inbound.id, inbound.interaction_id, 0, now()
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into outbound_id;
    if outbound_id is null then
      select m.id into outbound_id
      from communication.sms_messages m
      where m.idempotency_key = 'sms-agent-reply:' || inbound.id::text;
    end if;
  end if;

  if p_status = 'retry' and p_execution_known_not_started then
    update communication.sms_messages
    set ai_processing_status = 'pending', ai_processed = false,
        ai_response_id = p_request_id::text, error_code = p_error_code,
        error_message = left(p_operator_detail, 2000), claimed_at = null,
        lease_expires_at = null, processing_worker_id = null,
        outcome_uncertain_at = null,
        next_attempt_at = now() + pg_catalog.make_interval(
          secs => greatest(1, least(coalesce(p_retry_after_seconds, 5), 3600))
        ), updated_at = now()
    where id = inbound.id;
  else
    terminal_status := case
      when p_status in ('completed', 'duplicate') then 'completed'
      when p_status = 'disabled' then 'skipped'
      else 'failed'
    end;
    update communication.sms_messages
    set ai_processing_status = terminal_status, ai_processed = true,
        ai_response_id = p_request_id::text, error_code = p_error_code,
        error_message = left(p_operator_detail, 2000),
        outcome_uncertain_at = case
          when p_status in ('retry', 'failed') and not p_execution_known_not_started then now()
          else null
        end,
        claimed_at = null, lease_expires_at = null, processing_worker_id = null,
        updated_at = now()
    where id = inbound.id;
  end if;
  return outbound_id;
end;
$$;

drop function if exists communication.claim_pending_sms_outbound_attempts(text, integer, integer);
create function communication.claim_pending_sms_outbound_attempts(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  outbound_message_id uuid,
  provider text,
  provider_account_id text,
  idempotency_key text,
  from_number text,
  to_number text,
  body text,
  attempt_count integer
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
    where m.direction = 'outbound'
      and m.deleted_at is null
      and m.twilio_sid is null
      and m.provider = 'twilio'
      and m.provider_account_id is not null
      and m.idempotency_key is not null
      and nullif(btrim(coalesce(m.body, '')), '') is not null
      and m.next_attempt_at <= now()
      and m.status = 'queued'
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set status = 'sending', attempt_count = m.attempt_count + 1,
        claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
        ),
        processing_worker_id = p_worker_id, outcome_uncertain_at = null,
        updated_at = now()
    from candidates
    where m.id = candidates.id
    returning m.*
  )
  select claimed.id, claimed.provider, claimed.provider_account_id,
         claimed.idempotency_key, claimed.from_number, claimed.to_number,
         claimed.body, claimed.attempt_count
  from claimed
  order by claimed.created_at;
end;
$$;

drop function if exists communication.finalize_sms_outbound_attempt(
  uuid, text, text, text, text, text, boolean, integer
);
create function communication.finalize_sms_outbound_attempt(
  p_outbound_message_id uuid,
  p_worker_id text,
  p_provider_creation_outcome text,
  p_status text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_after_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_provider_creation_outcome not in ('accepted', 'known_failed', 'uncertain') then
    raise exception 'unsupported provider creation outcome: %', p_provider_creation_outcome;
  end if;
  if p_status not in (
    'queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'read'
  ) then
    raise exception 'unsupported SMS provider status: %', p_status;
  end if;
  if p_provider_creation_outcome = 'accepted' and p_provider_message_id is null then
    raise exception 'accepted provider creation requires provider message id';
  end if;

  if p_provider_creation_outcome = 'known_failed' and p_status = 'queued' then
    update communication.sms_messages
    set status = 'queued', error_code = p_error_code,
        error_message = left(p_error_message, 2000), claimed_at = null,
        lease_expires_at = null, processing_worker_id = null,
        outcome_uncertain_at = null,
        next_attempt_at = now() + pg_catalog.make_interval(
          secs => greatest(1, least(coalesce(p_retry_after_seconds, 30), 86400))
        ), updated_at = now()
    where id = p_outbound_message_id and direction = 'outbound'
      and status = 'sending' and processing_worker_id = p_worker_id;
  elsif p_provider_creation_outcome = 'uncertain' then
    update communication.sms_messages
    set status = 'sending', error_code = coalesce(p_error_code, 'provider_outcome_uncertain'),
        error_message = left(p_error_message, 2000), outcome_uncertain_at = now(),
        updated_at = now()
    where id = p_outbound_message_id and direction = 'outbound'
      and status = 'sending' and processing_worker_id = p_worker_id;
  else
    update communication.sms_messages
    set status = p_status, twilio_sid = coalesce(p_provider_message_id, twilio_sid),
        provider_status_at = now(), error_code = p_error_code,
        error_message = left(p_error_message, 2000), claimed_at = null,
        lease_expires_at = null, processing_worker_id = null,
        outcome_uncertain_at = null, updated_at = now()
    where id = p_outbound_message_id and direction = 'outbound'
      and status = 'sending' and processing_worker_id = p_worker_id;
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

drop index if exists communication.sms_messages_agent_queue_idx;
create index sms_messages_agent_queue_idx
  on communication.sms_messages(next_attempt_at, created_at)
  where direction = 'inbound' and ai_processing_status = 'pending' and deleted_at is null;

drop index if exists communication.sms_messages_outbound_queue_idx;
create index sms_messages_outbound_queue_idx
  on communication.sms_messages(next_attempt_at, created_at)
  where direction = 'outbound' and status = 'queued' and deleted_at is null;

revoke execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer
) from public, anon, authenticated;
revoke execute on function communication.claim_pending_sms_outbound_attempts(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function communication.finalize_sms_outbound_attempt(
  uuid, text, text, text, text, text, text, integer
) from public, anon, authenticated;

grant execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  to service_role;
grant execute on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer
) to service_role;
grant execute on function communication.claim_pending_sms_outbound_attempts(text, integer, integer)
  to service_role;
grant execute on function communication.finalize_sms_outbound_attempt(
  uuid, text, text, text, text, text, text, integer
) to service_role;

comment on column communication.sms_messages.outcome_uncertain_at is
  'Set when a claimed AI/provider side effect may have occurred but was not safely finalized. Never auto-replay.';
comment on column communication.sms_conversations.agent_id is
  'Canonical agent.definition binding snapshotted for this SMS transport conversation.';
comment on column communication.sms_conversations.canonical_agent_version_id is
  'Optional canonical agent.definition_version snapshot; legacy text agent_version_id is evidence only.';
