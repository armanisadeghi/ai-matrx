-- Communications P0: provider-scoped identity, durable SMS queues, and worker contracts.
-- Additive rollout: deployed legacy writers remain accepted while canonical triggers populate
-- the new relational fields. New consumers fail closed on unresolved context.

alter table communication.sms_phone_numbers
  add column provider text not null default 'twilio',
  add column provider_account_id text,
  add column program_key text not null default 'ai_matrx_owner_beta',
  add column assistant_enabled boolean not null default false;

alter table communication.sms_notification_preferences
  add column preferred_ai_agent_id text,
  add column preferred_ai_agent_version_id text;

alter table communication.sms_conversations
  add column provider text not null default 'twilio',
  add column provider_account_id text,
  add column destination_identity_id uuid,
  add column program_key text,
  add column party_id uuid,
  add column contact_medium_id uuid,
  add column contact_point_id uuid,
  add column interaction_id uuid,
  add column chat_conversation_id uuid,
  add column agent_version_id text,
  add column identity_status text not null default 'unresolved';

alter table communication.sms_messages
  add column provider text not null default 'twilio',
  add column provider_account_id text,
  add column webhook_receipt_id uuid,
  add column interaction_id uuid,
  add column in_reply_to_message_id uuid,
  add column idempotency_key text,
  add column provider_status_at timestamptz,
  add column attempt_count integer not null default 0,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz,
  add column processing_worker_id text,
  add column next_attempt_at timestamptz not null default now();

alter table communication.sms_webhook_logs
  add column provider text not null default 'twilio',
  add column provider_account_id text,
  add column provider_event_key text,
  add column message_id uuid,
  add column processing_attempts integer not null default 0,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz,
  add column processed_at timestamptz;

alter table communication.sms_notifications
  add column idempotency_key text,
  add column interaction_id uuid;

alter table communication.sms_phone_numbers
  add constraint sms_phone_numbers_provider_nonempty_check check (btrim(provider) <> ''),
  add constraint sms_phone_numbers_program_key_check
    check (program_key ~ '^[a-z0-9][a-z0-9_]*$');

alter table communication.sms_conversations
  add constraint sms_conversations_identity_status_check
    check (identity_status in ('resolved', 'ambiguous', 'not_found', 'unresolved')),
  add constraint sms_conversations_destination_identity_id_fkey
    foreign key (destination_identity_id)
    references communication.sms_phone_numbers(id) on delete restrict,
  add constraint sms_conversations_party_id_fkey
    foreign key (party_id) references crm.party(id) on delete set null,
  add constraint sms_conversations_contact_medium_id_fkey
    foreign key (contact_medium_id) references crm.contact_medium(id) on delete set null,
  add constraint sms_conversations_contact_point_id_fkey
    foreign key (contact_point_id) references crm.party_contact_point(id) on delete set null,
  add constraint sms_conversations_interaction_id_fkey
    foreign key (interaction_id) references crm.interaction(id) on delete set null;

alter table communication.sms_messages
  add constraint sms_messages_attempt_count_check check (attempt_count >= 0),
  add constraint sms_messages_webhook_receipt_id_fkey
    foreign key (webhook_receipt_id)
    references communication.sms_webhook_logs(id) on delete set null,
  add constraint sms_messages_interaction_id_fkey
    foreign key (interaction_id) references crm.interaction(id) on delete set null,
  add constraint sms_messages_in_reply_to_message_id_fkey
    foreign key (in_reply_to_message_id)
    references communication.sms_messages(id) on delete set null;

alter table communication.sms_webhook_logs
  add constraint sms_webhook_logs_processing_attempts_check check (processing_attempts >= 0),
  add constraint sms_webhook_logs_message_id_fkey
    foreign key (message_id)
    references communication.sms_messages(id) on delete set null;

alter table communication.sms_notifications
  add constraint sms_notifications_interaction_id_fkey
    foreign key (interaction_id) references crm.interaction(id) on delete set null;

-- Backfill the provider account on the owned destination from signed webhook evidence.
with destination_evidence as (
  select distinct on (p.id)
    p.id,
    nullif(l.raw_payload ->> 'AccountSid', '') as account_sid
  from communication.sms_phone_numbers p
  join communication.sms_webhook_logs l
    on l.raw_payload ->> 'To' = p.phone_number
    or l.raw_payload ->> 'From' = p.phone_number
  where nullif(l.raw_payload ->> 'AccountSid', '') is not null
  order by p.id, l.created_at desc
)
update communication.sms_phone_numbers p
set provider_account_id = destination_evidence.account_sid
from destination_evidence
where destination_evidence.id = p.id
  and p.provider_account_id is null;

