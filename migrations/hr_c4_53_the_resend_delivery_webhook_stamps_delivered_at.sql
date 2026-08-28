-- HR domain C4 — migration 53 (HRB-001 completeness item 2; SPEC-NOTIFICATIONS §6.1).
--
-- 🚨 `delivered_at` IS 0/142 ON EMAIL — AND THE WEBHOOK PIPE ALREADY EXISTS.
--
-- INVESTIGATED FIRST, as instructed. The verdict is the good one: **the platform ALREADY receives
-- Resend delivery webhooks.** `matrx-frontend/app/api/webhooks/resend/route.ts` is a live, complete
-- receiver — Svix headers, HMAC verification against `RESEND_WEBHOOK_SECRET`, and a typed switch
-- over `email.sent | delivered | delivery_delayed | complained | bounced | opened | clicked`. It sits
-- in the established family beside the Twilio receivers, and aidream self-documents the convention:
-- *"email does not [stamp delivered] — Resend reports delivery later, by webhook"*
-- (`aidream/workers/notification_dispatcher.py`), with the webhook living in matrx-frontend.
--
-- So this is NOT new external-integration infra: **no new endpoint, no new secret, no config
-- question for Arman.** What was missing is one line of wiring — `handleEmailDelivered` was a STUB
-- that only logged `console.log("Email delivered:", data.email_id)`. The pipe arrived and the event
-- was dropped on the floor.
--
-- The join key already exists and is already populated: our sender stores Resend's message id in
-- `communication.notification.provider_message_id`
-- (`aidream/services/notifications/channels/email.py`: `provider_message_id=str(body.get("id"))`),
-- and Resend's webhook carries the same value as `data.email_id`. Measured live: every successfully
-- sent email row (`status='succeeded'`, provider `resend`) has a non-null `provider_message_id`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE MAPPING LIVES IN SQL, THE ROUTE CALLS ONE RPC. The webhook handler uses
--    `createAdminClient()` (service_role), the house pattern its Twilio siblings already follow. A
--    single SECURITY DEFINER function keeps the matching rule, the idempotence and the channel guard
--    in one contracted place instead of an ad-hoc UPDATE inside a TypeScript handler.
--
-- 2. 🚨 IDEMPOTENT, AND IT NEVER MOVES AN EARLIER TRUTH. `delivered_at` is set only when it is NULL
--    (`coalesce`), so a redelivered webhook — Svix retries — cannot rewrite the moment of delivery.
--    Delivery evidence is evidence (§6.1: the notice row carries its whole life); the FIRST report
--    is the true one.
--
-- 3. IT MATCHES ONLY WHAT IT CAN PROVE. Scoped to `channel = 'email'` and a non-empty
--    `provider_message_id` match. An unknown id stamps nothing and returns 0 — a webhook for mail
--    this platform did not send must never touch a row, and the handler treats 0 as a normal
--    no-op rather than an error.
--
-- 4. SCOPE HELD TO `delivered_at`, AS INSTRUCTED. The same live pipe also delivers `bounced`,
--    `complained`, `delivery_delayed`, `opened` and `clicked`. `opened` is deliberately NOT wired:
--    §5.2 rules out open-tracking for read state — *"No tracking pixels… they lie in both directions"*
--    — and `read_at` is stamped only by a deep-link follow. `bounced`/`complained` are real delivery
--    evidence and are one line each on this same function, but they change failure semantics, so
--    they are REPORTED as available rather than bundled in.
--
-- Authority: SPEC-NOTIFICATIONS §6.1 (the notice row is the evidence record:
-- `sent_at ▸ delivered_at ▸ …`), §5.2 (no tracking pixels — `opened` is not read).
-- Applied live as `hr_c4_53_the_resend_delivery_webhook_stamps_delivered_at`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

create or replace function communication.record_provider_delivery(
  p_provider_message_id text,
  p_delivered_at timestamptz default now(),
  p_channel text default 'email')
