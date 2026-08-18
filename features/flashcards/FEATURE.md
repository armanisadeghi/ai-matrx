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
largest surface in the education product (~22,300 lines, 91 files, 18 routes) and the one students
spend most of their time in. Nine study modes — classic, learn, write, test, match, due-review,
weak-area drill, FastFire and single-card voice test — all record to one study spine.

---

## Entry points

**Routes** — `app/(core)/education/flashcards/**` (18 files)

| Route | Renders |
|---|---|
| `/education/flashcards` | `FlashcardsHome` — my/shared/public sets, streak, Export library |
| `/education/flashcards/new` | `CreateFromTopic` — AI generate from a topic string |
| `/education/flashcards/new/from-source` | `CreateFromSource` — AI generate from a document |
| `/education/flashcards/new/import` | `ImportSetView` — **delimited CSV/TSV only** (see *Known limits*) |
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

**Study driver hooks** (all in `data/`, all record through the spine)
- `useFlashcardStudy()` — classic / learn / write. `{withSession, reshuffleWeighted, mode}`
- `useQuizStudy()` — test (MCQ) · `useMatchGame()` — match
- `useDueReview()` — cross-set FSRS due queue · `useWeakAreaDrill()` — weak-area drill
- `useGenerateCards()` — AI generation
- `fast-fire/hooks/useFastFireDrill()` + `useFastFireLauncher()` — the timed spoken drill

**Services**
- `data/fcService.ts` (751 lines) — **the canonical content service.** All deck/card/detail CRUD
- `features/education/study/service/studyService.ts` — **the spine writer** (not owned here)

**Redux**
- `fast-fire/redux/fastFireSlice.ts` — the only slice this feature owns

---

## Admin map

`app/(core)/education/flashcards/admin/page.tsx` → `admin/flashcardsAdminMap.ts` (426 lines),
rendered by `<FeatureAdminPage>`. **Its header comment and `description` are stale** — they say
creation/AI flows are "out of scope until the fc_* agents are built" and that the feature is "a
list-first browser + set detail + a classic-flip study surface". Seven study modes and three
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
`runHeadlessAgentJson` → `gradeResolved` → `recordAttempt`). Grading is optional by design: no
agent id → `gradeSkipped` and the attempt is still recorded.

**4. Mid-drill adaptation.** On each resolved grade, `adaptUnseenQueue` (`fastFireSlice.ts:212-266`)
**stably re-sorts the not-yet-seen tail** by `1 − (topic mean of resolved scores)`, gated on
`config.adaptive` (default `true`). A receipt renders in `FastFireLiveCard`. **It is a REORDER,
not a requeue** — no seen card is ever re-inserted, and there is no requeue action in the slice.
Do not describe it as re-drilling missed cards.

---

## Invariants & gotchas

- 🚨 **`hooks/useFlashcardStudy.ts` and `data/useFlashcardStudy.ts` are different modules with the
  same export name.** Every live surface imports the `data/` one. The `hooks/` one is a dead
  3-box Leitner scheduler with **zero importers** — but it looks live in any grep. Check the
  import path before you conclude anything about scheduling.
- **Two SRS algorithms exist in this feature.** The live one is FSRS (`lib/srs/fsrs.ts`, authoritative
  replay in `studyService`). The Leitner one is dead. Never wire the dead one back up.