-- The currently approved sender is the closed owner-beta program. It stays paused until an
-- operator selects the user's agent and explicitly enables it.
update communication.sms_phone_numbers
set program_key = 'ai_matrx_owner_beta',
    assistant_enabled = false
where provider = 'twilio'
  and phone_number = '+14158059951';

with conversation_context as (
  select
    c.id as conversation_id,
    p.id as destination_identity_id,
    p.provider,
    p.provider_account_id,
    p.program_key,
    pref.preferred_ai_agent_id,
    pref.preferred_ai_agent_version_id
  from communication.sms_conversations c
  join communication.sms_phone_numbers p
    on p.phone_number = c.our_phone_number
   and p.deleted_at is null
  left join communication.sms_notification_preferences pref
    on pref.phone_number = c.external_phone_number
   and pref.user_id = c.user_id
   and pref.deleted_at is null
)
update communication.sms_conversations c
set provider = conversation_context.provider,
    provider_account_id = conversation_context.provider_account_id,
    destination_identity_id = conversation_context.destination_identity_id,
    program_key = conversation_context.program_key,
    chat_conversation_id = coalesce(c.chat_conversation_id, gen_random_uuid()),
    ai_agent_id = coalesce(c.ai_agent_id, conversation_context.preferred_ai_agent_id),
    agent_version_id = coalesce(
      c.agent_version_id,
      conversation_context.preferred_ai_agent_version_id
    ),
    identity_status = case
      when c.user_id is not null and conversation_context.destination_identity_id is not null
        then 'resolved'
      else 'not_found'
    end
from conversation_context
where conversation_context.conversation_id = c.id;

-- Every historical webhook gets a stable key. The first occurrence uses the canonical future
-- key; repeated historical callbacks retain their evidence with an explicit legacy suffix.
with keyed as (
  select
    l.id,
    nullif(l.raw_payload ->> 'AccountSid', '') as account_sid,
    case
      when l.webhook_type = 'inbound_sms' then concat_ws(
        ':', 'twilio', 'inbound', nullif(l.raw_payload ->> 'AccountSid', ''),
        coalesce(nullif(l.raw_payload ->> 'MessageSid', ''), l.twilio_sid)
      )
      when l.webhook_type = 'status_callback' then concat_ws(
        ':', 'twilio', 'status', nullif(l.raw_payload ->> 'AccountSid', ''),
        coalesce(nullif(l.raw_payload ->> 'MessageSid', ''), l.twilio_sid),
        coalesce(nullif(l.raw_payload ->> 'MessageStatus', ''), 'unknown'),
        coalesce(nullif(l.raw_payload ->> 'ErrorCode', ''), 'none')
      )
      else concat_ws(':', 'twilio', l.webhook_type, l.id::text)
    end as base_key
  from communication.sms_webhook_logs l
), ranked as (
  select keyed.*,
         row_number() over (partition by base_key order by id) as occurrence
  from keyed
)
update communication.sms_webhook_logs l
set provider_account_id = ranked.account_sid,
    provider_event_key = case
      when ranked.occurrence = 1 then ranked.base_key
      else ranked.base_key || ':legacy:' || ranked.id::text
    end,
    processing_attempts = case when l.processed then 1 else 0 end,
    processed_at = case when l.processed then l.created_at else null end
from ranked
where ranked.id = l.id;

with message_context as (
  select
    m.id as message_id,
    c.provider,
    c.provider_account_id,
    inbound_receipt.id as webhook_receipt_id
  from communication.sms_messages m
  join communication.sms_conversations c on c.id = m.conversation_id
  left join communication.sms_webhook_logs inbound_receipt
    on inbound_receipt.webhook_type = 'inbound_sms'
   and inbound_receipt.twilio_sid = m.twilio_sid
)
update communication.sms_messages m
set provider = message_context.provider,
    provider_account_id = message_context.provider_account_id,
    webhook_receipt_id = message_context.webhook_receipt_id,
    idempotency_key = case
      when m.direction = 'inbound' and m.twilio_sid is not null
        then concat_ws(
          ':', message_context.provider, 'inbound', message_context.provider_account_id,
          m.twilio_sid
        )
      when m.direction = 'outbound' and m.twilio_sid is not null
        then concat_ws(
          ':', message_context.provider, 'outbound', message_context.provider_account_id,
          m.twilio_sid
        )
      else 'legacy:sms:' || m.id::text
    end,
    provider_status_at = coalesce(m.provider_status_at, m.updated_at),
    attempt_count = case when m.direction = 'outbound' then 1 else 0 end,
    next_attempt_at = coalesce(m.next_attempt_at, m.created_at)
