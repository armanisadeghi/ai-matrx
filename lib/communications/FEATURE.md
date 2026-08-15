# Communications runtime adapters

**Status:** active foundation; SMS live, static inbound Voice ready for provider configuration.

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

## Static inbound Voice proof

- Production inbound URL: `https://www.aimatrx.com/api/webhooks/twilio/voice`
- Lifecycle callback URL: `https://www.aimatrx.com/api/webhooks/twilio/voice/status`
- Runtime: short Node.js route handler on Vercel; no long-lived WebSocket.
- Response: branded `<Say>` disclosure that this is an AI-powered internal test, calls may be
  recorded/reviewed, live AI is not connected yet, and the webhook is working; then `<Hangup>`.
- Recording is **not started** in this phase. Provider external storage, consent evidence,
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
4. Call the number from a consenting internal test phone. Confirm the complete disclosure plays,
   the webhook-working sentence is audible, and the call hangs up cleanly.
5. Confirm production logs contain `Twilio Voice static proof answered` with the `CallSid`; status
   callbacks currently appear as structured evidence but are not yet durable lifecycle rows.

Do not enable recording in Console for this phase, and do not point Twilio at a Vercel WebSocket.

## Change log

- 2026-08-15 — Generalized Twilio signature validation, removed the SMS-only implementation,
  added signed static inbound Voice TwiML,
  a typed lifecycle callback contract/reducer, structured callback evidence, and tests.
