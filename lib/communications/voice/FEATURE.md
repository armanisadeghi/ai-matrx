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
- The read uses the server-only client because a provider webhook has no user session. It is
  read-only: the Voice route cannot enroll a caller, change a program, create consent, or mutate a
  call.
- The caller's full phone number is never returned by the policy and is absent from route logs and
  readiness output.
- Admission returns only the program/destination decision. It deliberately does not return the
  verified enrollment's organization or user as call ownership. Future call registration must
  independently bind the program to the normal AI Matrx tenant and resolve a pre-existing
  same-tenant CRM party; this gate never creates or infers either one.
- The initial authorized response uses `<Gather input="dtmf speech">` with
  `actionOnEmptyResult="true"`. Only keypad `1` or a narrow explicit phrase such as `I agree`
  continues; no response, another digit/phrase, low-confidence speech, conflicting inputs, an
  expired disclosure, or a mismatched call reference ends the call without recording.
- `consent.ts` emits the provider-neutral affirmative evidence contract for the future durable
  lifecycle writer: program, disclosure version/hash/time, response kind/value, consent time,
  source, and provider account/call/event keys. This phase emits structured evidence but does not
  persist it.

## Recording safety boundary

- `recording-readiness.ts` is the fail-closed launch gate. Recording stays disabled unless every
  owner-only, disclosure, provider-verification, storage, canary, persistence, canonical-ingest,
  retention, access, and deletion gate passes.
- `recording-lifecycle.ts` is append-only provider evidence keyed by provider account, call,
  recording, and status. Terminal outcomes never regress.
- `providers/twilio/voice.ts` parses Twilio callback fields into that contract. `RecordingUrl` is
  provider evidence only; durable playback uses an AI Matrx canonical file identity.
- The recording callback POST route is intentionally absent until it can persist before
  acknowledgement. Logging and returning success would lose retried callbacks.
- The static Voice TwiML remains non-recording. External storage configuration is an account-wide
  provider mutation and stays off until the readiness response reports every gate passed.

## Visibility

`GET /api/webhooks/twilio/voice` reports the live owner-beta binding state, consent contract, and
complete recording gate ledger. It contains no phone number, provider credential, or storage
secret.

## Change log

- **2026-08-15** — Replaced the open static proof with exact owner-program/verified-caller
  admission, an affirmative DTMF/speech consent gate, provider-neutral consent evidence, and
  secret-free readiness visibility. Recording and the live AI connection remain disabled.
- **2026-08-15** — Added the provider-neutral recording lifecycle, strict Twilio callback parser,
  and fail-closed external-storage readiness ledger without enabling capture.
