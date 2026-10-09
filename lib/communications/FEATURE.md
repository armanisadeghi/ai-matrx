# Communications runtime adapters

**Status:** active foundation; SMS live, closed inbound Voice owner-beta gate implemented.

Cross-repo system of record:
`/Users/armanisadeghi/code/common-docs/systems/communications/STATE.md`.

## Ownership

This folder owns shared channel/runtime contracts and provider adapters. Product notification
policy, CRM identity/consent, provider transport persistence, and agent execution stay with their
canonical owners.

## 🚨 No message leaves a copy of production — `outbound-guard.ts`

A server wired to the nightly clone (the clone preview) holds production's Resend/Twilio/Slack keys
over production's real people. `outboundSuppression(channel, address)` allows a provider call only
when `NEXT_PUBLIC_SUPABASE_URL` is production's (`db.matrxserver.com` or
`brsgrqvjdzwihsvnfqkf.supabase.co`); otherwise only a loopback test handset is reachable and the
seam returns its own failure carrying `suppressed_on_clone` (logged, never a success). Seams:
`lib/email/client.ts::sendEmail`, `app/api/test-email`, `lib/sms/send.ts::sendSms`,
`lib/sms/verify.ts::sendVerification`, `lib/sms/numbers.ts` (`purchasePhoneNumber`,
`updateAllWebhookUrls`), `app/api/slack-proxy`. A new provider send or provider-account write calls
it first. `LOOPBACK_TEST_HANDSETS` mirrors `aidream/aidream/designated_test_recipients.py` (the
single home); `outbound-guard.test.ts` fails when they disagree. aidream's twin:
`aidream/services/clone_connection/outbound_guard.py`.

## 🚨 Test accounts never email a stranger — `test-inbox.ts`

`admin@admin.com` / `test@test.com` sit on domains strangers own. `sendEmail` (every app-email
route reaches Resend through it) runs `routeRecipients`: a test-account address goes to
`DESIGNATED_TEST_INBOX` (info@aimatrx.com, Arman 2026-10-01) with `[Test → <account>]` in the
subject and an `X-Matrx-Original-Recipient` header; real people are untouched. The list mirrors
`aidream/aidream/designated_test_recipients.py` (add accounts there first); `lib/email/test-inbox.test.ts`
and aidream's `scripts/check_test_accounts_never_email_a_stranger.py` fail on drift or on a new
provider send outside the seam.

## Twilio webhook boundary

`providers/twilio/webhook-validation.ts` is the one signature validator for Messaging and Voice.
It parses the URL-encoded body once and reconstructs the exact public URL from forwarded headers,
including the query string. Missing, malformed, or invalid signatures fail closed. The old
SMS-only validator was removed after all consumers moved atomically.

## Inbound Voice owner beta

- Production inbound URL: `https://www.aimatrx.com/api/webhooks/twilio/voice`
- Lifecycle callback URL: `https://www.aimatrx.com/api/webhooks/twilio/voice/status`
- Relay-end callback: `/api/webhooks/twilio/voice/relay-ended` is the signed `<Connect action>`
  target. Unexpected closure explains the interruption then hangs up; explicit app completion
  gets a farewell and completed calls stay silent. An explicit human-handoff code uses the
  admitted destination's configured transfer number and signed `/voice/transfer-ended` result
  callback; unanswered attempts explain the failure and hang up without redial. Never speak provider error or handoff payloads
  and never reconnect or start a second recording from this callback.
- Runtime: short Node.js route handler on Vercel; no long-lived WebSocket.
- Admission: the signed request must match the exactly-one active `ai_matrx_owner_beta`
  destination and its exactly-one verified-phone enrollment by provider account, called number,
  caller, and inbound direction. Unknown, missing, or ambiguous identities hear a safe rejection.
- Response: a branded `<Gather input="dtmf speech">` says this is AI, discloses exact current-call
  recording, storage/review, and 30-day retention, and requires keypad `1` or the phrase `I agree`.
  Timeout and every non-affirmative response hang up without recording.
- After the affirmative evidence commits durably, the route rechecks every provider/storage/
  custody gate. Only a complete pass emits dual-channel `<Start><Recording>` and the existing
  signed lifecycle callback; any missing proof returns explicit non-recording TwiML.

The status and recording routes validate provider-neutral lifecycle events and durably claim them
against canonical `crm.interaction` plus `platform.activity_log`. They do not misuse SMS webhook
logs or invent a call table. Unique provider event keys and monotonic application prevent
duplicate, out-of-order, regressive, and post-terminal events from moving lifecycle backward.

Recording retention uses the canonical Matrx Files governed purge. The CRM call remains durable;
deleting expired recording media clears only `crm.interaction.recording_file_id` through its
`ON DELETE SET NULL` foreign key while preserving consent, provider lifecycle, and audit evidence.

## Console activation and live test

After the code is deployed:

1. In Twilio Console, open the owned voice-capable number.
2. Set **A call comes in** to Webhook, HTTP POST,
   `https://www.aimatrx.com/api/webhooks/twilio/voice`.
3. Set the call status callback to HTTP POST,
   `https://www.aimatrx.com/api/webhooks/twilio/voice/status`, with initiated, ringing, answered, and
   completed selected if the number surface exposes those options.
4. From the same phone already verified in **Settings → Communication → Messaging**, call the
   owned number. Confirm the complete AI/recording disclosure plays. Press `1` or say `I agree`.
   Confirm the response says recording starts only after consent; then confirm the signed lifecycle
   callback, external object, canonical file link, and governed deletion before broader testing.
5. Repeat from a different phone only if you are authorized to test it. Confirm it hears the
   private-line rejection, never reaches `<Gather>`, and nothing is recorded.
6. Leave the authorized call silent through the five-second input timeout. Confirm it says no
   affirmative consent was received and hangs up without recording.
7. Confirm production logs contain only provider account/call ids, program/disclosure evidence,
   and reason codes—never the caller's full phone number. Consent is structured but not durable
   until the lifecycle persistence lane lands.

Do not enable a separate provider-global/default capture source; the signed route owns the exact
post-consent `<Start><Recording>` instruction. Do not point Twilio at a Vercel WebSocket.
The `<Gather>` behavior follows Twilio's official contract for speech/DTMF action callbacks and
`actionOnEmptyResult`; signed requests continue to use Twilio's server SDK validation over the
exact URL and all form parameters:
[Gather](https://www.twilio.com/docs/voice/twiml/gather),
[webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), and
[recording consent guidance](https://help.twilio.com/articles/360011522553).

## Change log

- 2026-10-06 — Added signed relay-end caller fallback and clean hangup; local HTTP callback verified.

- 2026-09-30 — Outbound guard: a clone-wired server never emails, texts, verifies, buys/repoints
  numbers or posts to Slack for real (X1).

- 2026-09-08 — Proved the first live owner recording and made its canonical file pointer
  retention-safe with `ON DELETE SET NULL`, preserving the call when governed media expires.

- 2026-08-17 — Added exact current-call recording disclosure and fail-closed post-consent
  `<Start><Recording>` backed by the existing lifecycle/custody path.
- 2026-08-15 — Replaced the open static Voice answer with exact owner-program/verified-caller
  admission, explicit DTMF/speech continuation, provider-neutral consent evidence, and safe
  rejection/timeout behavior. Recording and live AI remain disabled.
- 2026-08-15 — Generalized Twilio signature validation, removed the SMS-only implementation,
  added signed static inbound Voice TwiML,
  a typed lifecycle callback contract/reducer, structured callback evidence, and tests.
