# FEATURE.md — `sms`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-15`

---

## Purpose

The canonical SMS platform for verified user enrollment, consent, Twilio delivery,
inbound/status webhooks, preferences, conversations, and delivery diagnostics. The
browser uses Next.js routes only where Twilio credentials, webhook validation, or a
server-authenticated consent write require a secret boundary.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/communications-platform/FEATURE.md — read it before touching this feature in ANY repo.

---

## Entry points

- `app/(public)/sms/page.tsx` — public, carrier-reviewable opt-in description and disclosure.
- `app/(public)/terms-and-conditions/page.tsx` — SMS program terms.
- `features/settings/tabs/MessagingTab.tsx` — production enrollment, opt-out, and personal text-assistant binding.
- `features/sms/components/SmsAssistantSettingsSection.tsx` — saved-agent selection, per-user pause/disconnect, readiness, and safe-test controls.
- `features/sms/hooks/useSmsAssistantProgram.ts` — direct authenticated RPC adapter for the selected assistant program.
- `app/(dev)/demos/tests/sms/` — internal testing and diagnostics.
- `app/api/sms/verify/route.ts` — Twilio Verify plus verified-consent persistence.
- `app/api/sms/preferences/route.ts` — preference reads/writes; enabling requires existing verified consent.
- `app/api/sms/send/route.ts` — authenticated outbound send path.
- `app/api/webhooks/twilio/sms/route.ts` — inbound messages and keyword handling.
- `app/api/webhooks/twilio/status/route.ts` — delivery-state updates.
- `lib/sms/` — Twilio messaging client, send/receive, verification, number management, and notification services.
- `lib/communications/providers/twilio/webhook-validation.ts` — shared Messaging/Voice signature validation.

---

## Data model

All SMS tables live in the `communication` schema. The enrollment contract primarily uses:

- `sms_notification_preferences` — the user-selected destination, notification switch, assistant-message switch, and preferred agent/version.
- `sms_consent` — current SMS-local consent status, method, timestamp, source IP, and versioned disclosure metadata. It is transitional: its live uniqueness is only `(phone_number, consent_type)`, while `crm.contact_medium` is the intended organization/purpose-aware authority.
- `sms_phone_numbers` — owned/assigned Twilio senders; `assistant_enabled` is the operator-wide program kill switch, never the user toggle.
- `sms_conversations`, `sms_messages`, `sms_media` — durable messaging history.
- `sms_webhook_logs` — webhook diagnostics.

---

## Key flows

### Verified web opt-in

1. A signed-in user opens Communication → Messaging and enters a mobile number.
2. The unchecked disclosure must be affirmatively accepted before `/api/sms/verify` starts Twilio Verify.
3. A successful OTP check writes `sms_consent` with the exact disclosure version and public policy paths.
4. Only after that write succeeds does the route enable `sms_notification_preferences.sms_enabled`.

### Web opt-out

1. The user disables SMS in Messaging settings.
2. `/api/sms/preferences` disables delivery and marks the transactional consent row `opted_out` with `opt_out_method='web_form'`.
3. Keyword opt-out remains handled by the inbound-message trigger for STOP-like replies.

### Outbound delivery

1. Assistant/test replies are first enqueued in `sms_messages`, then claimed by the long-running aidream SMS dispatcher.
2. The dispatcher calls Twilio once and finalizes an explicit provider-creation outcome: accepted, known-failed, or uncertain. An uncertain send is never automatically retried.
3. The Twilio status callback includes the local outbound UUID. The signed webhook can safely correlate an early callback before the provider SID has been finalized, then advances delivery status monotonically.
4. Legacy callers through `lib/sms/send.ts` still call Twilio before inserting the local message; that path retains a durability gap and must not replace the assistant outbox.

### Personal text assistant

