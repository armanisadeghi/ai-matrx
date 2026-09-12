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
- **The call outlives its recording media.** `interaction_recording_file_id_fkey` uses
  `ON DELETE SET NULL`, so the one governed Matrx Files purge can expire recording bytes while
  retaining provider lifecycle, consent, custody time, and immutable activity receipts. File
  authorization and purge remain entirely owned by Matrx Files.
- The signed call-status and recording callback POST routes await the database claim before
  returning success. Forged, malformed, uncorrelated, ambiguous, or persistence-failed requests
  return non-success. Provider media URLs are retained only in evidence, never in
  `crm.interaction.recording_url` or as playback identity.
- The accepted owner-beta TwiML emits Twilio `<Start><Recording>` only after the v2 disclosure,
  exact affirmative input, durable consent claim, and a runtime pass of every recording
  gate. Capture is dual-channel/both-track, begins after consent, and posts `in-progress`,
  `completed`, and `absent` events to the existing signed recording callback. Any missing or
  unavailable readiness evidence returns explicit non-recording TwiML.
- The accepted-response builder has one composition seam for the later live-agent launch: after
  recording starts it can emit `<Connect><ConversationRelay>` with the durable one-time
  `sessionReference`. It deliberately omits the unpublished optional `events` subscription.
  The route consumes this option only after aidream independently revalidates the exact Twilio
  signature/routing, resolves `voice.owner_beta` for the canonical actor and organization, creates
  the durable chat conversation, and idempotently issues the short-lived reference. Preparation
  failure is persisted as a structured `ops.system_error`, preserves recording, and omits the connection; absent recording readiness refuses both
  because the disclosed owner-beta program promised capture after consent. A connected relay greets
  the caller with `Recording has started. How can I help you?`; a preparation failure says the AI
  could not connect and ends the recorded call. Neither path claims the test worked.
- Relay-preparation failure telemetry is deliberately bounded: it records only a typed failure
  code and, for an HTTP refusal, a validated status. It never persists an upstream response body,
  exception text, signature, signed URL, or session reference.
- `storage-canary-readiness.ts` reads the latest owner-program pass/fail receipt from the existing
  `platform.activity_log` ledger and validates the exact bucket, prefix, writer ARN, retention
  policy, deny checks, application HEAD/read/hash, and canonical index/access/delete receipts. An
  exact pass remains the configuration/custody proof until an explicit failed or invalidated receipt;
  it is not misrepresented as a 24-hour runtime-health probe. A missing, failed, malformed, or
  future-dated receipt fails closed. Visibility exposes only event identity—not credential
  fingerprints, object paths, storage URIs, or secrets.
- `provider-configuration-readiness.ts` reads the latest operator verification or invalidation from
  that same activity ledger. It validates the exact AI Matrx organization/operator, Twilio
  account fingerprint and region, external-storage credential fingerprint and S3 target, confirms capture is
  still off. Account email verification is a completed administrative setup fact, not a 24-hour
  recording gate; only an explicit invalidation or mismatched receipt closes the gate. The Voice
  response exposes only readiness and receipt id—never provider, credential, account, or storage
  identifiers. This evidence
  supplies only the provider-account and external-configuration gates. The consent gate is always
  per-call: readiness may report that the standing prerequisites are ready for a consented call,
  but it never represents a prior call's consent as consent for the current one.

## Visibility

`GET /api/webhooks/twilio/voice`, `/status`, and `/recording` derive persistence visibility from
the installed schema, unique indexes, service RPCs, exact CRM identity count, ambiguity count, and
provider-URL violation count. They contain no phone number, provider credential, or storage secret
and fail closed if the database proof is unavailable. The main Voice GET also derives storage
readiness from the durable canary receipt; it still reports recording disabled regardless of that
receipt because provider verification, external configuration, and disclosure proof are separate
gates.