- **`fcService` never throws.** An unchecked `FcResult` silently swallows the failure.
- **`card.topic` is nullable and mostly unpopulated.** No editor field sets it and no CSV/paste
  import writes it (`importDeck.ts:120,133`; `EditSetView.tsx:610` edits the *set's* topic). Any
  feature keyed on per-card topic — FastFire adaptation is one — is inert on hand-built and
  CSV-imported decks until this is fixed.
- **FastFire's grader id reads `localStorage` first** (`fast-fire/config.ts:58`), falling back to
  the registry. That is an env-var-shaped toggle in disguise; treat it as debug-only.
- **`FC_AGENTS` is consumed outside this feature** — `features/education/assessment/data/agents.ts`,
  `tutor/lanes/config.ts`, `trust/useVerifyAgainstSource.ts`. Migrating it is cross-feature.
- `StudyDeck.tsx`'s header comment names only two consumers; **four** surfaces render it.

---

## Known limits — do not report these as done

Verified 2026-08-17 by the education program's WP12 (truth) against live code.

- **Raw-text card faces remain on user-visible surfaces**, bypassing `CardFaceContent`, so LaTeX
  renders as literal `\frac`: `fast-fire/components/FastFireLiveCard.tsx:203` (**the most-looked-at
  face in the product**), `FastFireScoreboard.tsx:175,178`,
  `voice-test/SingleCardVoiceTest.tsx:446,458,589`, `VoiceTestAudioSetup.tsx:97`, and — outside this
  feature — `education/media/audio/AudioReviewSession.tsx:485,534`,
  `media/mindmap/MindMapView.tsx:128,129`. Mobile (`FlashcardMobileView`) renders faces through
  `ConfigurableMarkdownContent` but carries a **second** face-style pipeline
  (`makeMobileCardStyle:143`, `stripInlineMarkdown:205`) and its scrubber at `:609` renders raw.
- **"Anki export" is not `.apkg`.** `utils/exportDeck.ts:47-49` emits a headed TSV named
  `.anki.txt`. Anki **import** *is* a real `.apkg` reader (`education/onboard/import/importAnki.ts`),
  so the asymmetry surprises people. The file's own header comment contradicts itself
  (`#html:false` at L10, `#html:true` at L47).
- **Two export implementations exist.** `features/education/onboard/export/deckFormats.ts`
  (`buildDeckExport`, `PortableDeck` v2) already shipped the same four formats and preserves
  `metadata.trust`; `utils/exportDeck.ts` is a second one that **drops trust** and whose CSV is
  front/back only. `/education/data` still uses the first. Per PRINCIPLES this is a defect even
  though it works — consume `deckFormats.ts`, don't extend the fork.
- **Deck JSON does not round-trip.** `buildDeckJson` nests deck fields under `set:{}`;
  `parseDeckJson` reads them off the top level, so an exported deck re-imports as "Imported deck"
  with description/topic/difficulty lost. Cards survive.
- **`ImportSetView` (the flashcards import route) accepts only `.csv,.tsv,.txt`** and parses the
  file itself — it never calls `importDeckFile`, so JSON and `.apkg` are unreachable from this
  route, and the RFC-4180 `parseCsvRecords` in `utils/importExportCsv.ts:103` is never used here.
- **`PortableCard.scheduling` and `.media` are parsed then dropped** on import and never written on
  export. The whole-library JSON export has **no importer at all**.
- **No image on a card.** `EDGE_ROLE` declares `illustration | diagram | chart | photo | video_ref`
  with no writer and no renderer. Owned by the dedicated image lane (program decisions D-7/D-8).
- **Test coverage is thin.** Three test files (~641 lines) cover generated-set parsing, the live-cards
  launch regression, and the FastFire adaptation reducer. **`fcService`, every study driver hook,
  the `recordAttempt` integration, `exportDeck` and `importExportCsv` have no tests.**

---

## Intelligence — being migrated to Mandates

**`data/agents.ts` holds 13 raw agent UUIDs** (`FC_AGENTS`). Two mandate keys are already correct
and are the template: `flashcards.spoken_front_tts`
(`fast-fire/spoken-front/generateSpokenFront.thunk.ts:27`) and `education.voice_tutor`
(`components/study/VoiceTutorPanel.tsx:44`).

🚨 **A raw agent UUID in code is a platform-law violation** — see root `CLAUDE.md` and
`features/agents/mandates/FEATURE.md`. **Do not add another**, and do not migrate these yourself:
the education program's WP2 owns the conversion and has published the mandate roster (IC-1) and
call-shape map (IC-2) in the program's `INTEGRATION_MAP.md`. Need a NEW AI step? Ask WP2 for a key.

`FC_AGENTS.writeHelper` and `FC_AGENTS.spokenQuestion` have **zero consumers repo-wide**.

---

## Unfinished work — flagged, never to be deleted on an agent's own authority

Per `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md`, a purpose-built
artifact with no consumers is **work a previous agent left unfinished**. Recommending its deletion
is forbidden until Arman names it dead in writing. These are recorded so they get *finished* or
formally retired:

1. **`hooks/useFlashcardStudy.ts`** (263 lines) — a complete 3-box Leitner scheduler with set
   autosave and review submission. Zero importers. Superseded in practice by FSRS.
2. **`services/flashcardPersistenceService.ts`** (331 lines) — writes `users.user_flashcard_sets`
   / `user_flashcard_reviews`, which still exist live. Its only importer is (1). Canvas already
   migrated off it (`features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts`).
3. **`types.ts` legacy half** — `LeitnerBox`, `CardStudyState`, `CardReviewStats`,
   `FlashcardSetRow`/`ReviewRow`/`Insert` types are consumed only by (1) and (2). Only
   `ReviewResult` is live.

Retiring the legacy `users.user_flashcard_*` tables is **program decision D-6, awaiting Arman**.

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
depth (FastFire adaptation, rich media, merge, export, depth tiers), **WP2** owns the mandate
migration of `FC_AGENTS`, **WP1** owns mobile parity and route chrome, **WP5** owns import and
acquisition, **WP8** owns the legacy-table bleed. Check `STATUS_BOARD.md` before starting work here
— five packages touch this tree.

---

## Change log

- `2026-08-17` — WP12 (truth & docs): **file created.** The largest education subsystem had no
  `FEATURE.md` at all. Written from a verified map of all 91 files plus an adversarial spot-check
  of the four gaps reported closed that day; every *Known limits* row is a measured finding, not a
  guess.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this
> file's status, flows and invariants, and append to the Change log. **Never let it overclaim** —
> reporting something complete that is merely built is the exact failure that put this product a
> month behind.
