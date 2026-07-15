# FEATURE.md — `education/compliance` (School-safe COPPA age gate)

**Status:** `live`
**Tier:** `2` — a study-hub compliance sub-feature
**Last updated:** `2026-07-15`
**Why:** [`docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md`](../../../docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md) §Compliance + [`docs/proposals/education-projects/SCHOOL_SAFE_CHECKLIST.md`](../../../docs/proposals/education-projects/SCHOOL_SAFE_CHECKLIST.md). Keeps the Education Hub installable on school devices (never banned by Apple/Google education review or district IT).

---

## Purpose

Capture a user's **age band** and gate AI/data collection accordingly. An
**under-13** account may use AI features only while a parent has approved it —
enforced by **reusing the guardian-consent system** (`features/education/family`),
never a parallel consent store. The block is a clear "a parent must approve"
state, never a silent failure.

## Data model

- **`users.profiles.age_band`** (`under_13 | 13_17 | adult`, nullable = undeclared).
  A single per-user attribute on the canonical profile row — a column, not a new
  table (reuse-first). Migration `migrations/edu_compliance_age_band_coppa.sql`.
  **Single audited write path (D57, `migrations/edu_age_band_write_guard.sql`):** a
  `BEFORE UPDATE` trigger (`users._guard_age_band_change()`) blocks any direct
  `UPDATE users.profiles SET age_band=...` that doesn't go through
  `edu_set_age_band()` (or a genuine `service_role` caller) — `errcode 42501`. Every
  other profile column is unguarded. Every `age_band` change is audited to
  `education.data_rights_event` (`action='age_band_change'`); a self-declared
  `under_13 → adult` transition sets `detail.review_signal=true` + a loud
  `RAISE WARNING` (detectability signal, not a block — the hard-block-or-not policy
  call is Arman/legal's, see FOUND_DEFECTS D57).
- **RPCs (public, SECURITY DEFINER, authenticated-only):**
  - `edu_set_age_band(band)` — the ONLY validated write path for the caller's own
    band (DB-enforced by the trigger above); writes the audit row.
  - `edu_coppa_gate()` — the authoritative verdict `{age_band, requires_consent,
    has_active_guardian, has_verified_guardian, ai_allowed, reason}`. Reads the
    RLS-guarded `education.guardian_link` server-side (only a definer RPC can), so
    both guardian signals are trustworthy. For an under-13, **`ai_allowed` requires
    a VERIFIED link** (`has_verified_guardian` — an active link with `verified_at`
    set by a COPPA verifiable-consent method), NOT merely an active one. Two
    distinct blocks: `guardian_consent_required` (no active link — ask a parent)
    and `guardian_verification_pending` (active link, parent hasn't completed the
    verifiable step — "waiting for a parent to verify"). Undeclared band → allowed
    (existing users aren't broken) + `age_undeclared` so the UI can nudge. The
    verifiable-consent flow itself lives on the guardian system — see
    [`../family/FEATURE.md`](../family/FEATURE.md) §Verifiable parental consent.

## Entry points

- `coppaService.ts` — typed wrappers over the two RPCs (`StudyResult<T>`).
- `useAiComplianceGate.tsx` — **THE reusable gate primitive.** `ensureAllowed()`
  (server-truth pre-action check; opens the consent dialog + returns false on a
  block) + `<gate.Gate />` + reactive `gate`/`blocked`. On a resolver error it
  **fails CLOSED for the minor path** (D57): a signed-in account with no
  already-resolved allowed verdict is treated as a potential under-13 and blocked;
  an already-resolved adult/13-17/consented-under-13 keeps the softer allow, and a
  not-signed-in visitor (not the gate's subject) is allowed. Always loud
  (`console.error`). `coppaService.isSignedIn()` (local session read) draws the
  signed-in vs anonymous line.
- `components/AiConsentRequiredDialog.tsx` — the "a parent must approve" state,
  routing to `/education/family` (the guardian flow).
- `components/AgeBandPrivacyCard.tsx` — declare age band + see live COPPA status;
  rendered on the "Your data & privacy" surface (`/education/data`).

## How to gate a new AI entry point (the paved path)

```ts
const coppa = useAiComplianceGate();
const onGenerate = async () => {
  if (!(await coppa.ensureAllowed())) return;   // COPPA gate FIRST (school-safe)
  await entitlementGuard.guard(runGeneration);  // then the billing gate
};
// render once near the action:
<coppa.Gate />
```

**Wired everywhere (rollout complete, 2026-07-14):** every education AI-generation
entry point gates FIRST, mirroring `onboard/components/StartHero.tsx` exactly —
`memory/components/MemoryNew.tsx`, `assessment/components/create/AssessmentCreate.tsx`,
`assessment/grade-work/GradeWorkSurface.tsx`, `spoken-practice/components/PracticeSetup.tsx`,
`media/audio/components/AudioStudyNew.tsx`, `media/mindmap/components/MindMapNew.tsx`,
`convert/ConvertContentDialog.tsx` (also covers note generation, which fans out through
this same dialog), and `tutor/components/EducationTutorClient.tsx` (composer has no
per-send hook, so gated at session-start + the composer stays disabled reactively
while blocked — see its inline comment). `engage/` (game hosting/play) triggers no AI
generation — it draws only from existing deck cards / the SRS due queue — so there is
no entry point to gate there.

## Invariants

- **Reuse the guardian system for consent.** The under-13 unblock is an active +
  **VERIFIED** `education.guardian_link` (student = the child) — a mere active link
  (consent captured, not yet verifiable) still blocks. Never build a second consent
  store. The verifiable step lives on the guardian system (`../family/FEATURE.md`).
- **COPPA gate runs BEFORE the entitlement gate.** Entitlements answer "can this plan
  afford it?"; this answers "is this account legally allowed to collect data at all?".
- **Never a silent failure.** A block always renders the "a parent must approve" dialog.
- **Age band is server-validated** via `edu_set_age_band` (whitelist); the gate reads it
  server-side. (Tamper-resistance beyond self-declaration is a policy/verification layer —
  Arman/legal, tracked in the checklist.)
- **The client gate is a first fail-closed layer; the server is now the boundary (D57
  server enforcement DONE).** aidream independently re-checks COPPA at the
  agent-execution funnel (`enforce_education_coppa` in `prepare_agent_run` /
  `_prepare_continue_run`), scoped to education runs by `source_feature` (`education-*`),
  failing CLOSED — so a client bypass (devtools / direct API) is now refused server-side.
  A refusal arrives as a stream `fatal_error` with
  **`error_type === "education_coppa_consent_required"`** (+ a safe `user_message`); surface
  it as the consent-required state (same as the client gate), routing to `/education/family`.
  Contract + wire shape: aidream `services/education_compliance/FEATURE.md`.
  **Verifiable consent is now BUILT** — an under-13 is unblocked only by a VERIFIED
  guardian link, and `edu_coppa_gate.ai_allowed` already encodes it, so aidream's
  gate-reading enforcement inherits verification for free. If aidream ever reads
  `guardian_link` directly instead of the gate, it MUST require
  `verified_at IS NOT NULL` (not just `status='active'`). **`age_band` write-tamper —
  CODE DONE (D57):** the column has exactly one audited write path (see Data model
  above); a direct table write is DB-blocked. **Still open (Arman/legal, not code):**
  `age_band` remains *self-declared* — the audited RPC will still let an under-13 set
  `adult` (now flagged as a review signal, not blocked); and Arman must choose whether
  to require a harder verifiable-age step, plus which guardian verifiable method(s) to
  require + the gov-ID vendor + legal sign-off — see `../family/FEATURE.md` §Verifiable
  parental consent + the runbook
  `docs/proposals/education-projects/COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`.

## Change log

- `2026-07-15` — **D57 `age_band` write-tamper CODE gap closed.** Single audited write
  path: a `BEFORE UPDATE` trigger on `users.profiles` blocks any direct `age_band`
  write outside `edu_set_age_band()` (or `service_role`); every change is now audited
  to `education.data_rights_event`, with a loud review-signal flag on a self-declared
  `under_13 → adult` transition. `migrations/edu_age_band_write_guard.sql`,
  live-verified (Supabase MCP): direct write blocked (42501); RPC succeeds + audits;
  unrelated column edits unaffected. `AgeBandPrivacyCard.tsx` already called the RPC —
  no FE change needed. Self-declared-age policy remains open (Arman/legal).
- `2026-07-15` — **Verifiable parental consent (COPPA §312.5) built** on the guardian
  system. `edu_coppa_gate` now unblocks an under-13 only on a **VERIFIED** active link
  (new `has_verified_guardian` + `guardian_verification_pending` reason); the two child
  states ("ask a parent" vs "waiting for a parent to verify") render distinctly
  (`AiConsentRequiredDialog`, `AgeBandPrivacyCard`). The verification flow, methods
  (card live / signed-form scaffold / vendor stub), and schema live in
  `../family/FEATURE.md`. Because aidream's enforcement reads the same gate, the server
  boundary inherits verification. Live-verified (Supabase MCP + Stripe test webhook):
  block → card-verify → allow → revoke → block. `migrations/edu_guardian_verifiable_consent.sql`.
- `2026-07-15` — D57 **server enforcement DONE** (aidream). The agent-execution funnel now
  independently refuses education generation for an unconsented under-13
  (`enforce_education_coppa`, scoped by `source_feature=education-*`, fails closed), returning
  a stream `fatal_error` `error_type="education_coppa_consent_required"`. This closes the
  client-bypass hole; the FE surfaces that error as the consent-required state. Contract:
  aidream `services/education_compliance/FEATURE.md`. Self-declared `age_band` +
  verifiable-consent *method* remain open (Arman/legal).
- `2026-07-15` — D57: `ensureAllowed()` no longer fails OPEN on a resolver error. It now
  fails CLOSED for the minor path (signed-in + no prior allowed verdict → blocked), while
  preserving the softer fail-open for already-resolved adults/teens and not-signed-in
  visitors. Added `coppaService.isSignedIn()`. Live-verified the gate verdicts (under-13
  no-guardian → `ai_allowed:false`; adult → `true`; consented under-13 → `true`).
  Server-side enforcement + verifiable consent remain open (FOUND_DEFECTS D57).
- `2026-07-14` — Rollout completed to every remaining AI-generation entry point (memory,
  quizzes/practice tests, handwritten grading, spoken practice, audio study, mind maps,
  convert/note fan-out, tutor). `engage/` confirmed to have no AI trigger (deck/SRS-only).
  Live-verified via Supabase MCP + Playwright: under-13 + no guardian blocked generation
  with the consent dialog on memory, quizzes, and grade-work; switching the account to
  `adult` let all three proceed. `SCHOOL_SAFE_CHECKLIST.md` item marked complete.
- `2026-07-15` — Feature created. `users.profiles.age_band` + `edu_set_age_band` /
  `edu_coppa_gate` RPCs (`migrations/edu_compliance_age_band_coppa.sql`, applied + ledgered).
  `useAiComplianceGate` primitive + consent dialog + age-band card. Wired the Study Kit
  front door. MCP-verified: under-13 + no guardian → blocked; +active guardian / adult / teen
  → allowed.