The main Voice GET also derives provider-account-verification and external-storage readiness from an
exact durable operator receipt instead of hard-coded booleans. Missing, invalidated, malformed, or
future-dated evidence fails closed. Because GET has no call to consent, it reports
`readyForConsentedCall` and `requiresPerCallConsent` separately: when all standing prerequisites
pass, its mode is `awaiting_call_consent`, but recording remains disabled. The POST route still
requires the exact current-call disclosure and durable affirmative consent before it can emit
capture TwiML.

The main Voice GET reads the secret-free ConversationRelay runtime facts from aidream rather than
inventing switch values. Owner-beta readiness requires the public route and its live code/provider/
program/routing gates; the unverified optional provider playback decoder and its durable playback
activity consumer are reported separately and do not block the basic owner beta. This is readiness
only: no token/transcript/audio content, phone, provider URL, session reference, signature, or
credential is returned.

## Change log

- **2026-09-08** — Proved the first live owner recording through signed consent, dual-channel
  capture, external S3 storage, canonical file adoption, CRM binding, and owner-authorized WAV
  playback. Corrected the recording-file FK to `ON DELETE SET NULL` so governed retention can
  delete media without deleting the call or bypassing Matrx Files.

- **2026-09-11** — Kept exact provider and custody receipts as fail-closed configuration evidence,
  while removing invented 24-hour expiry gates. ConversationRelay preparation failures now create
  a secret-free structured error rather than silently dropping the connection.

- **2026-09-11** — Replaced hard-coded ConversationRelay launch status with aidream's secret-free
  runtime response and separated basic owner-beta admission from optional playback evidence.

- **2026-09-11** — Made Voice GET distinguish standing readiness for a future consented call from
  the current call's required affirmative consent. It remains non-recording and never reports a
  historic consent as current consent.

- **2026-09-11** — Retained typed ConversationRelay preparation failure codes and validated HTTP
  statuses in `ops.system_error`, so a post-consent backend refusal is diagnosable without retaining
  signed request material or upstream error content.

- **2026-09-11** — Separated the live AI welcome greeting from the honest recorded-but-unconnected
  terminal response; neither caller-facing path claims the recording test succeeded.

- **2026-08-17** — Completed the first-call handoff: the signed webhook forwards exact signed form
  material through the typed backend client, aidream independently revalidates and prepares the
  canonical Mandate/conversation/reference, and accepted TwiML starts recording before connecting.
  Optional playback events remain omitted; no provider switch changed.

- **2026-08-17** — Extended the one accepted-response builder so a later launch can compose
  consented recording before ConversationRelay, carry only the opaque one-time reference, and omit
  unpublished provider-event subscriptions. The current route still does not connect.
- **2026-08-17** — Upgraded the owner-beta disclosure to exact current-call recording consent and
  added fail-closed post-consent `<Start><Recording>` with dual-channel/both-track capture plus the
  existing signed lifecycle callback. Missing runtime evidence still returns non-recording TwiML.
- **2026-08-17** — Replaced the two provider-configuration placeholder gates with exact,
  secret-free `platform.activity_log` evidence. Email verification expires after 24 hours,
  reviewed external configuration after 30 days, invalidations win by recency, and recording
  disclosure remains false.
- **2026-08-16** — Marked the reviewed aidream public WSS mount ready while preserving separate
  false owned-number, code, provider, program, and provider-decoder gates. Voice readiness is nine
  of fourteen and remains disabled.
- **2026-08-16** — Added fail-closed ConversationRelay readiness to the existing Voice GET. The
  response reuses live canonical call-lifecycle proof, exposes the inert gateway inventory, and
  keeps provider evidence decoding, playback persistence, routing, and all launch switches false.
- **2026-08-16** — Wired the durable non-recording storage-canary receipt into the Voice readiness
  GET. Exact fresh evidence now derives the dedicated-writer, canary, canonical-file, and governed
  retention/access/delete gates without exposing credentials or enabling storage/recording.
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