returns integer
language plpgsql security definer set search_path to 'communication', 'public'
as $fn$
declare v_n integer := 0;
begin
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    return 0;                       -- RD 3: nothing to match on; stamp nothing
  end if;
  -- RD 2: the FIRST delivery report is the true one. A Svix retry re-runs this and moves nothing.
  update communication.notification n
     set delivered_at = coalesce(n.delivered_at, p_delivered_at),
         updated_at   = now()
   where n.provider_message_id = p_provider_message_id
     and n.channel = p_channel
     and n.delivered_at is null;
  get diagnostics v_n = row_count;
  return v_n;                       -- RD 3: 0 for mail we did not send — a no-op, not an error
end
$fn$;

revoke all on function communication.record_provider_delivery(text, timestamptz, text)
  from public, anon;
grant execute on function communication.record_provider_delivery(text, timestamptz, text)
  to service_role;

comment on function communication.record_provider_delivery is
  'Stamps SPEC-NOTIFICATIONS §6.1 `delivered_at` from a provider delivery webhook, matched on the frozen provider_message_id. Called by matrx-frontend app/api/webhooks/resend/route.ts (service_role, the house webhook pattern). Idempotent: a redelivered webhook never moves an earlier delivery moment, because delivery evidence is evidence. Returns 0 for a message this platform did not send. NOT used for `opened` — §5.2 rules out open-tracking as read state.';

-- ============================================================ the contract
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_53';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('communication', 'record_provider_delivery', 'hr_c4_53',
    array['coalesce(n.delivered_at, p_delivered_at)', 'n.delivered_at is null',
          'n.provider_message_id = p_provider_message_id'],
    '{}', true,
    'hr_c4_53 (SPEC-NOTIFICATIONS §6.1): the delivery stamp must stay IDEMPOTENT and match only on the frozen provider_message_id. `coalesce` + `delivered_at is null` mean a redelivered Svix webhook can never move the recorded moment of delivery — delivery evidence is evidence, and the first report is the true one. Matching on anything looser than the provider message id would stamp delivery on a row this platform cannot prove was delivered.');
end $$;

-- ============================================================ post-conditions that EXECUTE
do $$
declare v_nid uuid; v_n integer; v_first timestamptz; v_second timestamptz; v_bad integer;
begin
  -- EXECUTED both ways on a real row, rolled back
  select id into v_nid from communication.notification
   where channel = 'email' and provider_message_id is not null limit 1;
  if v_nid is not null then
    begin
      perform hr.arm_write();
      update communication.notification set delivered_at = null where id = v_nid;
      v_n := communication.record_provider_delivery(
               (select provider_message_id from communication.notification where id = v_nid),
               now() - interval '1 hour');
      select delivered_at into v_first from communication.notification where id = v_nid;
      if v_n < 1 or v_first is null then
        raise exception 'hr_c4_53: a real provider_message_id did not stamp delivered_at (n=%)', v_n;
      end if;
      -- RD 2: a redelivered webhook moves nothing
      perform communication.record_provider_delivery(
               (select provider_message_id from communication.notification where id = v_nid), now());
      select delivered_at into v_second from communication.notification where id = v_nid;
      if v_second is distinct from v_first then
        raise exception 'hr_c4_53: a redelivered webhook moved delivered_at from % to %', v_first, v_second;
      end if;
      raise exception 'hr_c4_53_rollback_marker';
    exception when others then
      if sqlerrm !~ 'hr_c4_53_rollback_marker' then raise; end if;
    end;
  end if;

  -- RD 3: an id we never sent stamps nothing
  if communication.record_provider_delivery('resend_id_this_platform_never_sent') <> 0 then
    raise exception 'hr_c4_53: an unknown provider message id stamped a row';
  end if;

  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_53: % function contract(s) broken', v_bad;
  end if;
  raise notice 'hr_c4_53: the delivery stamp is live, idempotent, and match-scoped';
end $$;
