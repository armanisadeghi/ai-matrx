---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [app/(core)/education/VISION-education-hub.md, features/education/ARMAN_VISION.md]
---

# Education Hub — remaining work

The student-facing study system is complete and live. What remains is the institutional /
teacher / community frontier (Convergence C), Wave-2 reach, and two Arman/legal decisions.
Current-state detail: [`docs/proposals/education-projects/STATUS.md`](../proposals/education-projects/STATUS.md).

## Remaining work

1. **Stripe Connect — finish the go-live.** The code is built and on prod (`584eb5941`): Checkout
   destination-charge (80/20 split) → signature-verified webhook → service-role
   `edu_class_confer_purchase`, with refund/dispute revoke. **Blocked on Arman's dashboard
   actions:** enable Stripe Connect on the platform account, set `STRIPE_WEBHOOK_SECRET`, register
   `/api/stripe/webhook`. Then run one test-mode purchase E2E. Tracked as D58 in `FOUND_DEFECTS.md`.

2. **Class rooms / real-time co-study / card-level discussion threads.** Not built. Builds on the
   per-class hub (classes are scopes) + the study spine.

3. **LMS integration** — Google Classroom / Canvas, LTI 1.3 / OneRoster. Not built; needs an LTI
   library + a provisioning path.

4. **Live classroom quiz mode** — fan-out reusing the study game's Broadcast multiplayer.

5. **FERPA / COPPA compliance package + DUA** — legal + data-handling; gates institutional sales.

6. **Study songs / musical mnemonics** — needs a decision first (below).

7. **Wave-2 reach** — offline mode, browser-extension clipper (matrx-extend), native-mobile parity,
   standards alignment (Common Core / NGSS), grade-adaptive theming (K-5).

8. **Small follow-ups (cheap, safe):**
   - Per-class hub: planner auto-read of a class's exam calendar (deep-link prefill today);
     per-tool class-filtered list views.
   - Widen `EntityScopeTagger.entityType` (`features/scopes/components/entity-context/EntityScopeTagger.tsx`)
     to the `EntityTypeToken` union — cast at one boundary today; scopes-core is owned elsewhere.
   - `features/education/docs/LIVE_AGENTS.md` still omits the memory, spoken-practice
     grader/reviewer, pronunciation grader/designer, and handwritten-grader agents (the
     structured-trust tutor `cb268e29` is documented).
   - `features/entitlements/FEATURE.md` consumers table still says "commit pending" for the three
     flashcards rows (`education.generate_cards`, `education.card_enrichment`,
     `education.live_grade`) — they are wired; update the table.
   - A pre-existing `assoc_members_visible` org-branch returns card-membership *edges* (not
     content) to org members — flagged, never filed. File it if it's real.

## Decisions needed

**Free-tier limits and enforcement.** Every education capability is metered but permissive today —
nothing is `enforced:true`, so a user can consume unlimited AI generation. Turning enforcement on
needs per-capability spend numbers and an aidream-side re-check of what each call actually costs.
**Decide:** the free-tier quantity per capability, and whether to flip any capability to enforced
now or stay permissive until launch.

**Study songs.** Musical mnemonics can be built two ways: call a real music-generation model (new
provider, real per-song cost), or generate a rhythmic spoken chant through the existing podcast/TTS
pipeline (near-zero marginal cost, much weaker as a "song"). **Decide:** which one.

**Self-declared age (COPPA).** All code layers are done — client fail-closed, server-side
enforcement in aidream, an `age_band` write-tamper trigger + audit. A child can still declare
themselves an adult; today that transition is audited and raises a review signal rather than being
blocked. **Decide:** hard-block the under-13→adult transition, or keep it audited. Separately, a
verifiable-consent method per COPPA §312.5 must be chosen before a genuine school launch — see
`COPPA_VERIFIABLE_CONSENT_RUNBOOK.md` §1. Tracked as D57.

**Guardian-consent error copy.** The guardian-link flow's error message told the caller whether an
email existed. The oracle is closed and rate-limited now, but the copy is a UX call. **Decide:**
one generic response for every outcome, or specific typo feedback for a mistyped address.

## Done

- Student-facing study system complete and live — flashcards/FastFire, study modes on the one FSRS
  spine, grounded cited voice tutor, quizzes + practice tests, audio study, mind maps, memory tools.
  See `docs/proposals/education-projects/STATUS.md`.
- Convergence C creators — open/closed/paid classes + roster + join, creator profiles and
  `/c/[handle]` public landing pages, teacher tools (assignments + analytics +
  assignment-confers-read-visibility), DOCX/PPTX ingestion. See
  `docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md`.
- Critical anon-bypass of every owner-gated `edu_class_*` / `creator_*` write RPC — found and fixed.
- Server-side COPPA enforcement at the aidream agent-execution boundary — see
  `aidream/services/education_compliance/`.
- Guardian-link email-enumeration oracle closed + 8/min rate limit (D52).
- aidream handwritten-grading vision-variant path collision + YouTube-transcript endpoint — shipped
  to prod.