from message_context
where message_context.message_id = m.id;

update communication.sms_webhook_logs l
set message_id = m.id
from communication.sms_messages m
where m.twilio_sid = l.twilio_sid
  and l.message_id is null;

create unique index sms_webhook_logs_provider_event_key_uidx
  on communication.sms_webhook_logs(provider_event_key)
  where provider_event_key is not null;

create unique index sms_messages_idempotency_key_uidx
  on communication.sms_messages(idempotency_key)
  where idempotency_key is not null;

create unique index sms_notifications_idempotency_key_uidx
  on communication.sms_notifications(idempotency_key)
  where idempotency_key is not null;

create unique index sms_conversations_active_transport_context_uidx
  on communication.sms_conversations(
    provider_account_id,
    destination_identity_id,
    external_phone_number,
    program_key
  )
  where status = 'active' and deleted_at is null;

create index sms_messages_agent_queue_idx
  on communication.sms_messages(next_attempt_at, created_at)
  where direction = 'inbound'
    and ai_processing_status in ('pending', 'processing')
    and deleted_at is null;

create index sms_messages_outbound_queue_idx
  on communication.sms_messages(next_attempt_at, created_at)
  where direction = 'outbound'
    and status in ('queued', 'sending')
    and deleted_at is null;

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
  new.ai_agent_id := coalesce(new.ai_agent_id, preference.preferred_ai_agent_id);
  new.agent_version_id := coalesce(new.agent_version_id, preference.preferred_ai_agent_version_id);
  if new.identity_status = 'unresolved' then
    new.identity_status := case
      when new.user_id is not null and destination.id is not null then 'resolved'
      else 'not_found'
    end;
  end if;
  return new;
end;
$$;

create trigger sms_conversations_fill_canonical_context
before insert on communication.sms_conversations
for each row execute function communication.sms_fill_canonical_context();

create or replace function communication.sms_fill_message_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transport_context communication.sms_conversations%rowtype;
begin
  if new.conversation_id is not null then
    select c.* into transport_context
    from communication.sms_conversations c
    where c.id = new.conversation_id;
  end if;
  new.provider := coalesce(new.provider, transport_context.provider, 'twilio');
  new.provider_account_id := coalesce(new.provider_account_id, transport_context.provider_account_id);
  if new.idempotency_key is null and new.twilio_sid is not null and new.provider_account_id is not null then
    new.idempotency_key := concat_ws(
      ':', new.provider, case when new.direction = 'inbound' then 'inbound' else 'outbound' end,
      new.provider_account_id, new.twilio_sid
    );
  end if;
  return new;
end;
$$;

create trigger sms_messages_fill_canonical_context
before insert on communication.sms_messages
for each row execute function communication.sms_fill_message_context();

create or replace function communication.sms_fill_webhook_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_key text;
begin
  new.provider := coalesce(new.provider, 'twilio');
  new.provider_account_id := coalesce(
    new.provider_account_id,
    nullif(new.raw_payload ->> 'AccountSid', '')
  );
  if new.provider_event_key is null then
    base_key := case
      when new.webhook_type = 'inbound_sms' then concat_ws(
        ':', new.provider, 'inbound', new.provider_account_id,
        coalesce(nullif(new.raw_payload ->> 'MessageSid', ''), new.twilio_sid)
      )
      when new.webhook_type = 'status_callback' then concat_ws(
        ':', new.provider, 'status', new.provider_account_id,
        coalesce(nullif(new.raw_payload ->> 'MessageSid', ''), new.twilio_sid),
        coalesce(nullif(new.raw_payload ->> 'MessageStatus', ''), 'unknown'),
        coalesce(nullif(new.raw_payload ->> 'ErrorCode', ''), 'none')
      )
      else concat_ws(':', new.provider, new.webhook_type, new.id::text)
    end;
    new.provider_event_key := base_key;
  end if;
  return new;
end;
$$;

create trigger sms_webhook_logs_fill_receipt
before insert on communication.sms_webhook_logs
for each row execute function communication.sms_fill_webhook_receipt();

