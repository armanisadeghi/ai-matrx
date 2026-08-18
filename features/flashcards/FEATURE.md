# FEATURE.md — `features/flashcards`

**Status:** `active` — live and in daily use, **pre-launch**. Under active parallel work by the
education program; several surfaces have named holes (see *Known limits*).
**Tier:** `1`
**Last updated:** `2026-08-17`

> 🚨 **The education product spans this repo + aidream + the shared DB.** Its vision, measured gap
> analysis, launch plan and live agent-coordination boards live in ONE place:
> **`/Users/armanisadeghi/code/common-docs/projects/education-platform/`** — start at its
> `README.md`, not with repo docs. The 2026-07 status docs that called this system complete are
> archived there and **must not be cited as current state**.

---

## Purpose

The flashcard subsystem: create, import, organize, study and grade decks of cards. It is the
largest surface in the education product (~92 code files, ~22.6k lines, 18 routes) and the one
students spend most of their time in.

**Nine study methods** all record to one study spine: the five in-deck modes (classic, learn,
write, test, match), two cross-deck queues (due-review, weak-area drill), and two spoken ones
(FastFire, single-card voice test). *"Seven study modes" elsewhere counts only the in-deck five
plus the two cross-deck queues; nine is the count of distinct `study_attempt.method` values.*

---

## Entry points

**Routes** — `app/(core)/education/flashcards/**` (18 files)

| Route | Renders |
|---|---|
| `/education/flashcards` | `FlashcardsHome` — my/shared/public sets, streak, Export library |
| `/education/flashcards/new` | `CreateFromTopic` — AI generate from a topic string |
| `/education/flashcards/new/from-source` | `CreateFromSource` — AI generate from a document |
| `/education/flashcards/new/import` | `ImportSetView` — CSV/TSV + portable JSON (`.apkg` is `ImportDeckPanel` only) |
| `/education/flashcards/[setId]` | `SetDetailView` — card list, export menu, mode launchers, visibility |
| `/education/flashcards/[setId]/study` · `/learn` · `/test` · `/match` · `/write` | the five in-deck study modes |
| `/education/flashcards/[setId]/edit` | `EditSetView`, server-gated by `requireAccess` |
| `/education/flashcards/[setId]/sessions` | `SessionsBrowser` scoped to the set |
| `/education/flashcards/review` | `ReviewDueSurface` — cross-set FSRS due queue |
| `/education/flashcards/weak-areas` | `WeakAreaDrillSurface` |
| `/education/flashcards/sessions` · `/sessions/[sessionId]` | all sessions · one session detail |
| `/education/flashcards/progress` | redirect only → `/education/progress` |
| `/education/flashcards/admin` | `FeatureAdminPage` with `flashcardsAdminMap` |

**FastFire routes live OUTSIDE this tree** — `app/(core)/education/fastfire/page.tsx`
(`FastFireClient`) and `/fastfire/capture-test` (audio-capture debug harness) — while its code
lives in `features/flashcards/fast-fire/`. Don't look for it under `/education/flashcards`.

**Study driver hooks** (all record through the spine; all in `data/` except the FastFire pair)
- `useFlashcardStudy()` — classic / learn / write. `{withSession, reshuffleWeighted, mode}`
- `useQuizStudy()` — test (MCQ) · `useMatchGame()` — match
- `useDueReview()` — cross-set FSRS due queue · `useWeakAreaDrill()` — weak-area drill
- `useGenerateCards()` — AI generation
- `fast-fire/hooks/useFastFireDrill()` + `useFastFireLauncher()` — the timed spoken drill

**Services**
- `data/fcService.ts` — **the canonical content service.** All deck/card/detail CRUD
- `features/education/study/service/studyService.ts` — **the spine writer** (not owned here)

**Redux**
- `fast-fire/redux/fastFireSlice.ts` — the only slice this feature owns

---

## Admin map

`app/(core)/education/flashcards/admin/page.tsx` → `admin/flashcardsAdminMap.ts` (426 lines),
rendered by `<FeatureAdminPage>`. **Its header comment and `description` are stale** — they say
creation/AI flows are "out of scope until the fc_* agents are built" and that the feature is "a
list-first browser + set detail + a classic-flip study surface". All nine study methods and three
creation flows are live. Fix these when you next touch that file.

---

## Data model

**Tables** (schema `education`, via `const EDU = () => supabase.schema("education")`)
- `fc_set` — the deck. Owner/RLS through the platform access system; `visibility` drives public listing
- `fc_card` — the card. `card_kind`, `dynamic_content` (jsonb variant payload), `topic` (nullable)
- `fc_detail` — per-card expansions

