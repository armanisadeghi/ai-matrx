# FEATURE.md — `education/compliance` (School-safe COPPA age gate)

**Status:** `live`
**Tier:** `2` — a study-hub compliance sub-feature
**Last updated:** `2026-07-14`
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
- **RPCs (public, SECURITY DEFINER, authenticated-only):**
  - `edu_set_age_band(band)` — validated single write path for the caller's own band.
  - `edu_coppa_gate()` — the authoritative verdict `{age_band, requires_consent,
    has_active_guardian, ai_allowed, reason}`. Reads the RLS-guarded
    `education.guardian_link` server-side (only a definer RPC can), so
    `has_active_guardian` is trustworthy. `ai_allowed = false` (reason
    `guardian_consent_required`) only for an under-13 with no active inbound
    guardian link. Undeclared band → allowed (existing users aren't broken) +
    `age_undeclared` so the UI can nudge.

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

- **Reuse the guardian system for consent.** The under-13 unblock is an active
  `education.guardian_link` (student = the child). Never build a second consent store.
- **COPPA gate runs BEFORE the entitlement gate.** Entitlements answer "can this plan
  afford it?"; this answers "is this account legally allowed to collect data at all?".
- **Never a silent failure.** A block always renders the "a parent must approve" dialog.
- **Age band is server-validated** via `edu_set_age_band` (whitelist); the gate reads it
  server-side. (Tamper-resistance beyond self-declaration is a policy/verification layer —
  Arman/legal, tracked in the checklist.)
- **The client gate is a first fail-closed layer, NOT the boundary (D57 open).** aidream's
  education-generation seam does NOT yet re-check `edu_coppa_gate`, so a client bypass
  (devtools / direct API) still reaches AI generation, and `age_band` is self-declared
  (an under-13 can call `edu_set_age_band('adult')`). Server-side enforcement at the
  aidream compute boundary + a verifiable-consent path (not self-attestation) remain the
  real child-safety work — tracked in `FOUND_DEFECTS.md` D57 (decides: Arman/legal).

## Change log

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