create or replace function communication.sms_notify_queue()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.direction = 'inbound'
     and new.ai_processing_status = 'pending'
     and (tg_op = 'INSERT' or old.ai_processing_status is distinct from new.ai_processing_status
          or old.next_attempt_at is distinct from new.next_attempt_at) then
    perform pg_catalog.pg_notify('communication_sms_agent_turn', new.id::text);
  elsif new.direction = 'outbound'
     and new.status = 'queued'
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.next_attempt_at is distinct from new.next_attempt_at) then
    perform pg_catalog.pg_notify('communication_sms_outbound_attempt', new.id::text);
  end if;
  return new;
end;
$$;

create trigger sms_messages_notify_queue
after insert or update of ai_processing_status, status, next_attempt_at
on communication.sms_messages
for each row execute function communication.sms_notify_queue();

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
  agent_id text,
  agent_version_id text,
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
      and (
        m.ai_processing_status = 'pending'
        or (m.ai_processing_status = 'processing' and m.lease_expires_at <= now())
      )
      and c.status = 'active'
      and c.deleted_at is null
      and c.identity_status = 'resolved'
      and c.chat_conversation_id is not null
      and c.user_id is not null
      and c.ai_agent_id is not null
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
    c.ai_agent_id,
    c.agent_version_id,
    claimed.body
  from claimed
  join communication.sms_conversations c on c.id = claimed.conversation_id
  order by claimed.created_at;
end;
$$;