`fcService` uses **direct `.from()` only — no RPCs.** Relationship edges go through
`associationsService`; org resolution through `ensureOrgId`. **No method throws** — every one
returns `FcResult<T>` (`data/types.ts:110`), so callers must check, never assume.

**Key types**
- `data/types.ts` — `FcSetRow`/`FcCardRow`/`FcDetailRow`, `NewCardInput`, `NewSetInput`,
  `CardWithDetails`, `SetWithCards`, `FcResult<T>`, and `EDGE_ROLE`
- **Card kinds live in `utils/cardVariants.ts`, not `data/types.ts`** — `CARD_KIND`, `asCardKind`,
  `matchingPairs`, `studyFaces`. Kinds are `basic | cloze | matching`; there is no formula kind
- `types.ts` (feature root) is **legacy** — see *Unfinished work*

---

## Key flows

**1. Study a card and move mastery.** Route surface → driver hook → `studyService.recordAttempt`
→ `supabase.rpc("study_record_attempt", …)` (`studyService.ts:510`) → `study_attempt` +
`item_mastery` + `study_streak`. **Every one of the nine modes goes through this one RPC** — the
`method` value distinguishes them (`classic_review`, `learn`, `write`, `test`, `match`, `adaptive`,
`weak_area`, `fast_fire`, `voice_test`). This unified spine is the feature's biggest architectural
asset; play really does move mastery. Never add a tenth mode that writes attempts another way.

**2. Render a card face.** `StudyDeck` → `FlashcardItem` → **`CardFaceContent`**
(`components/mardown-display/blocks/flashcards/CardFaceContent.tsx`) — markdown + KaTeX, `prompt`
and `inline` variants. Write/Test/Match/sidebar/CardPeek consume it directly. **Inline math is
`\(…\)`, not `$…$`** — the engine sets `singleDollarTextMath:false` so currency isn't eaten.
Rendering a face as a raw string is a defect; several surfaces still do (see *Known limits*).

**3. FastFire drill.** `useFastFireLauncher` starts ONE warm mic and ONE continuous PCM buffer
(`audio/continuousCapture.ts`, 826 lines); `useFastFireDrill` only *marks* per-card windows on the
audio clock (`startCardClip`/`stopCardClip`) — there is no per-card record button. Each clip
uploads through `fileHandler` and grades fire-and-forget (`agents/gradeCard.thunk.ts` →
`runHeadlessAgentJson` → `gradeResolved` → `recordAttempt`) through the `flashcards.grade_spoken`
mandate. With no uploaded audio → `gradeSkipped` and the attempt is still recorded (grading with
no audio hallucinates a "correct" from the card back).

**4. Mid-drill adaptation.** On each resolved grade, `adaptUnseenQueue` (`fastFireSlice.ts:212-266`)
**stably re-sorts the not-yet-seen tail** by `1 − (topic mean of resolved scores)`, gated on
`config.adaptive` (default `true`). A receipt renders in `FastFireLiveCard`. **It is a REORDER,
not a requeue** — no seen card is ever re-inserted, and there is no requeue action in the slice.
Do not describe it as re-drilling missed cards.

---

## Invariants & gotchas

- **ONE SRS algorithm exists: FSRS** (`lib/srs/fsrs.ts`; the authoritative replay lives in
  `features/education/study/service/studyService.ts`). A second, Leitner-based scheduler over the
  legacy `users.user_flashcard_*` tables was deleted 2026-08-17 — **never reintroduce one.**
- **A study session is closed TERMINAL-FIRST by the mode that opened it** — completed when the
  work is done, abandoned on unmount — using the one-way `closeRef` latch shared by
  `useFlashcardStudy` (classic/learn/write), `useQuizStudy` (test), `useMatchGame` (match),
  `useDueReview` and `useWeakAreaDrill`. **The hourly DB reaper
  (`education.reap_stale_study_sessions`, 6h) is a backstop for a hard tab-kill, never the normal
  path.** This was measured wrong on 2026-08-17: the live DB held **142 `classic_review` sessions
  and zero completed ones** — the most-used mode could not reach a terminal state by its own
  action, so session-level truth (completion rate, duration, aggregate score) was wrong for it.
  A new mode that opens a session and does not close it is a defect.
