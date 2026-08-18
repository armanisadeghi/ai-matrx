# Communications runtime adapters

**Status:** active foundation; SMS live, closed inbound Voice owner-beta gate implemented.

Cross-repo system of record:
`/Users/armanisadeghi/code/common-docs/systems/communications-platform/FEATURE.md`.

## Ownership

This folder owns shared channel/runtime contracts and provider adapters. Product notification
policy, CRM identity/consent, provider transport persistence, and agent execution stay with their
canonical owners.

## Twilio webhook boundary

`providers/twilio/webhook-validation.ts` is the one signature validator for Messaging and Voice.
It parses the URL-encoded body once and reconstructs the exact public URL from forwarded headers,
including the query string. Missing, malformed, or invalid signatures fail closed. The old
SMS-only validator was removed after all consumers moved atomically.

## Inbound Voice owner beta

- Production inbound URL: `https://www.aimatrx.com/api/webhooks/twilio/voice`
- Lifecycle callback URL: `https://www.aimatrx.com/api/webhooks/twilio/voice/status`
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

- 2026-08-17 — Added exact current-call recording disclosure and fail-closed post-consent
  `<Start><Recording>` backed by the existing lifecycle/custody path.
- 2026-08-15 — Replaced the open static Voice answer with exact owner-program/verified-caller
  admission, explicit DTMF/speech continuation, provider-neutral consent evidence, and safe
  rejection/timeout behavior. Recording and live AI remain disabled.
- 2026-08-15 — Generalized Twilio signature validation, removed the SMS-only implementation,
  added signed static inbound Voice TwiML,
  a typed lifecycle callback contract/reducer, structured callback evidence, and tests.
