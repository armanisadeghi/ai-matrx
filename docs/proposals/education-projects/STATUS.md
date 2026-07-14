# Education Hub — Current Status (living doc)

> **This is the single "where are we" document for the Education Hub.** It supersedes the
> wave/status language in [`README.md`](./README.md) (the master plan, kept for the project
> briefs + contracts). Source-of-truth vision:
> [`../../../app/(core)/education/VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md).
>
> **Last updated:** 2026-07-14. Legend: ✅ live · 🟡 built, not on prod / partial · 🔲 not built.

---

## 1. The headline

The **student-facing study system is complete** — every tool a learner touches is built and live
(bar one backend deploy). The remaining frontier is **institutional / teacher / community
(Convergence C)** and **Wave-2 reach** (mobile, offline, per-class hub), plus a handful of small
completions. All 11 master-plan projects (P0–P10) + F1 shipped; Convergence A (trust / access /
monetization) and B (the connected study loop) are done.

## 2. What's LIVE (student-facing)

| Area | State | Notes |
|---|---|---|
| Flashcards + FastFire (voice-graded) | ✅ | create paths, cloze/matching, confidence-tap, make-deeper, mastery viz, mobile parity |
| Study modes + the ONE study spine | ✅ | classic/learn/due/weak-area/game/audio-review/oral-exam all record to `study_attempt`/`item_mastery` (FSRS) |
| AI Tutor (grounded, cited, voice) | ✅ | cross-session memory, per-turn memory refresh, Socratic/personality (durable), access-gated, metered |
| Assessments — quizzes + practice tests | ✅ | generate→take→grade-on-meaning→results→spine; learning-gain pairs; exam-hub deep links |
| **Audio Study (podcasts/overviews)** | ✅ | **resurrected this session** — TTS fixed + deployed (v0.1.544), titled (v0.1.545), durable CDN audio, plays |
| Mind maps + diagrams | ✅ | node→card click-through, grounded trust |
| **Memory Tools (§11)** — mnemonics/analogies/memory-palace | ✅ | **new this session**; proactive in-study affordance; `study_media media_kind='memory_aid'` |
| **Spoken Practice** — oral exam / interview / debate | ✅ | **new this session**; dedicated mode-aware examiner/grader agents; records to spine |
| **Handwritten / multi-step grading (§6)** | 🟡 | **new this session**; grader reads the photo correctly (variant path-collision fixed) — **fix committed, NOT on prod yet** |
| Study Intelligence — planner + analytics + learning-gain | ✅ | recovery-after-absence, adaptive re-plan, mode-agnostic next-best-action, PDF export |
| Universal ingest → kit fan-out | ✅ | PDF, **image (OCR), audio, video (new this session)**; note→deck/quiz/map/audio/memory converter |
| Sharing / public access | ✅ | `useAccess`/`requireAccess`, `/p/e` indexable lane, token-safe fork, duplicate-to-edit |
| Billing integrity + entitlements | ✅ | education-first DB-backed `/pricing`, pledge/compare, **honest decrementing meters (new this session)** |
| Engagement game (play-IS-review) | ✅ | solo + multiplayer, healthy streaks/forgiveness, leagues/badges |
| Growth — `/learn` engine, exam hub, community/certified | ✅ | DB-backed, SEO (sitemap/JSON-LD/OG), suggest-edit |
| **Education hub front door** | ✅ | **new this session** — data-driven "Study tools" grid surfaces all 13 live tools |

## 3. This session's changes (2026-07-13 → 2026-07-14)

- Audio resurrected end-to-end (TTS structural-param fix + blank-title FK fix, both deployed).
- Built 3 net-new vision sections: Memory Tools (§11), Spoken Practice (oral/interview/debate),
  Handwritten grading (§6).
- Broadened ingestion to image/audio/video; fixed a multipart-header bug that had silently broken
  PDF ingest too.
- Made every entitlement meter honest (wired `entitlement_consume` commit-on-success platform-wide).
- Surfaced all 13 tools on the `/education` hub (was undiscoverable).
- Fixed D45 (mobile cloze/matching — was already done), D49 (canvas blank artifacts), D38 (learn_doc
  registry), D51 (vision-variant path collision — the real handwritten-grading bug).

## 3b. Second wave this session (2026-07-14, parallel fleet)

- **Tutor per-turn structured trust** ✅ — re-authored agent emits a per-turn envelope; grounded/inferred badge + citations or honest refusal (live-verified both ways).
- **Flashcards meters** ✅ — `commit()` wired into generate_cards / card_enrichment / live_grade.
- **Cross-surface stuck-session recovery** ✅ — Audio Review + FastFire now complete terminally-first / mark abandoned on quit.
- **Pronunciation / language-fluency assessment** ✅ — 4th Spoken Practice mode, dual content+pronunciation grading (honest holistic granularity).
- **Parent / guardian dashboard (K-8)** ✅ — `/education/family`, consent-based, read-only, reuses P5 analytics; **security-reviewed airtight**.
- **Per-class hub (Wave 2)** ✅ — see Tier 4.
- **Standardized exam content libraries** 🟡 — starter seed live (below).
- **YouTube real-transcript ingestion** 🟡 — aidream endpoint + FE wired; **deploys with the next aidream release**.

## 4. Pending — the exact remaining list

### Tier 0 — one true blocker
- 🟡 **Ship the aidream release to prod** (carries the handwritten-grading fix `08314b357` AND the new
  YouTube-transcript endpoint). Blocked only on the aidream tree carrying others' uncommitted work +
  untracked migrations (won't stash).

### Tier 1 — small completions / decisions
- 🔲 **DOCX / PPTX ingestion** — no extractor exists; honestly gated. *Needs a dependency choice (LibreOffice vs python-docx).*
- 🔲 **Enforcement flip + free-tier numbers** — all new caps permissive; needs Arman's numbers + aidream spend re-check.
- 🟡 **D52 guardian email-enumeration** — `guardian_grant`/`request` branch their error on whether an email exists (+ no rate limit); product-UX call (generic response vs typo feedback).

### Tier 2 — vision "Coming Soon"
- 🔲 Study songs / musical mnemonics (audio) — *may need a music model; decision pending.*
- 🟡 Standardized exam content libraries — **starter seed live (2026-07-14):** 9 certified curated decks (SAT Math·AP Biology·GRE Verbal, 128 cards) + 3 study guides, real-agent-generated, marked Certified, on each exam-prep page (`ExamCuratedLibrary`) + community library. AI starters pending human verification; ACT/IB/MCAT/LSAT/GMAT follow the same recipe.

### Tier 3 — Convergence C (institutional frontier, largely un-started)
- 🔲 Teacher tools (assignment, distribution, auto-grade, class analytics).
- 🔲 Class rooms & real-time co-study; card-level discussion threads.
- 🔲 LMS — Google Classroom / Canvas, LTI 1.3 / OneRoster.
- 🔲 FERPA / COPPA compliance + DUA.
- 🔲 Live classroom quiz mode (P10 fan-out).
- 🔲 Community/certified library at scale + moderation.

### Tier 4 — Wave 2 fan-out (documented, not built)
- ✅ Per-class hub ([`W2-class-hub.md`](./W2-class-hub.md)) — **shipped 2026-07-14**, scopes-native (class =
  scope; content↔class = platform.associations; exam dates = scope.settings; zero new tables).
  `/education/classes` + `/education/classes/[classId]`; `features/education/classes/FEATURE.md`.
  Open follow-ups (flagged for Arman): teacher/roster/sharing (Convergence C), planner auto-read of a
  class's exam calendar, per-tool class-filtered list views.
- 🔲 Class/group social rooms · talk-to-the-hosts audio · offline mode · browser-extension clipper ·
  native mobile parity · standards alignment (Common Core/NGSS) · grade-adaptive theming (K-5).

## 5. Repo / deploy state (2026-07-14)

- **matrx-frontend:** first-wave education work is on `origin/main`; the second-wave fleet (tutor trust,
  flashcards meters, recovery, pronunciation, parent dashboard, per-class hub, exam libraries, YouTube FE)
  is committed on local `main` (~15 commits ahead), unpushed — **a push deploys aimatrx.com prod (Arman's call).**
  Education-area `pnpm type-check` is clean. No lost work; every local branch merged into `main`.
- **Two frontend stashes (NOT education, need landing by owners):** `stash@{0}` "pre-education-cert-stash"
  = context-slots/agent-input work; `stash@{1}` = files-api/preferences work.
- **aidream:** prod = v0.1.544 (TTS) + v0.1.545 (episode titles). Local `main` has the handwritten-grading
  fix `08314b357` AND the YouTube-transcript endpoint `3c94ed4af`, **unpushed / not on prod** — one aidream
  release ships both. Blocked only by others' uncommitted aidream work (won't stash).

## Change log
- **2026-07-14 (wave 2)** — Parallel fleet: tutor per-turn structured trust, flashcards meters, cross-surface
  session recovery, pronunciation mode, parent/guardian dashboard (+security review), per-class hub (W2),
  exam content-library starter seed, YouTube-transcript wiring. Education type-check clean.
- **2026-07-14 (wave 1)** — Created. Audio resurrection, 3 new vision sections (memory/spoken/handwritten),
  ingestion breadth, honest meters, hub discoverability, D38/D45/D49/D51.
