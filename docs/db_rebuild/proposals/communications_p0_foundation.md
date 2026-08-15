# DB Change Proposal — communications P0 foundation

**One-liner:** Extend the live SMS tables with provider-scoped identity, durable receipt,
canonical CRM/chat linkage, and ledger-first attempt fields so the owner beta can run safely.
**Change types:** modify
**Status:** GO — owner ratified the communications plan and directed implementation on 2026-08-15.

## 1. Scope — the cluster

| Table | Rows | Verdict | Why |
|---|---:|---|---|
| `communication.sms_phone_numbers` | 1 | extend | Existing owned destination identity; add provider account and program. |
| `communication.sms_conversations` | 1 | extend | Existing transport thread; add tenant/CRM/chat/agent resolution context. |
| `communication.sms_messages` | 10 | extend | Existing transport attempt; add receipt, interaction, idempotency, and claim evidence. |
| `communication.sms_webhook_logs` | 11 | extend | Existing raw provider-event ledger; make receipt idempotent and retryable. |
| `communication.sms_notifications` | 0 | extend | Existing notification intent; add initiating idempotency key. |
| `communication.sms_notification_preferences` | 1 | extend | Existing user communication preference; add typed selected agent/version fields. |
| `crm.contact_medium` | 945 | reuse | Canonical endpoint/consent authority; no structural change. |
| `crm.party_contact_point` | 945 | reuse | Canonical tenant-party endpoint binding; no structural change. |
| `crm.interaction` | 2 | reuse | Canonical relationship-level communication lifecycle; no structural change. |

## 2. Outcome

Inbound provider events are persisted and claimed before processing. Resolution uses provider
account + owned destination + normalized source + program, produces explicit resolved/ambiguous/
not-found results, and links the existing SMS thread to CRM and canonical chat. Outbound creates
the existing `sms_messages` attempt before calling Twilio and can be replayed by idempotency key.
No rows, tables, or legacy evidence are removed.

## 3. Usage reality

- **Frontend:** SMS writes live in `lib/sms/receive.ts`, `lib/sms/send.ts`, and the two Twilio
  webhook routes; UI reads are under `features/sms/`.
- **Python:** generated communication models/managers exist; no handwritten SMS processor was
  found. `db/generate.py` must regenerate the model surface.
- **DB:** SMS trigger `public.sms_handle_opt_out_keywords()` already reconciles START/STOP after
  an inbound insert. The current route prevents that insert for opted-out senders.
- **Existing primitives reused:** CRM endpoint/party/interaction, `chat.conversation`,
  `platform.assists`, and `platform.matrx_action_ledger`.

## 4. Plan

1. `[DB][reversible]` Add nullable/defaulted context and lifecycle columns, FKs, checks, and
   partial unique indexes to the five existing SMS tables.
2. `[DB][reversible]` Backfill the one destination and conversation from existing rows/webhook
   evidence; give legacy webhook rows unique historical keys without deleting duplicates.
3. `[DB][reversible]` Add a restricted claim/finalize RPC pair plus a tiny `NOTIFY` wake signal;
   the same claim RPC is the durable polling backstop and the notification is only latency help.
4. `[FE]` Regenerate DB types; implement durable receipt claim, scoped resolver, START-first
   processing, ledger-first outbound, daily cap, notification linkage, and monotonic callbacks.
5. `[PY]` Regenerate ORM models and consume the canonical claim/finalize contract in the owner
   beta worker.

## 5. Data migration — lossless proof

No rows move. Pre/post counts must remain `1/1/10/11/0` for phone numbers, conversations,
messages, webhook logs, and notifications. Backfills only populate new columns.

## 6. Decisions

- **D1 — current number program:** use `ai_matrx_owner_beta` for the closed owner test because the
  approved campaign explicitly includes transactional replies and user-requested agent responses;
  move the general assistant to its ratified dedicated sender before public launch.
- **D2 — chat identity:** reserve a client-minted UUID on the SMS conversation and return
  `chatConversationIsNew` from canonical row existence. Aidream creates the chat row on first run.
- **D3 — action execution:** reuse aidream `action_apply` and `platform.matrx_action_ledger`; no
  SMS-specific action executor or receipt ledger.
- **D4 — agent binding:** typed selected agent/version columns live on the existing per-user SMS
  preference and each SMS conversation snapshots that binding. The owned destination/program holds
  only the assistant kill switch. Missing user configuration is an explicit blocked state, never a
  guessed number-wide agent. If one user later joins multiple SMS assistant programs, the preference
  must be promoted to an existing canonical user/program setting or a reviewed program-binding row.

## 7. Acceptance gate

- Duplicate inbound events create one receipt/message and one process claim.
- START from an opted-out number is stored and re-enables the matching local consent evidence.
- Resolved owner beta returns the exact destination/program/user/SMS/chat/agent context; ambiguous
  or not-found executes nothing.
- Outbound intent exists before provider call; duplicate idempotency keys do not resend.
- Hourly and daily limits and notification `message_id` linkage are tested.
- `pnpm db-types`, scoped Jest, TypeScript, Python generation/tests, and live advisors complete.

## 8. Reversibility and data-loss guards

All DDL is additive. The complete 1/1/10/11/0 legacy set is backfilled and verified before new
consumers deploy. There is no silent legacy inference: any genuinely unresolved row is marked with
an explicit `not_found`/repair state and executes nothing. The migration can be rolled back by
stopping new consumers; data remains in the original rows.

## 9. Deferred

- Signup-time account-to-party production remains a separate reviewed change; inbound never
  creates a CRM party lazily.
- A generalized multi-provider attempt table is deferred until a second provider or real
  multi-attempt retry needs it; CRM interaction is intent and each SMS row is one transport attempt.
- Public personal-assistant launch waits for the dedicated sender/program; this change enables the
  explicit single-owner beta only.

## 10. Cross-repo finalize

Apply and ledger the migration, regenerate frontend and aidream types/models, update the canonical
communications docs and repo pointer docs, run checks, commit, and push both primary repositories.

The db-change skill currently references `docs/db_rebuild/SCHEMA_MAP.md`, which is absent from this
checkout. The existing live `communication` schema and generated model declaration establish the
placement, so this proposal does not invent a replacement schema.