create or replace function communication.finalize_sms_agent_turn(
  p_inbound_message_id uuid,
  p_worker_id text,
  p_status text,
  p_request_id uuid default null,
  p_reply text default null,
  p_error_code text default null,
  p_operator_detail text default null,
  p_retryable boolean default false,
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

  if p_status = 'retry' or (p_status = 'failed' and p_retryable) then
    update communication.sms_messages
    set ai_processing_status = 'pending',
        ai_processed = false,
        ai_response_id = p_request_id::text,
        error_code = p_error_code,
        error_message = left(p_operator_detail, 2000),
        claimed_at = null,
        lease_expires_at = null,
        processing_worker_id = null,
        next_attempt_at = now() + pg_catalog.make_interval(
          secs => greatest(1, least(coalesce(p_retry_after_seconds, 5), 3600))
        ),
        updated_at = now()
    where id = inbound.id;
  else
    terminal_status := case
      when p_status in ('completed', 'duplicate') then 'completed'
      when p_status = 'disabled' then 'skipped'
      else 'failed'
    end;
    update communication.sms_messages
    set ai_processing_status = terminal_status,
        ai_processed = true,
        ai_response_id = p_request_id::text,
        error_code = p_error_code,
        error_message = left(p_operator_detail, 2000),
        claimed_at = null,
        lease_expires_at = null,
        processing_worker_id = null,
        updated_at = now()
    where id = inbound.id;
  end if;

  return outbound_id;
end;
$$;

create or replace function communication.claim_pending_sms_outbound_attempts(
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
      and (
        m.status = 'queued'
        or (m.status = 'sending' and m.lease_expires_at <= now())
      )
    order by m.created_at
    for update of m skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update communication.sms_messages m
    set status = 'sending',
        attempt_count = m.attempt_count + 1,
        claimed_at = now(),
        lease_expires_at = now() + pg_catalog.make_interval(
          secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
        ),
        processing_worker_id = p_worker_id,
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

create or replace function communication.finalize_sms_outbound_attempt(
  p_outbound_message_id uuid,
  p_worker_id text,
  p_status text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retryable boolean default false,
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
  if p_status not in (
    'queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'read'
  ) then
    raise exception 'unsupported SMS provider status: %', p_status;
  end if;

  if p_retryable and p_provider_message_id is null then
    update communication.sms_messages
    set status = 'queued',
        error_code = p_error_code,
        error_message = left(p_error_message, 2000),
        claimed_at = null,
        lease_expires_at = null,
        processing_worker_id = null,
        next_attempt_at = now() + pg_catalog.make_interval(
          secs => greatest(1, least(coalesce(p_retry_after_seconds, 30), 86400))
        ),
        updated_at = now()
    where id = p_outbound_message_id
      and direction = 'outbound'
      and status = 'sending'
      and processing_worker_id = p_worker_id;
  else
    update communication.sms_messages
    set status = p_status,
        twilio_sid = coalesce(p_provider_message_id, twilio_sid),
        provider_status_at = now(),
        error_code = p_error_code,
        error_message = left(p_error_message, 2000),
        claimed_at = null,
        lease_expires_at = null,
        processing_worker_id = null,
        updated_at = now()
    where id = p_outbound_message_id
      and direction = 'outbound'
      and status = 'sending'
      and processing_worker_id = p_worker_id;
  end if;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function communication.enqueue_sms_assistant_test(
  p_user_id uuid,
  p_destination_identity_id uuid,
  p_body text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  destination communication.sms_phone_numbers%rowtype;
  preference communication.sms_notification_preferences%rowtype;
  conversation communication.sms_conversations%rowtype;
  outbound_id uuid;
begin
  if length(btrim(coalesce(p_body, ''))) not between 1 and 1200 then
    raise exception 'test body must contain 1 to 1200 characters';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  select p.* into destination
  from communication.sms_phone_numbers p
  where p.id = p_destination_identity_id
    and p.is_active
    and p.assistant_enabled
    and p.deleted_at is null;
  if not found or destination.provider_account_id is null then
    raise exception 'assistant destination is not ready';
  end if;

  select pref.* into preference
  from communication.sms_notification_preferences pref
  where pref.user_id = p_user_id
    and pref.sms_enabled
    and pref.ai_agent_messages
    and pref.phone_number is not null
    and pref.deleted_at is null
  limit 1;
  if not found then
    raise exception 'verified SMS preference is not ready';
  end if;

  select c.* into conversation
  from communication.sms_conversations c
  where c.destination_identity_id = destination.id
    and c.user_id = preference.user_id
    and c.external_phone_number = preference.phone_number
    and c.program_key = destination.program_key
    and c.status = 'active'
    and c.deleted_at is null
  limit 1;

  if not found then
    insert into communication.sms_conversations (
      organization_id, user_id, external_phone_number, our_phone_number,
      conversation_type, provider, provider_account_id, destination_identity_id,
      program_key, chat_conversation_id, ai_agent_id, agent_version_id, identity_status
    ) values (
      preference.organization_id, preference.user_id, preference.phone_number,
      destination.phone_number, 'system_initiated', destination.provider,
      destination.provider_account_id, destination.id, destination.program_key,
      gen_random_uuid(), preference.preferred_ai_agent_id,
      preference.preferred_ai_agent_version_id, 'resolved'
    ) returning * into conversation;
  end if;

  insert into communication.sms_messages (
    organization_id, conversation_id, provider, provider_account_id,
    direction, from_number, to_number, body, status, sent_by_type,
    ai_processed, ai_processing_status, idempotency_key, attempt_count, next_attempt_at
  ) values (
    conversation.organization_id, conversation.id, destination.provider,
    destination.provider_account_id, 'outbound', destination.phone_number,
    preference.phone_number, p_body, 'queued', 'system', true, 'completed',
    p_idempotency_key, 0, now()
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into outbound_id;

  if outbound_id is null then
    select m.id into outbound_id
    from communication.sms_messages m
    where m.idempotency_key = p_idempotency_key;
  end if;
  return outbound_id;
end;
$$;

revoke execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer
) from public, anon, authenticated;
revoke execute on function communication.claim_pending_sms_outbound_attempts(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function communication.finalize_sms_outbound_attempt(
  uuid, text, text, text, text, text, boolean, integer
) from public, anon, authenticated;
revoke execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function communication.claim_pending_sms_agent_turns(text, integer, integer)
  to service_role;
grant execute on function communication.finalize_sms_agent_turn(
  uuid, text, text, uuid, text, text, text, boolean, integer
) to service_role;
grant execute on function communication.claim_pending_sms_outbound_attempts(text, integer, integer)
  to service_role;
grant execute on function communication.finalize_sms_outbound_attempt(
  uuid, text, text, text, text, text, boolean, integer
) to service_role;
grant execute on function communication.enqueue_sms_assistant_test(uuid, uuid, text, text)
  to service_role;

comment on column communication.sms_phone_numbers.assistant_enabled is
  'Assistant-program kill switch only; does not disable notifications or number inventory.';
comment on column communication.sms_notification_preferences.preferred_ai_agent_id is
  'User-selected SMS assistant agent; snapshotted onto each transport conversation.';
comment on column communication.sms_conversations.chat_conversation_id is
  'Reserved canonical chat.conversation UUID. The chat row may be created by the first agent run.';
comment on function communication.claim_pending_sms_agent_turns(text, integer, integer) is
  'Durably leases fully resolved inbound owner-beta SMS turns for the long-running aidream worker.';
comment on function communication.claim_pending_sms_outbound_attempts(text, integer, integer) is
  'Durably leases queued SMS transport attempts. NOTIFY is latency-only; polling this RPC is canonical.';
