# FEATURE.md — `sms`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-07-20`

---

## Purpose

The canonical SMS platform for verified user enrollment, consent, Twilio delivery,
inbound/status webhooks, preferences, conversations, and delivery diagnostics. The
browser uses Next.js routes only where Twilio credentials, webhook validation, or a
server-authenticated consent write require a secret boundary.

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
- `lib/sms/` — Twilio client, send/receive, verification, number management, validation, and notification services.

---

## Data model

All SMS tables live in the `communication` schema. The enrollment contract primarily uses:

- `sms_notification_preferences` — the user-selected destination and delivery switches.
- `sms_consent` — consent status, method, timestamp, source IP, and versioned disclosure metadata.
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
2. The message is logged immediately with its Twilio SID and initial status.
3. The send route reports Twilio's initial state as accepted/pending, never as confirmed delivery.
4. Twilio posts later delivery states to `/api/webhooks/twilio/status`; the handler advances status monotonically and records carrier errors.

---

## Invariants

- Phone ownership verification is not consent by itself; the explicit disclosure must also be accepted.
- `sms_notification_preferences` never manufactures a consent row. Enabling requires an existing verified, opted-in record for the same user and number.
- The public SMS page, privacy policy, terms URL, settings disclosure, and recorded consent metadata describe one program and must stay aligned.
- Every message recipient must have applicable consent unless the message is a system/administrative exception with its own lawful basis.
- STOP-like keywords and the web settings control both produce a durable opt-out record.
- Twilio accepting an API request is not proof of delivery; delivery status comes from the status webhook.

---

## Change log

- `2026-07-20` — Added a public, carrier-reviewable consent path and SMS terms; moved enrollment into production Messaging settings; versioned the verified consent record; prevented preferences from creating unverified consent; and made the test surface distinguish Twilio acceptance from confirmed delivery.
