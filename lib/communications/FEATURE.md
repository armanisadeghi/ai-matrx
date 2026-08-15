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

## Closed inbound Voice owner beta

- Production inbound URL: `https://www.aimatrx.com/api/webhooks/twilio/voice`
- Lifecycle callback URL: `https://www.aimatrx.com/api/webhooks/twilio/voice/status`
- Runtime: short Node.js route handler on Vercel; no long-lived WebSocket.
- Admission: the signed request must match the exactly-one active `ai_matrx_owner_beta`
  destination and its exactly-one verified-phone enrollment by provider account, called number,
  caller, and inbound direction. Unknown, missing, or ambiguous identities hear a safe rejection.
- Response: a branded `<Gather input="dtmf speech">` says this is AI, says the current call is not
  recorded, discloses how Twilio/AI Matrx may capture and review a future explicitly enabled test,
  and requires keypad `1` or the phrase `I agree`. Timeout and every non-affirmative response hang
  up without recording.
- Recording is **not started** in this phase. Provider external storage, durable consent evidence,
  retention, access, and deletion must be proven together before recording is enabled.

The status route validates and parses a provider-neutral lifecycle event and emits structured
operator evidence. It deliberately does not misuse SMS webhook logs or invent a call table. P0
owns shared schema; phase 2 will persist `providerEventKey` uniquely and apply
`shouldApplyCallLifecycleEvent` so duplicate, out-of-order, regressive, and post-terminal events
cannot move the lifecycle backward.

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
   Confirm the response says consent was received, recording is still off, and live AI is not yet
   connected; then the call hangs up cleanly.
5. Repeat from a different phone only if you are authorized to test it. Confirm it hears the
   private-line rejection, never reaches `<Gather>`, and nothing is recorded.
6. Leave the authorized call silent through the five-second input timeout. Confirm it says no
   affirmative consent was received and hangs up without recording.
7. Confirm production logs contain only provider account/call ids, program/disclosure evidence,
   and reason codes—never the caller's full phone number. Consent is structured but not durable
   until the lifecycle persistence lane lands.

Do not enable recording in Console for this phase, and do not point Twilio at a Vercel WebSocket.
The `<Gather>` behavior follows Twilio's official contract for speech/DTMF action callbacks and
`actionOnEmptyResult`; signed requests continue to use Twilio's server SDK validation over the
exact URL and all form parameters:
[Gather](https://www.twilio.com/docs/voice/twiml/gather),
[webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), and
[recording consent guidance](https://help.twilio.com/articles/360011522553).

## Change log

- 2026-08-15 — Replaced the open static Voice answer with exact owner-program/verified-caller
  admission, explicit DTMF/speech continuation, provider-neutral consent evidence, and safe
  rejection/timeout behavior. Recording and live AI remain disabled.
- 2026-08-15 — Generalized Twilio signature validation, removed the SMS-only implementation,
  added signed static inbound Voice TwiML,
  a typed lifecycle callback contract/reducer, structured callback evidence, and tests.
