---
status: active
updated: 2026-08-17
repos: [matrx-frontend]
vision: [app/(core)/education/VISION-education-hub.md, features/education/ARMAN_VISION.md]
---

# Flashcards / education — vision-conformance gap worklist

Born 2026-08-17: Arman studied a deck and found audio help, card operations,
layout, and KPIs missing from the MAIN study surface — and asked for a full
vision review to find what else was promised but never built (or built and
left unreachable). Every row below was verified in source, not inferred.
The audit's repeated finding: **most gaps are built-but-unreachable, not
unbuilt** — surfaces exist behind dev triggers, other routes, or bare icons.

## Closed 2026-08-17 (the session that opened this doc)

- **Audio help on every study card** — `CardAudioHelp` in the StudyDeck stack:
  plays the cached `spoken_front` audio, generates it on demand through the
  existing `flashcards.spoken_front_tts` mandate when missing, and "Talk it
  through" opens the inline realtime voice tutor (`VoiceTutorPanel`, mandate
  `education.voice_tutor`, agent `…-0003`, xAI Grok voice — scribe-live hook
  composition).
- **Card ops reachable while studying** — "Improve this card" mounts the SAME
  `EnhanceSetDialog` (enrich / deepen) scoped to the current card;
  `useFlashcardStudy.refreshCards()` folds new layers in without restarting
  the session. Oral practice + audio review became doors in set detail's
  study-modes menu (`VOICE_STUDY_MODES`), with `?deck=` deep links threaded
  into spoken practice.
- **Layout** — StudyDeck widths scale (`lg:max-w-4xl xl:max-w-5xl` shell,
  wider card column) and `FlashcardItem`'s inline card height is responsive
  (`h-56 lg:h-72 2xl:h-80`).
- **KPIs on the 1–5 scale** — the study header shows the current card's
  canonical `MasteryTierPill` and the deck's `DeckMasteryBar` (5-tier
  distribution), the same vocabulary as set detail.

## Open — ranked by user-visible damage

1. **Mobile study is the poorest surface on the owner's PRIMARY platform.**
   `StudyDeck.tsx` short-circuits to `FlashcardMobileView`, which lacks: the
   1–5 confidence row (hard-codes the 3-way grade row), voice test, Ask-AI,
   tutor, memory aids, audio help, trust footer — everything this session
   added is desktop-only until the mobile view takes the same affordances.
   (`FLASHCARDS_STATUS_AND_ISSUES.md:39` names mobile the owner priority.)
2. **Study sidebar stats built but admin-gated.** `FlashcardStudySidebar` /
   `FlashcardStudySidebarStats` (`study-deck-parts.tsx:240-330` — live
   retrievability %, due date, interval, attempts) render only inside the
   dev-trigger window (`FlashcardStudyWindowDevTrigger`, `selectIsAdmin`).
   Surface them for every learner (VISION §16).
3. **Pre-flip confidence** (VISION §2): the 1–5 row renders regardless of
   flip state, so the Brainscape "predict before you peek" signal is never
   captured. Needs a two-phase grade row (predict → reveal → grade).
4. **Tiered depth at GENERATION time** (VISION §1 "every AI generation path
   supports tiered depth"): `CreateFromTopic` / `useGenerateCards` /
   `data/agents.ts` carry no depth parameter; `DEPTH_TIERS` exists only in
   post-hoc Enhance.
5. **Merge cards does not exist anywhere** (VISION §1/§7 imply it; Arman
   asked for it by name). `fcService.mergeCardJson` is a JSONB helper, not a
   card merge. Needs: service op (combine faces/details, re-point mastery or
   accept reset — decision needed), an agent for merged-face drafting, UI in
   EnhanceSetDialog + edit view.
6. **Proactive memory aids** (VISION §11 says "automatically; students don't
   have to ask") — current `MemoryAidButton` is opt-in per card. Needs a
   struggle-triggered auto-surface (e.g. after a 1–2 grade).
7. **Batch spoken-front prep outside FastFire** — the study deck generates
   card audio one-at-a-time on tap; `ensureSpokenFrontsForSet` is wired only
   into `FastFireSetup`. A deck-level "prepare audio" affordance (or
   background prep on session start) removes the per-card wait.
8. **Gamification invisible during study** (VISION §13): completion summary
   shows Studied/Correct/Accuracy; streak/badge/points feedback lives only in
   `features/education/engage/`. The session that EARNS the streak never
   mentions it.
9. **Formula card kind + LaTeX guarantee** (VISION §17): card kinds are
   basic/cloze/matching only.
10. **Export (CSV / Anki / Markdown / JSON)** (VISION §15): import exists,
    export is `downloadSetCsv` only — no Anki/Markdown/JSON.
11. **Per-card discussion/flag** (VISION §14): nothing wired (platform
    comments satellite unused on `fc_card`).
12. **Mid-session adaptive requeue** (VISION §3): only Learn-mode weighted
    reshuffle; classic study never reorders on performance.

## Doc-integrity findings

- `features/flashcards/` has **no FEATURE.md** (18 routes, Tier-1 scale).
  Writing it is its own task; this doc is NOT a substitute.
- `features/education/docs/VOICE_INTERACTIONS.md:31` references a
  `renderCardExtra` prop that doesn't exist (it is `voiceTestForCard`), and
  its "Next" list claims built things that aren't.
- `docs/handoffs/education-hub-remaining.md:9` claims "the student-facing
  study system is complete and live" — contradicted by rows 1–3 above.
- The education vision lives repo-local (`VISION-education-hub.md` +
  `ARMAN_VISION.md`, near-duplicates) — nothing in common-docs; the
  placement default says shared vision belongs there.
