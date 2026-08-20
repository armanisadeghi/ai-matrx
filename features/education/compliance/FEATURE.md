# FEATURE.md — `education/compliance` (School-safe COPPA age gate)

**Status:** `live`
**Tier:** `2` — a study-hub compliance sub-feature
**Last updated:** `2026-08-17`

> 🚨 **Until 2026-08-17 this gate protected nobody.** Every layer below was built
> correctly and `users.profiles.age_band` was NULL for all 269 accounts in the
> database, so `edu_coppa_gate()` returned `ai_allowed=true` universally. Age
> declaration is now **mandatory** for a signed-in account and the
> `under_13 → adult` self-transition is **hard-blocked**. Project context:
> `common-docs/projects/education-platform/` (WP9).
**Why:** [`STATE.md` §2.4](../../../../common-docs/projects/education-platform/STATE.md) §Compliance + [`docs/proposals/education-projects/SCHOOL_SAFE_CHECKLIST.md`](../../../docs/proposals/education-projects/SCHOOL_SAFE_CHECKLIST.md). Keeps the Education Hub installable on school devices (never banned by Apple/Google education review or district IT).

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
    band (DB-enforced by the trigger above); writes the audit row. **Returns
    `jsonb` `{status, age_band, reason, message?}`, not a bare band.** A child may
    never self-declare out of `under_13`: that write comes back
    `status: "blocked"` with the band **unchanged** and the refusal audited as
    `age_band_change_blocked`. It does NOT raise — raising would roll back the
    audit row itself — so **callers must read `status`**; a block never populates
    `result.error`. Downgrades and first declarations always proceed, and
    `13_17 → adult` stays open (not a COPPA escape).
  - `edu_guardian_set_age_band(student_user_id, band)` — the sanctioned route out
    of `under_13` for a child who genuinely had a birthday, requiring an active
    **and VERIFIED** guardian link (42501 otherwise). This is why the hard block
    is not a dead end; the UI is `family/components/StudentAgeBandControl.tsx`,
    rendered only on a verified link.
  - `edu_coppa_gate_for(user_id)` — **THE one verdict implementation.** Not
    executable by `authenticated` (it would disclose another user's age band);
    aidream's server-side gate calls it directly, so the two enforcement layers
    read one function and cannot drift.
  - `edu_coppa_gate()` — the authoritative verdict `{age_band, requires_consent,
    has_active_guardian, has_verified_guardian, is_anonymous, ai_allowed,
    reason}`, a thin `edu_coppa_gate_for(auth.uid())` wrapper. Reads the
    RLS-guarded `education.guardian_link` server-side (only a definer RPC can), so
    both guardian signals are trustworthy. For an under-13, **`ai_allowed` requires
    a VERIFIED link** (`has_verified_guardian` — an active link with `verified_at`
    set by a COPPA verifiable-consent method), NOT merely an active one. Two
    distinct blocks: `guardian_consent_required` (no active link — ask a parent)
    and `guardian_verification_pending` (active link, parent hasn't completed the
    verifiable step — "waiting for a parent to verify"). A **signed-in undeclared
    band is ALLOWED with a nudge** (`age_undeclared` — hard-blocking it broke
    ~232 accounts on 2026-08-17). A **GUEST (anonymous) with no declared band is
    BLOCKED** with reason `guest_age_undeclared` (since 2026-08-19): a guest must
    declare (or sign in) before education AI — closing the "sign out and keep
    using AI as a guest" hole. A guest who declares 13-17/adult is allowed;
    under-13 routes to the guardian flow. **no-subject callers stay allowed.**
    The verifiable-consent flow itself lives on the guardian system — see
    [`../family/FEATURE.md`](../family/FEATURE.md) §Verifiable parental consent.

## Entry points

- `coppaService.ts` — typed wrappers over the two RPCs (`StudyResult<T>`).
- `useAiComplianceGate.tsx` — **THE reusable gate primitive.** `ensureAllowed()`
  (server-truth pre-action check; opens the right dialog + returns false on a
  block) + `<gate.Gate />` + reactive `gate`/`blocked`. **Two blocks, two
  dialogs, one entry point:** `age_undeclared` opens `AgeDeclarationDialog`,
  writes the band, and **resolves to the post-declaration verdict** — so a teen
  or adult declares once and the action they originally clicked proceeds without
  a second click; anything else opens `AiConsentRequiredDialog`. Because all nine
  AI entry points already share this primitive, both behaviours land everywhere
  from here — never re-implement either dialog at a call site. On a resolver error it
  **fails CLOSED for the minor path** (D57): a signed-in account with no
  already-resolved allowed verdict is treated as a potential under-13 and blocked;
  an already-resolved adult/13-17/consented-under-13 keeps the softer allow, and a
  not-signed-in visitor (not the gate's subject) is allowed. Always loud
  (`console.error`). `coppaService.isSignedIn()` (local session read) draws the
  signed-in vs anonymous line.
- `components/AiConsentRequiredDialog.tsx` — the "a parent must approve" state,
  routing to `/education/family` (the guardian flow).
- `components/AgeDeclarationDialog.tsx` — the one-tap mandatory age prompt shown
  at any AI entry point when the account has no declared band. A step, not a
  wall: picking a band resumes the original action.
- **`utils/education/serverCoppaGate.ts` — THE server-side verdict for a Next.js
  API route.** 🚨 **Any route that hands a client the means to reach a model MUST
  call `resolveServerCoppaVerdict(userId)` and refuse when `aiAllowed` is false.**
  aidream's `enforce_education_coppa` sits in the agent-run funnel, so a route
  that mints a credential the BROWSER then uses to talk to a provider directly
  never reaches it — aidream never sees the generation and cannot refuse it.
  `/api/voice-agent/token` was exactly that shape and had **no gate at all**: an
  unconsented under-13 could hold a live voice conversation with a model, with
  neither enforcement layer present (adversarial review, 2026-08-17). It reads
  the same `edu_coppa_gate_for` the other two layers read, **fails closed**, and
  is deliberately **account-scoped, not education-scoped** — COPPA is a fact
  about the account, not about which page the child is on.
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
  **`error_type === "education_coppa_consent_required"`** (+ a safe `user_message`). The
  canonical stream-error path (`process-stream.ts`) already prefers `user_message` over the
  diagnostic `message`, so a streaming surface shows the safe text. 🚨 **No education surface
  yet maps this `error_type` to the consent DIALOG** — an earlier version of this doc claimed it
  did, which was false (2026-08-17 incident: a non-streaming path surfaced the raw diagnostic
  `message`). The primary defence is now the **proactive prompt** (`EducationAgeGateMount`, in the
  education layout) plus the per-action gate, both of which settle COPPA *before* an action runs.
  Wiring the `error_type` → dialog handler as belt-and-suspenders defense-in-depth for headless
  paths is a tracked follow-up. Contract + wire shape: aidream
  `services/education_compliance/FEATURE.md`.
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
  `/Users/armanisadeghi/code/common-docs/projects/education-platform/COPPA_CONSENT_RUNBOOK.md`.

## How a learner is identified — up front, never via an error

Three layers, in the order they fire:

1. **`EducationAgeGateMount`** (education layout) — the moment a learner enters the education
   area, an **undeclared** account — signed-in OR guest — is asked for its age band **once, up
   front**, with `AgeDeclarationDialog` (guests also get a sign-in link). This is "identify before
   submit". It never blocks browsing.
2. **`useAiComplianceGate.ensureAllowed()`** (per AI action) — the last line before a generation.
   A still-undeclared learner (or guest) is prompted here too and the action resumes on answer; a
   declared under-13 without a verified guardian gets the consent dialog.
3. **The server gate** (aidream) — refuses a declared under-13 without verified consent, and an
   undeclared guest, even if the client is bypassed.

For a SIGNED-IN account, undeclared is **allowed** at the generation boundary (it only nudges),
because declaration is enforced by layers 1–2, not by failing an established account's request —
see the incident note in the change log. For a **GUEST**, undeclared is **blocked** at the
boundary (`guest_age_undeclared`): a guest is brand-new and ephemeral, so asking up front breaks
no one, and it closes the sign-out-to-guest hole. Signup itself does not collect age (OAuth /
guest-conversion paths would bypass a form field, and a global age screen would mis-scope a
study-age question onto every platform signup); the education-entry prompt is the universal,
correctly-scoped collection point.

## Known limits — read before claiming a surface is school-safe

- **The gate is education-scoped.** An unconsented under-13 is refused on education
  AI and can still reach `/ai/chat`, podcasts and transcription, because the
  scoping is by `source_feature`, not by account. Two education surfaces (Audio
  Study, ingest transcription) route through those ungated pipelines. Raised as
  ARMAN_DECISIONS **D-4b** with a recommendation to enforce platform-wide.
- **Guest sessions are now gated (2026-08-19, D-4b).** A guest (anonymous) with no
  declared age band is refused for education AI (`guest_age_undeclared`) and asked
  to declare (or sign in) via `AgeDeclarationDialog` — the "sign out and keep using
  AI as a guest" hole is closed. A guest who declares 13-17/adult proceeds; under-13
  routes to the guardian flow (which needs signing up). The guest block is
  education-scoped (`ai_allowed`); platform-wide non-education guest AI is untouched.
  🚨 **Enforcement is the SERVER gate, not the browser client gate, for the common
  guest.** A browser guest is **fingerprint-based** — aidream mints its anonymous
  `auth.users` row server-side (`matrx-ai/db/guest_registry.py`); the browser holds
  NO Supabase session, so `edu_coppa_gate()` (keyed on `auth.uid()`) returns
  `no_subject → allowed` and the client gate / proactive prompt do not see it. Such
  a guest is refused by **aidream's** `enforce_education_coppa` when the education
  generation runs, and the refusal's safe `user_message` ("Tell us your age … or
  sign in") surfaces via the canonical stream-error path. The interactive
  `AgeDeclarationDialog` fires only where the browser genuinely holds an anonymous
  Supabase session (and for the up-front proactive prompt). **Follow-up:** map the
  `education_age_declaration_required` (and `education_coppa_consent_required`)
  fatal_error → the dialog on education surfaces, so a fingerprint guest gets the
  interactive prompt rather than a message — the same tracked headless-path wiring
  already noted for the consent error.
- **The age band is still self-attested at FIRST declaration.** The hard block
  stops the *escape* (`under_13 → adult`), not the initial lie. A verifiable-age
  step is Arman/legal (A-2).
- **The 30-day hard purge is not scheduled** — delete is soft and reversible, but
  nothing permanently purges yet.

## Change log

- `2026-08-19` — **Guest (anonymous) sessions gated for education (D-4b).** Closed
  the "sign out and keep using AI as a guest" hole: `edu_coppa_gate_for` now refuses
  a guest with no declared age band (`ai_allowed=false, reason='guest_age_undeclared'`)
  and drives it into the age-declaration prompt (with a sign-in nudge) instead of
  a hard fail. One verdict function → all three enforcement layers inherit it (this
  client gate, aidream's `enforce_education_coppa`, and `serverCoppaGate`). A guest
  who declares 13-17/adult proceeds; under-13 hands off to the guardian flow. A
  signed-in undeclared account is UNCHANGED (still `age_undeclared`, nudge only — the
  2026-08-17 incident fix is preserved); the distinction is `is_anonymous AND age_band
  IS NULL`. The universal (non-education) guard keys on `under_13`, which a guest never
  has, so platform-wide guest AI is untouched. FE: `useAiComplianceGate` /
  `EducationAgeGateMount` now prompt guests; `AgeDeclarationDialog` gains an `isGuest`
  sign-in link; `serverCoppaGate.coppaRefusal` + the voice-token route return the
  guest-declaration error (`education_age_declaration_required`). DB record:
  `migrations/edu_coppa_gate_guest_declaration.sql`. Verified live (adversarial, 7/7).
- `2026-08-17` — **INCIDENT + corrective flow.** The same-day "undeclared age hard-blocks
  generation" change (task #2) broke every existing account: 276 of 277 profiles had a NULL age
  band and nothing collected it, so ~232 real accounts were refused ALL education AI with a raw
  server error and no built path to declare. Root cause: a server-enforced hard block keyed on a
  field NULL for 100% of accounts, with no signup collection, no proactive prompt, and no graceful
  error handling — and a FEATURE.md that CLAIMED the FE mapped `education_coppa_consent_required`
  to the consent dialog when no code did. **Corrected:** undeclared now ALLOWS at the generation
  boundary (only a KNOWN unconsented under-13 is refused); declaration is collected up front by the
  new **`EducationAgeGateMount`** proactive prompt (education layout) — identify before submit, not
  after; the false doc claim is fixed. `migrations/edu_undeclared_age_allows_at_gate.sql`.
- `2026-08-17` — **Adversarial review of the same day's work found four real holes;
  all closed and re-verified live (7/7).** **(1)** The realtime voice tutor had
  **no gate at all** — `/api/voice-agent/token` mints an ephemeral xAI secret the
  browser uses to open a websocket straight to the provider, so aidream never sees
  the generation; new `utils/education/serverCoppaGate.ts` gates it, failing
  closed. **(2)** **Delete-and-reinsert defeated the entire age hard block**: the
  write guard was `BEFORE UPDATE` only and RLS let a user delete their own
  profile, so delete → reinsert with `age_band='adult'` walked out unaudited (76
  of 269 profiles exploitable). Closed in three layers — the guard now fires on
  INSERT and DELETE, `DELETE` is revoked from `authenticated`, and
  `edu_set_age_band` consults the **audit ledger** so a user who was ever
  `under_13` cannot declare upward even with no profile row. **(3)** A **withdrawn
  consent came back VERIFIED** on re-link (`guardian_unlink` left `verified_at`;
  `guardian_request_student` never reset it). **(4)** Nothing required a guardian
  to be an **adult**, so a child could self-consent from a second account. Also
  fixed: `SELECT INTO` sets every target NULL on no match, so the no-profile
  branch was dead code and the RPC returned `ok` plus a falsified audit row;
  `ensureAllowed`'s single resolver slot hung the first caller forever when two
  actions raced the prompt; a `blocked` result was read as success; and the cached
  allow verdict is now bounded to 60s. In aidream, the gate moved **above the
  compiled-Orchestra divert** — a console rebind could otherwise have un-gated
  every education surface with no code change.
- `2026-08-17` — **THE GATE NOW APPLIES (WP9).** It protected nobody until today:
  269 profiles, zero with an `age_band`, so `edu_coppa_gate()` answered
  `ai_allowed=true` for every user. Four changes, all live-verified:
  **(1)** age declaration is **mandatory** for a signed-in account
  (`age_undeclared` now blocks; anonymous sessions stay out of scope), resolved
  in one tap by the new `AgeDeclarationDialog` wired into `useAiComplianceGate`,
  which then **resumes the action the learner clicked** — so all nine AI entry
  points got it from one change. **(2)** `under_13 → 13_17|adult`
  **self-declaration is hard-blocked** (D-4 recommended posture) and the refusal
  is **durably audited** as `age_band_change_blocked` — replacing the review
  signal that nothing consumed. **(3)** The one route out of `under_13` is
  `edu_guardian_set_age_band`, requiring a **VERIFIED** guardian, surfaced as
  `family/components/StudentAgeBandControl.tsx` so the block is not a dead end.
  **(4)** `edu_coppa_gate_for(uuid)` is now THE single verdict implementation
  that aidream's server gate calls directly — killing the declared Python/SQL
  drift risk. Also hardened: the `app.age_band_rpc_guard` flag is disarmed right
  after its UPDATE (it stayed armed for the rest of the transaction).
  `migrations/edu_coppa_gate_applies.sql`. **Adversarially verified 17/17**
  against the live DB in a rolled-back transaction — self-escape refused with the
  band unchanged, direct table write refused (42501) both in a clean transaction
  and after the RPC, stranger refused, active-but-unverified guardian refused and
  still AI-blocked, verified guardian able to change it, downgrades open,
  `edu_coppa_gate_for` unreachable by `authenticated`.
  **Still open (Arman/legal, not code):** the age band remains *self-attested* at
  first declaration — the hard block stops the escape, not the initial lie; and
  the verifiable-method/vendor choice is A-2.
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
