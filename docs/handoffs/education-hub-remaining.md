# Handoff — Education Hub remaining work

> **Forward work-order.** Current state lives in
> [`docs/proposals/education-projects/STATUS.md`](../proposals/education-projects/STATUS.md);
> vision in [`app/(core)/education/VISION-education-hub.md`](../../app/(core)/education/VISION-education-hub.md).
> Written 2026-07-14 after two large build waves. The **student-facing study system is complete**;
> what's left is deploys, a few decisions, and the institutional/Convergence-C frontier.

## Do first (unblocks shipped work)

1. **Ship the aidream release to prod.** aidream local `main` carries two finished, verified fixes not on
   prod: the handwritten-grading vision-variant path-collision fix (`08314b357`) and the YouTube-transcript
   endpoint (`3c94ed4af`). One `scripts/release.sh` ships both. **Blocked only** because the aidream tree
   holds others' uncommitted work + untracked migrations — land/stash that (its owner, not blindly) then
   release. Until then: handwritten grading serves the OLD (buggy) result on prod, and YouTube ingest 404s
   (honest fallback).
2. **Push matrx-frontend `main`** (deploys aimatrx.com) once Arman has clicked through the new tools —
   ~15 education commits are ready and education-area type-check is clean.

## Decisions needed from Arman (see the turn's decision list)

- Free-tier numbers + whether to flip any capability `enforced:true` (all permissive today; needs the
  aidream per-capability spend re-check first).
- DOCX/PPTX ingestion extractor choice (LibreOffice→PDF vs python-docx/unstructured) — the only real
  *new dependency*.
- Convergence-C direction for classes: teacher/roster/sharing semantics (per-class hub is student-centric
  today; forward path = share the class scope via `iam.permissions` + roster via `iam.memberships`).
- D52 (`FOUND_DEFECTS.md`): guardian consent flow leaks email existence via error message + no rate limit —
  generic response vs typo feedback is a UX call.

## The remaining build frontier (no dependencies — assignable now)

- **Convergence C — teacher tools:** assignment creation/distribution, auto-grade, per-student + class
  analytics. Builds on the per-class hub (classes are scopes) + P5 analytics + the study spine.
- **Convergence C — class rooms & real-time co-study, card-level discussion threads.**
- **LMS:** Google Classroom / Canvas, LTI 1.3 / OneRoster (needs an LTI library + provisioning).
- **FERPA / COPPA compliance + DUA** (legal + data-handling; gates institutional sales).
- **Live classroom quiz mode** (P10 fan-out — reuse the game's Broadcast multiplayer).
- **Study songs / musical mnemonics** — needs a decision: real music model vs rhythmic-TTS chant over the
  existing podcast pipeline.
- **Wave-2 reach:** offline mode, browser-extension clipper (matrx-extend), native-mobile parity,
  standards alignment (Common Core/NGSS), grade-adaptive theming (K-5).

## Small follow-ups (cheap, safe)

- Per-class hub: planner auto-read of a class's exam calendar (deep-link prefill today); per-tool
  class-filtered list views; widen `EntityScopeTagger.entityType` to the `EntityTypeToken` union (it's
  cast at one boundary today; scopes-core is owned elsewhere).
- Update `features/education/docs/LIVE_AGENTS.md` with this session's new agents (memory, spoken-practice
  grader/reviewer, pronunciation grader/designer, handwritten grader, structured-trust tutor
  `cb268e29`).
- `features/entitlements/FEATURE.md` consumers table still says "commit pending" for the flashcards rows —
  now wired; update when that file is next free.

## Change log
- **2026-07-14** — Created after the two build waves. Everything student-facing is live (bar the aidream
  deploy); this captures deploys + decisions + the Convergence-C/Wave-2 frontier.
