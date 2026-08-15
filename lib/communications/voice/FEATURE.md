# Voice communications

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/projects/communications-platform/P6-ai-voice-proof.md — read it before touching this feature in ANY repo.

## Purpose

Provider-neutral call, consent, and recording lifecycle contracts for the inbound AI voice proof.
Next.js owns short signed Twilio webhook boundaries and the closed owner-beta admission gate;
long-lived media and agent execution stay in aidream.

## Owner-beta admission and consent

- `owner-beta-program.ts` reuses the existing `ai_matrx_owner_beta` destination and verified-phone
  enrollment. It admits a call only when the active program has exactly one destination and one
  verified caller, and the signed request's provider account, called number, caller, and inbound
  direction all match. Missing or ambiguous bindings fail closed.
- Provider webhooks use the server-only client because they have no user session. Admission itself
  remains read-only; after admission, a separate service-only resolver must prove one pre-existing
  same-tenant party and verified contact point before the route can register the canonical call.
- The caller's full phone number is never returned by the policy and is absent from route logs and
  readiness output.
- Admission returns only the program/destination decision. It deliberately does not return the
  verified enrollment's organization or user as call ownership. Call registration independently
  binds the program to the normal AI Matrx tenant
  `5dc930e9-bd65-44a1-8369-af773f6e1a5b` and resolve a pre-existing same-tenant CRM party and
  verified caller contact point; the webhook never creates or infers either one.
- The initial authorized response uses `<Gather input="dtmf speech">` with
  `actionOnEmptyResult="true"`. Only keypad `1` or a narrow explicit phrase such as `I agree`
  continues; no response, another digit/phrase, low-confidence speech, conflicting inputs, an
  expired disclosure, or a mismatched call reference ends the call without recording.
- `consent.ts` emits the provider-neutral affirmative evidence contract: program, disclosure
  version/hash/time, response kind/value, consent time, source, and provider account/call/event
  keys. The service-only claim RPC atomically correlates that exact evidence to the canonical call,
  writes it to the interaction, and appends its uniquely keyed activity event before accepted
  TwiML can be returned. Mutated replays and persistence failures fail closed.

## Recording safety boundary

- `recording-readiness.ts` is the fail-closed launch gate. Recording stays disabled unless every
  owner-only, disclosure, provider-verification, storage, canary, persistence, canonical-ingest,
  retention, access, and deletion gate passes.
- `recording-lifecycle.ts` is append-only provider evidence keyed by provider account, call,
  recording, and status. Terminal outcomes never regress.
- `providers/twilio/voice.ts` parses Twilio callback fields into that contract. `RecordingUrl` is
  provider evidence only; durable playback uses an AI Matrx canonical file identity.
- `persistence.ts` reuses `crm.interaction` for the canonical call, `platform.activity_log` for
  append-only provider evidence, and `files.files` for durable media. Its service-only RPCs
  register one exact provider/account/call, durably claim call and recording callbacks,
  monotonically preserve terminal state, reject mutated replays and ambiguity, and bind an adopted
  file only to exact completed evidence with the same owner and organization.
- The signed call-status and recording callback POST routes await the database claim before
  returning success. Forged, malformed, uncorrelated, ambiguous, or persistence-failed requests
  return non-success. Provider media URLs are retained only in evidence, never in
  `crm.interaction.recording_url` or as playback identity.
- The static Voice TwiML remains non-recording. External storage configuration is an account-wide
  provider mutation and stays off until the readiness response reports every gate passed.

## Visibility

`GET /api/webhooks/twilio/voice`, `/status`, and `/recording` derive persistence visibility from
the installed schema, unique indexes, service RPCs, exact CRM identity count, ambiguity count, and
provider-URL violation count. They contain no phone number, provider credential, or storage secret
and fail closed if the database proof is unavailable.

## Change log

- **2026-08-15** — Wired the admitted owner call to one pre-existing AI Matrx-tenant CRM party and
  verified phone point, idempotently registered its canonical interaction, and durably claimed
  affirmative consent into the interaction plus activity ledger before accepted TwiML. Resolver,
  registration, consent, and visibility all fail closed; recording remains disabled.
- **2026-08-15** — Applied the provider-neutral call/recording persistence contract to Matrx Main:
  canonical CRM interaction fields, uniquely keyed evidence, exact service-only claim/finalize
  RPCs, monotonic/replay-safe callbacks, canonical file custody binding, live-derived readiness,
  and rollback/forgery/crash/ambiguity/out-of-order coverage. Recording remains disabled.

- **2026-08-15** — Replaced the open static proof with exact owner-program/verified-caller
  admission, an affirmative DTMF/speech consent gate, provider-neutral consent evidence, and
  secret-free readiness visibility. Recording and the live AI connection remain disabled.
- **2026-08-15** — Added the provider-neutral recording lifecycle, strict Twilio callback parser,
  and fail-closed external-storage readiness ledger without enabling capture.