- **`fcService` never throws.** An unchecked `FcResult` silently swallows the failure.
- **`card.topic` is nullable and mostly unpopulated.** No editor field sets it and no CSV/paste
  import writes it (`importDeck.ts:120,133`; `EditSetView.tsx:610` edits the *set's* topic). Any
  feature keyed on per-card topic — FastFire adaptation is one — is inert on hand-built and
  CSV-imported decks until this is fixed.
- **`FC_MANDATES` is consumed outside this feature** — `features/education/assessment/data/mandates.ts`,
  the tutor lanes (`tutor/lanes/*.ts`), `trust/useVerifyAgainstSource.ts`. Changing a key is
  cross-feature.
- `StudyDeck.tsx`'s header comment names only two consumers; **four** surfaces render it.

---

## Known limits — do not report these as done

Verified 2026-08-17 by the education program's WP12 (truth) against live code.

- **Raw-text card faces remain on user-visible surfaces**, bypassing `CardFaceContent`, so LaTeX
  renders as literal `\frac`: `fast-fire/components/FastFireLiveCard.tsx:203` (**the most-looked-at
  face in the product**), `FastFireScoreboard.tsx:175,178`,
  `voice-test/SingleCardVoiceTest.tsx:446,458,589`, `VoiceTestAudioSetup.tsx:97`, and — outside this
  feature — `features/education/media/audio/components/AudioReviewSession.tsx:485,534`,
  `features/education/media/mindmap/components/MindMapView.tsx:128,129`. Mobile (`FlashcardMobileView`) renders faces through
  `ConfigurableMarkdownContent` but carries a **second** face-style pipeline
  (`makeMobileCardStyle:143`, `stripInlineMarkdown:205`) and its scrubber at `:609` renders raw.
- **"Anki export" is a TSV text file, not an `.apkg`** — platform-wide, in both export modules
  (`utils/exportDeck.ts` and `education/onboard/export/deckFormats.ts` both map `anki` to a `.txt`
  TSV that Anki imports natively). Anki **import** *is* a real `.apkg` reader
  (`education/onboard/import/importAnki.ts`), so the asymmetry surprises people. The UI labels are
  honest about it ("Anki (text import)" / "Anki (.txt)"); a true `.apkg` writer would need a zip +
  SQLite collection and does not exist.
- **Two export entry points still exist**, though they no longer diverge on fidelity:
  `utils/exportDeck.ts` now delegates to `deckFormats.ts#toPortableDeck`, so `metadata.trust` IS
  preserved. The remaining gap is narrow: the deck-detail path does not pass export *extras*, so it
  omits the `scheduling` and `media` that `/education/data` includes (`useDataOwnership.ts` passes
  `fetchDeckExportExtras`). Converge the two rather than extending either.
- **`.apkg` is unreachable from the flashcards import route.** `ImportSetView` accepts
  `.csv,.tsv,.txt,.json` (`:201`) and does use `importPortableJson` (`:80`) and the RFC-4180
  `parseCsvRecords` (`:93`) — but it never routes to `importAnkiFile`, which only
  `education/onboard/components/ImportDeckPanel.tsx` reaches.
- **Images: a writer exists, the STUDY RENDERER does not.** `fcService.addCards` writes one
  `fc_card → file` edge per media ref (`data/fcService.ts:312-328`, role chosen at `:319`), fed by
  Anki import, and `education/onboard/export/exportExtras.ts:52-68` reads those edges back. What is
  missing is any study or edit surface that **displays** them. Owned by the dedicated image lane
  (program decisions D-7/D-8).
- **Test coverage is thin.** Three test files (~641 lines) cover generated-set parsing, the live-cards
  launch regression, and the FastFire adaptation reducer. **`fcService`, every study driver hook,
  the `recordAttempt` integration, `exportDeck` and `importExportCsv` have no tests.**

---

## Intelligence — Mandates (migration COMPLETE 2026-08-18)

**Every AI lane resolves through a mandate key in `data/mandates.ts`** (`FC_MANDATES`:
`flashcards.generate_cards` / `generate_from_source` / `enrich_card` / `expand_card` /
`grade_spoken` / `grade_typed_answer` / `help_live` / `review_batch` / `micro_coach` /
`make_quiz_items` / `verify_against_source`), plus `flashcards.spoken_front_tts`
(`fast-fire/spoken-front/generateSpokenFront.thunk.ts`) and `education.voice_tutor`
(`components/study/VoiceTutorPanel.tsx`). The old `data/agents.ts` UUID registry is DELETED, and
the FastFire/tutor localStorage agent-id overrides (`fast-fire/config.ts`,
`education/tutor/lanes/config.ts`) are RETIRED — swap agents via bindings at `/agents/mandates`.

🚨 **A raw agent UUID in code is a platform-law violation** — see root `CLAUDE.md` and
`features/agents/mandates/FEATURE.md`. **Do not add one back.** Need a NEW AI step? Declare a
mandate in aidream `services/mandates/client_mandates.py` and add its key to `FC_MANDATES`.

The dead `writeHelper` and `spokenQuestion` lanes (zero consumers repo-wide) were dropped in the
migration — no mandate was declared for them.

---

## The legacy persistence path — one live remnant

`services/flashcardPersistenceService.ts` (331 lines) writes `users.user_flashcard_sets` /
`user_flashcard_reviews`, the legacy tables that still exist live. **Its only importer is
`features/canvas/components/CanvasArtifactDebugPanel.tsx:45-47`, via a dynamic `await import()`** —
so a plain grep for static imports reports zero consumers and is wrong. Canvas moved its
*canonical* adapter to `fcService`
(`features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts`); only the debug
panel still reaches the legacy service.

`types.ts` (feature root) holds the matching legacy shapes — `CardReviewStats`, `FlashcardSetRow`,
`FlashcardReviewRow` and their Insert twins — consumed only by that service. Only `ReviewResult`
(aliasing `GradeResult`) is live across the rest of the feature.

Retiring the legacy `users.user_flashcard_*` tables is **program decision D-6, awaiting Arman**,
and WP8 owns stopping the remaining write path. Per
`/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md`, **do not delete any of
this on your own authority** — it is a documented migration in progress, not abandoned code.

---

## Related features

- **Depends on:** `features/education/study` (the spine — the one attempt writer), `lib/srs`
  (FSRS), `features/files` (clip upload), `features/agents` (headless runs, mandates),
  `features/content-ir` (`CardFaceContent` renders through the canonical markdown pipeline),
  `features/sharing` + `features/access-gate`, `features/education/onboard/import|export`
- **Depended on by:** `features/education/assessment`, `features/education/tutor`,
  `features/education/trust`, `features/education/media` (audio review, mind map),
  `features/canvas` (`CanvasFlashcardsView`), `features/window-panels` (`FlashcardStudyWindow`)
- **Read next:** `features/education/FEATURE.md` · the program's `GAP_ANALYSIS.md` and
  `CLAIM_REGISTER.md`

---

## Doctrine compliance

**Primitives reused** — the study spine and its one RPC; `lib/srs/fsrs.ts`; `CardFaceContent` and
the content-IR markdown/KaTeX pipeline; `fileHandler` for every audio clip; `associationsService`
for edges; `requireAccess` / `AccessGate` for authorization; `FeatureAdminPage`;
`runHeadlessAgentJson` and the mandate resolvers; `SessionsBrowser` (shared education component).

**Primitives introduced** — `fcService` (the canonical deck/card/detail service; nothing else owned
this shape), `fastFireSlice` (the only drill-state machine), `continuousCapture` (one warm mic +
audio-clock segment marking; no existing primitive did continuous multi-segment capture).

**Known doctrine debt:** the second export implementation and the second mobile face-style
pipeline, both named under *Known limits*. Both are "a second implementation of something we own",
which PRINCIPLES calls a defect even when it works.

---

## Current work / migration state

Under the education launch program (`common-docs/projects/education-platform/`): **WP3** owns study
depth (FastFire adaptation, rich media, merge, export, depth tiers), **WP2** owned the mandate
migration (done 2026-08-18), **WP1** owns mobile parity and route chrome, **WP5** owns import and
acquisition, **WP8** owns the legacy-table bleed. Check `STATUS_BOARD.md` before starting work here
— five packages touch this tree.

---

## Change log

- `2026-08-18` — all AI steps resolve through mandates (IC-1); UUID registry deleted.
  `data/agents.ts` → `data/mandates.ts` (`FC_MANDATES`), `fast-fire/config.ts` +
  `education/tutor/lanes/config.ts` localStorage agent overrides retired (bindings at
  `/agents/mandates` replace them), dead `writeHelper`/`spokenQuestion` lanes dropped.
- `2026-08-17` — WP12: **corrected 13 false or stale claims in the first version, found by an
  adversarial review of this file.** 🚨 **Read this before writing any doc in this repo.** The
  first version was written from a subsystem map built ~20 minutes earlier in the same session,
  and the tree moved underneath it: a file it described as a live trap
  (`hooks/useFlashcardStudy.ts`) had been deleted four minutes before the commit, and five
  *Known limits* rows were closed by other packages within six minutes after it. It also
  under-credited real work — images have a writer, deck JSON round-trips, and the library export
  has an importer. **A map is evidence only at the moment it is taken; re-verify against `HEAD`
  at write time, and re-run every "known limit" immediately before committing.**
- `2026-08-17` — WP12 (truth & docs): **file created.** The largest education subsystem had no
  `FEATURE.md` at all.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this
> file's status, flows and invariants, and append to the Change log. **Never let it overclaim** —
> reporting something complete that is merely built is the exact failure that put this product a
> month behind.
