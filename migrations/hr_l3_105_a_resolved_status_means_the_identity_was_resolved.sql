-- hr_l3_105 — D1. `identity_status = 'resolved'` must mean the identity WAS resolved.
--
-- THE LIE, REPRODUCED DETERMINISTICALLY
--   `communication.sms_fill_canonical_context` is the BEFORE INSERT trigger on
--   `communication.sms_conversations`. Its identity branch reads:
--
--       if new.identity_status = 'unresolved' then
--         new.identity_status := case
--           when new.user_id is not null and destination.id is not null then 'resolved'
--           else 'not_found' end;
--       end if;
--
--   `destination` is the row for `new.our_phone_number` — the SENDER's phone number. `destination.id`
--   says the message is going out on a registered line; it says NOTHING about whether the RECIPIENT's
--   identity was resolved. So the status flips to `resolved` whenever there is any `user_id` and the
--   sending line exists, even when the recipient's party and contact were never found. Measured live:
--   3 conversations are `resolved`, and 2 of them have `party_id`, `contact_point_id` AND
--   `contact_medium_id` all NULL — resolved to nobody. The verifier's cited row
--   `6ae80ed1-c3a2-40d5-bdfe-718890e102e9` is one of them. Reproduced here (probe2 F'): insert a
--   conversation with a `user_id`, no `party_id`, `identity_status='unresolved'` → it comes out
--   `resolved` with all three identity columns still NULL.
--
-- THE HONEST RULE, FROM THE AUTHORITATIVE WRITER
--   `communication.enqueue_notification_sms` — the door that actually resolves a recipient through
--   `resolve_channel_address` — sets the status by ONE rule:
--
--       identity_status = case when v_res.party_id is not null then 'resolved' else 'unresolved' end
--
--   Resolution is `party_id is not null`, full stop. A `user_id` is who the conversation belongs to,
--   not proof their messaging identity was found. This makes the trigger AGREE with that rule: it may
--   only claim `resolved` when the recipient party is actually present.
--
-- Applied live as `hr_l3_105_a_resolved_status_means_the_identity_was_resolved`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · THE KEY IS `party_id`, MATCHING THE AUTHORITATIVE WRITER — not user_id, and not the sender's
--     `destination.id`. party_id is the canonical "recipient identity resolved" signal;
--     contact_point_id / contact_medium_id are details that may be absent even for a known party.
--   · THE NON-RESOLVED BRANCH STAYS `not_found`. That is the trigger's own existing choice for the
--     branch, and it is honest for this table: the user is known but their messaging identity was not
--     found. The defect is the FALSE `resolved`, not the `not_found` label, so only the resolved
--     condition changes. (The authoritative writer uses `unresolved` for its own party-null insert;
--     that is a different code path and is not touched here.)
--   · THE TWO EXISTING LYING ROWS ARE CORRECTED. A status that must reflect reality cannot be fixed
--     only going forward while two rows keep asserting a resolution that never happened. They are set
--     to exactly what the corrected trigger would now produce for the same facts (`not_found`), so
--     the historical rows and the live rule tell one story. Only rows that are provably lies are
--     touched: `resolved` with all three identity columns NULL.
--   · CREATE OR REPLACE, signature unchanged (RETURNS trigger) — the ACL is preserved, no overload.

create or replace function communication.sms_fill_canonical_context()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  destination communication.sms_phone_numbers%rowtype;
begin
  select p.* into destination
  from communication.sms_phone_numbers p
  where p.phone_number = new.our_phone_number
    and p.provider = new.provider
    and p.is_active
    and p.deleted_at is null
  limit 1;

  new.provider_account_id := coalesce(new.provider_account_id, destination.provider_account_id);
  new.destination_identity_id := coalesce(new.destination_identity_id, destination.id);
  new.program_key := coalesce(new.program_key, destination.program_key);
  new.chat_conversation_id := coalesce(new.chat_conversation_id, gen_random_uuid());
  if new.identity_status = 'unresolved' then
    -- hr_l3_105 (D1): `resolved` means the RECIPIENT's identity was resolved, which is `party_id is
    -- not null` — the same rule communication.enqueue_notification_sms uses. The old test
    -- (`user_id is not null and destination.id is not null`) read the SENDER's phone line and a
    -- user association, neither of which is identity resolution, and stamped `resolved` on
    -- conversations whose party/contact were never found.
    new.identity_status := case
      when new.party_id is not null then 'resolved'
      else 'not_found'
    end;
  end if;
  return new;
end;
$function$;

-- ── CORRECT THE EXISTING LIES (only provable ones: resolved with NO identity at all) ─────────────
update communication.sms_conversations
   set identity_status = 'not_found'
 where identity_status = 'resolved'
   and party_id is null
   and contact_point_id is null
   and contact_medium_id is null;

-- ── FALSIFICATION ────────────────────────────────────────────────────────────────────────────────
do $verify$
declare v_status text; v_org uuid; v_usr uuid; v_party uuid; v_lies integer;
begin
  select id into v_org from iam.organizations limit 1;
  select id into v_usr from auth.users limit 1;
  select id into v_party from crm.party limit 1;   -- a REAL party for the FK

  -- probe2 F': user_id set, party_id NULL → must NOT be `resolved`.
  insert into communication.sms_conversations
    (external_phone_number, our_phone_number, organization_id, provider, user_id, identity_status)
  values ('+15550000009', '+14158059951', v_org, 'twilio', v_usr, 'unresolved')
  returning identity_status into v_status;
  if v_status = 'resolved' then
    raise exception 'hr_l3_105: a conversation with no party_id STILL comes out resolved (%)', v_status;
  end if;
  if v_status <> 'not_found' then
    raise exception 'hr_l3_105: expected not_found for a party-less conversation, got %', v_status;
  end if;

  -- and a genuinely resolved recipient (party_id present) is still `resolved`.
  insert into communication.sms_conversations
    (external_phone_number, our_phone_number, organization_id, provider, user_id, party_id, identity_status)
  values ('+15550000010', '+14158059951', v_org, 'twilio', v_usr, v_party, 'unresolved')
  returning identity_status into v_status;
  if v_status <> 'resolved' then
    raise exception 'hr_l3_105: a conversation WITH a party_id must be resolved, got %', v_status;
  end if;

  -- no lying rows remain anywhere.
  select count(*) into v_lies from communication.sms_conversations
   where identity_status = 'resolved'
     and party_id is null and contact_point_id is null and contact_medium_id is null;
  if v_lies <> 0 then
    raise exception 'hr_l3_105: % resolved-but-identity-null row(s) remain', v_lies;
  end if;

  -- roll the two probe inserts back; this is a verify, not a data change.
  raise exception 'hr_l3_105_verify_ok';
exception
  when others then
    if sqlerrm <> 'hr_l3_105_verify_ok' then raise; end if;
end
$verify$;