1. A signed-in user enrolls a verified phone through the ordinary SMS settings flow.
2. The Text assistant section calls program-scoped `communication.get_my_sms_assistant_program`, `configure_my_sms_assistant[_version]`, and `disconnect_my_sms_assistant` directly through the authenticated browser Supabase client.
3. The user chooses one accessible saved agent, optionally pins a saved version, then explicitly enables assistant messages. Nothing is selected or enabled by default.
4. The inbound webhook durably claims the provider event, gives STOP/HELP/START precedence, resolves the exact provider/account/source/destination/program/user/CRM/conversation binding, and queues only a resolved, ready assistant turn.
5. Aidream runs the canonical agent against the reserved canonical chat conversation with tools disabled, atomically enqueues the reply, and delivers it through the durable outbound worker.
6. Pause preserves the binding. Disconnect clears it. Both leave ordinary SMS-notification enrollment unchanged.

---

## Invariants

- Phone ownership verification is not consent by itself; the explicit disclosure must also be accepted.
- `sms_notification_preferences` never manufactures a consent row. Enabling requires an existing verified, opted-in record for the same user and number.
- The public SMS page, privacy policy, terms URL, settings disclosure, and recorded consent metadata describe one program and must stay aligned.
- `siteConfig.legalOperatorName` is the single legal identity for AI Matrx public policies and carrier registration; the SMS program names both that operator and the AI Matrx product.
- Every outbound body passes through `formatSmsBody`; callers do not hand-roll or omit the `AI Matrx:` brand prefix.
- Every message recipient must have applicable consent unless the message is a system/administrative exception with its own lawful basis.
- STOP, HELP, and START take precedence over agent execution and are durably recorded before opt-out enforcement.
- **Phone number alone is not authorization.** Assistant execution requires the exact verified user/program binding returned by the canonical resolver; ambiguous or missing identity executes nothing.
- **Global and user stops are distinct.** `sms_phone_numbers.assistant_enabled` is read-only health on user surfaces; `sms_notification_preferences.ai_agent_messages` is the user's pause/resume switch.
- **Consequential tools stay disabled in the owner beta.** The SMS worker invokes the canonical agent with an empty replacement tool set.
- A worker crash must not mint a second chat turn or Twilio send. Expired processing/sending claims become explicit stuck/uncertain work for repair, never automatic retries.
- Twilio accepting an API request is not proof of delivery; delivery status comes from the status webhook.
- Message reads page newest-first, but conversation surfaces render each page oldest-to-newest.

## Production gaps verified 2026-08-15

- Legacy `lib/sms/send.ts` calls the provider before durable local intent/claim creation; assistant/test delivery already uses the durable outbox.
- `max_messages_per_day` is stored but only the hourly cap is enforced.
- The broad `system` category bypasses consent and quiet hours and needs a closed, allowlisted definition.
- Notification rows are written with `message_id = null` after sending.
- SMS consent has not converged on the canonical CRM contact-medium eligibility authority.
- The reply-action processor, tenant messaging, and PSTN voice layers remain roadmap work in the cross-repo plan.

---

## Change log

- `2026-08-15` — Aligned the inbound webhook test with the canonical `www.aimatrx.com` signing host and current processor result contract; the route now accepts the standard `Request` surface it actually consumes.
- `2026-08-15` — Added the production personal text-assistant binding to Messaging settings using direct authenticated, program-scoped RPCs; added durable provider-event claims, exact identity/conversation resolution, policy-keyword precedence, canonical agent execution with tools disabled, durable agent/outbound workers, crash fences, early status-callback correlation, and separate global/user kill switches.
- `2026-08-15` — Moved the canonical Twilio signature validator to the shared communications
  provider adapter and removed the former SMS-only implementation after migrating every consumer.
- `2026-08-15` — Linked the cross-repo communications record and corrected the feature truth after a live/source audit: documented the transitional consent authority, Twilio-before-ledger ordering, broken START path, pending messages without a worker, incomplete identity resolution, unenforced daily cap, broad system bypass, and unlinked notification receipts.
- `2026-08-12` — Rendered the newest SMS history page in chronological chat order while preserving newest-first pagination.
- `2026-08-11` — Aligned the public SMS program and site policies to the registered legal operator, versioned the revised consent, and branded every outbound body before send and logging.
- `2026-07-20` — Added a public, carrier-reviewable consent path and SMS terms; moved enrollment into production Messaging settings; versioned the verified consent record; prevented preferences from creating unverified consent; and made the test surface distinguish Twilio acceptance from confirmed delivery.
