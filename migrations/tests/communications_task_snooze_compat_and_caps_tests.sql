-- Independent rollback-only regression: legacy v1 DONE admission still works
-- after v2 offers ship, and the current per-person SMS cap closes at its edge.
-- Run only on the designated disposable clone with ON_ERROR_STOP=1.
-- No provider API is called and every fixture is rolled back.

\set suite 'communications_task_snooze_compat_and_caps_tests.sql'
\set expect 'clone'
\set requires 'function:communication.task_sms_person_timing_gate|function:communication.has_exact_sms_task_reply_offer|function:communication.admit_pending_sms_command_turn'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

create temporary table p1_review_context on commit drop as
select u.id as user_id, m.organization_id,
       d.id as destination_id,
       d.phone_number as destination_phone,
       d.provider as provider,
       d.provider_account_id as provider_account_id,
       gen_random_uuid() as conversation_id,
       gen_random_uuid() as outbound_id,
       gen_random_uuid() as inbound_id,
       gen_random_uuid() as target_id,
       gen_random_uuid() as assist_id,
       '+19497027626'::text as phone
from auth.users u
join communication.sms_notification_preferences p on p.user_id = u.id
  and p.deleted_at is null
join iam.organization_member m on m.user_id = u.id
  and m.organization_id = p.organization_id
join communication.sms_phone_numbers d on d.id = p.assistant_destination_id
where u.email = 'admin@admin.com'
order by p.created_at
limit 1;

do $$ begin
  if (select count(*) from p1_review_context) <> 1 then
    raise exception 'Requires admin@admin.com and one organization on disposable clone';
  end if;
end $$;

insert into communication.sms_conversations (
  id, organization_id, user_id, external_phone_number, our_phone_number,
  status, conversation_type, provider, provider_account_id,
  destination_identity_id, program_key, chat_conversation_id,
  identity_status
)
select conversation_id, organization_id, user_id, phone, destination_phone,
       'active', 'notification', provider, provider_account_id,
       destination_id, 'p1_review', gen_random_uuid(), 'resolved'
from p1_review_context;

insert into communication.sms_messages (
  id, organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processing_status, provider, provider_account_id, idempotency_key,
  created_at
)
select outbound_id, organization_id, conversation_id, 'SM_P1_REVIEW_OUT',
       'outbound', destination_phone, phone, 'Reply DONE', 'sent',
       'notification', 'completed', provider, provider_account_id,
       'p1-review:outbound:' || outbound_id::text,
       now() - interval '30 days'
from p1_review_context;

insert into communication.sms_messages (
  id, organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processed, ai_processing_status, error_code,
  provider, provider_account_id, idempotency_key
)
select inbound_id, organization_id, conversation_id, 'SM_P1_REVIEW_IN',
       'inbound', phone, destination_phone, ' done ', 'received', 'user',
       false, 'skipped', 'sms_command_offer_unverified',
       provider, provider_account_id,
       provider || ':inbound:' || provider_account_id || ':SM_P1_REVIEW_IN'
from p1_review_context;

insert into platform.assists (
  id, user_id, organization_id, entity_type, entity_id, source_key,
  title, action, status, metadata, dedupe_key
)
select assist_id, user_id, organization_id, 'task', target_id,
       'notifications.task.sms_reply', 'Legacy DONE offer',
       '{"kind":"navigate"}'::jsonb, 'pending',
       jsonb_build_object('sms_reply_offer', jsonb_build_object(
         'version', 1, 'allowed_aliases', jsonb_build_array('DONE'),
         'operation', jsonb_build_object('kind', 'task.complete',
                                         'arguments', '{}'::jsonb),
         'target_entity_type', 'task', 'target_entity_id', target_id,
         'outbound_sms_message_id', outbound_id
       )),
       'p1-review:v1:' || assist_id::text
from p1_review_context;

do $$
declare v_id uuid; v_admission text;
begin
  select inbound_id into strict v_id from p1_review_context;
  if communication.has_exact_sms_task_reply_offer(v_id) is not true then
    raise exception 'Legacy v1 DONE offer no longer resolves';
  end if;
  select communication.admit_pending_sms_command_turn(v_id) into v_admission;
  if v_admission is distinct from 'admitted' then
    raise exception 'Legacy v1 DONE was not admitted: %', v_admission;
  end if;
  if not exists (
    select 1 from communication.sms_messages m
    where m.id = v_id and m.ai_processing_status = 'pending'
      and m.error_code is null and m.ai_processed is false
  ) then
    raise exception 'Legacy v1 DONE did not enter pending command lane';
  end if;
end $$;

-- Use the designated test handset only. The old v1 fixture is outside the
-- cap window; the cap rows are future-dated and rolled back before delivery.
create temporary table p1_cap_context on commit drop as
select c.*, caps.max_per_hour,
       slot.at as test_now
from p1_review_context c
cross join lateral communication.person_notification_caps(
  c.user_id, c.organization_id, 'sms'
) caps
cross join lateral (
  select candidate.at
  from generate_series(0, 47) hour_index
  cross join lateral (
    select date_trunc('hour', now()) + (hour_index + 48) * interval '1 hour' as at
  ) candidate
  cross join lateral communication.task_sms_person_timing_gate(
    c.user_id, c.organization_id, c.phone, candidate.at
  ) gate
  where gate.reason is null
  order by candidate.at
  limit 1
) slot;

do $$ begin
  if (select count(*) from p1_cap_context) <> 1
     or (select max_per_hour from p1_cap_context) < 1 then
    raise exception 'No allowed test hour or effective SMS cap on clone';
  end if;
end $$;

insert into communication.sms_messages (
  organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processing_status, provider, provider_account_id, idempotency_key,
  created_at
)
select c.organization_id, c.conversation_id,
       'SM_P1_CAP_' || slot.n, 'outbound', c.destination_phone, c.phone,
       'Cap fixture', 'sent', 'notification', 'completed',
       c.provider, c.provider_account_id, 'p1-review:cap:' || slot.n,
       c.test_now - interval '10 minutes'
from p1_cap_context c
cross join lateral generate_series(1, c.max_per_hour - 1) slot(n);

do $$
declare c p1_cap_context%rowtype; v_reason text;
begin
  select * into strict c from p1_cap_context;
  select reason into v_reason from communication.task_sms_person_timing_gate(
    c.user_id, c.organization_id, c.phone, c.test_now
  );
  if v_reason is not null then
    raise exception 'One remaining hourly slot was refused: %', v_reason;
  end if;
end $$;

insert into communication.sms_messages (
  organization_id, conversation_id, twilio_sid, direction,
  from_number, to_number, body, status, sent_by_type,
  ai_processing_status, provider, provider_account_id, idempotency_key,
  created_at
)
select organization_id, conversation_id, 'SM_P1_CAP_FINAL', 'outbound',
       destination_phone, phone, 'Final slot fixture', 'sent', 'notification',
       'completed', provider, provider_account_id, 'p1-review:cap:final',
       test_now - interval '10 minutes'
from p1_cap_context;

do $$
declare c p1_cap_context%rowtype; v_reason text;
begin
  select * into strict c from p1_cap_context;
  select reason into v_reason from communication.task_sms_person_timing_gate(
    c.user_id, c.organization_id, c.phone, c.test_now
  );
  if v_reason is distinct from 'hourly_rate_limit' then
    raise exception 'Effective cap did not close at final slot: %', v_reason;
  end if;
end $$;

rollback;
