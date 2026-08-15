# Voice communications

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/projects/communications-platform/P6-ai-voice-proof.md — read it before touching this feature in ANY repo.

## Purpose

Provider-neutral call and recording lifecycle contracts for the inbound AI voice proof. Next.js
owns short signed Twilio webhook boundaries; long-lived media and agent execution stay in aidream.

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

`GET /api/webhooks/twilio/voice` reports the current static proof plus the complete recording gate
ledger. It contains no provider or storage secrets.

## Change log

- **2026-08-15** — Added the provider-neutral recording lifecycle, strict Twilio callback parser,
  and fail-closed external-storage readiness ledger without enabling capture.
