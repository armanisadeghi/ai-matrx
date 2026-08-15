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
- `features/settings/tabs/MessagingTab.tsx` — production user enrollment and opt-out surface.
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

- `sms_notification_preferences` — the user-selected destination and delivery switches.
- `sms_consent` — current SMS-local consent status, method, timestamp, source IP, and versioned disclosure metadata. It is transitional: its live uniqueness is only `(phone_number, consent_type)`, while `crm.contact_medium` is the intended organization/purpose-aware authority.
- `sms_phone_numbers` — owned/assigned Twilio senders.
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

1. A server-side caller sends through `lib/sms/send.ts` using an explicit assigned number or the configured Messaging Service.
2. `formatSmsBody` adds the canonical `AI Matrx:` product-brand prefix before Twilio receives or the database logs the message.
3. The current implementation calls Twilio first, then inserts the message with its Twilio SID and initial status. This is a production durability gap: provider acceptance can succeed before the local record exists.
4. The send route reports Twilio's initial state as accepted/pending, never as confirmed delivery.
5. Twilio posts later delivery states to `/api/webhooks/twilio/status`; the handler advances status monotonically and records carrier errors.

---

## Invariants

- Phone ownership verification is not consent by itself; the explicit disclosure must also be accepted.
- `sms_notification_preferences` never manufactures a consent row. Enabling requires an existing verified, opted-in record for the same user and number.
- The public SMS page, privacy policy, terms URL, settings disclosure, and recorded consent metadata describe one program and must stay aligned.
- `siteConfig.legalOperatorName` is the single legal identity for AI Matrx public policies and carrier registration; the SMS program names both that operator and the AI Matrx product.
- Every outbound body passes through `formatSmsBody`; callers do not hand-roll or omit the `AI Matrx:` brand prefix.
- Every message recipient must have applicable consent unless the message is a system/administrative exception with its own lawful basis.
- STOP-like keywords and the web settings control both produce a durable opt-out record. Reply-based START is currently broken because the webhook rejects opted-out senders before insertion; the cross-repo plan treats this as a launch blocker.
- Twilio accepting an API request is not proof of delivery; delivery status comes from the status webhook.
- Message reads page newest-first, but conversation surfaces render each page oldest-to-newest.

## Production gaps verified 2026-08-15

- Inbound messages are marked `ai_processing_status='pending'`, but no worker consumes them.
- Account resolution uses the raw sender/receiver phone pair plus an assigned user or preference row; it does not resolve provider tenant, organization, CRM party/contact medium, program, exact action, or canonical chat conversation.
- Webhook application failures return HTTP 200 even when durable receipt is not guaranteed, so provider retries can be lost.
- Outbound provider calls precede durable local intent/claim creation.
- `max_messages_per_day` is stored but only the hourly cap is enforced.
- The broad `system` category bypasses consent and quiet hours and needs a closed, allowlisted definition.
- Notification rows are written with `message_id = null` after sending.
- SMS consent has not converged on the canonical CRM contact-medium eligibility authority.
- The reply-action processor, personal text assistant, tenant messaging, and PSTN voice layers are roadmap work in the cross-repo plan.

---

## Change log

- `2026-08-15` — Aligned the inbound webhook test with the canonical `www.aimatrx.com` signing host and current processor result contract; the route now accepts the standard `Request` surface it actually consumes.
- `2026-08-15` — Moved the canonical Twilio signature validator to the shared communications
  provider adapter and removed the former SMS-only implementation after migrating every consumer.
- `2026-08-15` — Linked the cross-repo communications record and corrected the feature truth after a live/source audit: documented the transitional consent authority, Twilio-before-ledger ordering, broken START path, pending messages without a worker, incomplete identity resolution, unenforced daily cap, broad system bypass, and unlinked notification receipts.
- `2026-08-12` — Rendered the newest SMS history page in chronological chat order while preserving newest-first pagination.
- `2026-08-11` — Aligned the public SMS program and site policies to the registered legal operator, versioned the revised consent, and branded every outbound body before send and logging.
- `2026-07-20` — Added a public, carrier-reviewable consent path and SMS terms; moved enrollment into production Messaging settings; versioned the verified consent record; prevented preferences from creating unverified consent; and made the test surface distinguish Twilio acceptance from confirmed delivery.
