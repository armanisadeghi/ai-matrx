# Flashcards — FEATURE

The largest education subsystem: decks, cards, detail layers, study modes, Fast Fire, the editor,
public deck pages. Product truth, status and open work: `/Users/armanisadeghi/code/common-docs/systems/education/STATE.md`.
Card images: `/Users/armanisadeghi/code/common-docs/systems/education/flashcard-images/FEATURE.md`.
This file holds the per-feature contracts a code reader can't see. Print is the platform printer
(`flashcardsPrinter` from `@ai-matrx/print`, hub in [`features/print/FEATURE.md`](../print/FEATURE.md)) — never a second print UI.

## Data spine

`education.fc_set` / `fc_card` / `fc_detail`, read directly from the client through
[data/fcService.ts](./data/fcService.ts). Set membership is a `platform.associations` edge
(`fc_card -member-> fc_set`), not a column. A card loads as `CardWithDetails`; detail rows are the
per-card layers (text layers, audio, `front_image`/`back_image`). Every read filters `deleted_at is null`.

- A detail row carries its CARD's `organization_id` (`addDetail` reads and writes it; a null lets a trigger file it in the writer's personal workspace). Guard: `pnpm check:organization-context`.
- Removals prove they landed: `softDeleteOne` / `setDetailAudio` / `reviewCardImage` ride `tryWriteOne` (`utils/supabase/writeOne.ts`); a PostgREST update RLS filters to zero rows returns no error, so a bare `update().eq()` toasts success while nothing changed. Guard: `data/__tests__/card-removal-proves-it-landed.test.ts`, `pnpm check:single-record-writes`.
- `fcService.mergeSetMetadata` is THE compare-and-swap merge for `fc_set.metadata`. Keys written there (`source_set`, `source_names`, `continued_from`, …) must be registered in `platform.metadata_reserved_keys` on live, or `platform._metadata_guard` refuses the save.
- The `/education/flashcards/**` family is authenticated: the route boundary redirects guests through `loginHref` with the destination intact, and set detail also checks `getServerAuth`. Public decks use `/p/e/fc_set/[id]` and a shared deck `/s/<token>`.
- Retired, do not revive: the prototype tables `education.flashcard_*` (schema `graveyard`) and the `users.user_flashcard_sets` / `user_flashcard_reviews` system. `education.fc_*` is canonical; never write to either.

## Routes (`app/(core)/education/flashcards/**`)

| Route | Component |
|---|---|
| `/flashcards` | `components/home/flashcardSetList.tsx` on `EntityListPage`, over server RPCs via `data/deckListService.ts` (the browser never holds the library) |
| `/new` | `components/create/CreateDeckPage.tsx` (the ONE creation page); `/new/from-source`, `/new/import`, `/education/flashcards-2` redirect here keeping the query (`createDeckHref.ts`) |
| `/[setId]` | `components/set-detail/SetDetailView.tsx` |
| `/[setId]/edit` | `components/editor/EditSetView` |
| `/[setId]/study` `/learn` `/test` `/write` `/match` | `components/study/{Study,Learn,Test,Write,Match}Surface.tsx` over the shared `StudyDeck` |
| `/[setId]/sessions` | the deck's Progress page (`set-detail/DeckProgressView.tsx`) |
| `/review`, `/weak-areas` | `ReviewDueSurface`, `WeakAreaDrillSurface` (all of the learner's decks) |
| `/sessions`, `/sessions/[sessionId]` | `SessionsBrowser` (mode-agnostic) and `components/sessions/FlashcardSessionDetail` |
| `/progress` | redirect to `/education/progress` |
| `/admin` | `admin/flashcardsAdminMap.ts` via `FeatureAdminPage` — add every new route/component there |
| `/education/fastfire` | Fast Fire, code in [fast-fire/](./fast-fire/); URLs in [routes.ts](./routes.ts) |
| `/print/flashcards` | the print page |
| `/education/offline` | download/offline panel; the deck snapshot engine is `data/offlineDeck.ts` (a read cache, never a write-back source) |

Windows: `features/window-panels/windows/flashcards/` (`FlashcardStudyWindow`, `FlashcardItemWindow`, `FlashcardSubcardsWindow`, `FlashcardsBlockWindow`).

Deck page: card views are `?view=overview|fronts|backs|list|table` (`set-detail/DeckCardViews.tsx`, in the URL so a reload keeps it). Print, Copy, Export and Transform sit in the deck's content-action menu; the platform print hub is its "print-hub" door. Select-cards mode, Merge, Enrich, Illustrate, Add more cards and the offline download button live in `set-detail/`.

## Creating a deck

One page: **Sources** (the one Source input, `features/resource-manager/source-input/`, surfaceKey `flashcards:new`) → **Style and details** → **Make the deck**; "Import a deck file" opens `DeckFileImport` (Quizlet/CSV/TSV/pairs, Anki `.apkg`, Matrx JSON, library zip — all via `persistImportedDeck`, no AI). Picks persist in `wizardDraft` until the deck is made.

- Sources go `useSourceSet().resolve()` → [data/generateDeckFromSources.ts](./data/generateDeckFromSources.ts) → `education/convert/segmentedGenerate.ts`; each citation is backfilled from ITS OWN Source; each Source gets a `source` lineage edge (`recordSourceLineage`). A topic alone uses `useGenerateCards`. Flashcards declare `FLASHCARD_SOURCE_DELIVERIES = ["direct"]` (resolved text only). Previews render through `MarkdownStream`.
- THE COUNT LAW: an explicit card count is delivered exactly (`convert/coverage.ts` folds sections into at most that many passes; `mergeSectionItems` trims and drops near-duplicates). Mechanism and the no-freeze rule (stalled part retried once, failures shown): `education/convert/FEATURE.md`.
- The most cards one run makes is the knob `flashcards.max_cards_per_run`, read once through `data/useMaxCardsPerRun.ts` by Create deck and Add more cards. A failed read is said on screen and blocks the run; no constant stands in.
- A card run is tab-bound: its request (`data/cardRunRequest.ts`) is kept device-local by `lib/wizard-draft/useTabBoundRun.ts`, so a reload mid-run shows "stopped" with Try again (there is no server run to re-attach to).
- The deck's Source set is saved by exactly two writers (`CreateDeckPage` after generation, `AddMoreCardsButton` after adding) via `data/deckSourceSet.ts`; page loads write nothing. Add more cards seeds from it, falls back to lineage.
- Add more cards is steerable (card-type chips + focus text ride the run request, `foldSteer`) and undoable: each run stamps `metadata.batch_id` on its cards, and Undo archives exactly that batch (`data/undoCardBatch.ts`, soft delete only).
- A deck made from chat flashcards is named after its subject, never the placeholder "Flashcards" (`utils/deckName.ts`).

## Agent-generated decks — the single-writer contract

A headless run has two possible `fc_set` writers: the surface's explicit save and the stream's render-block materialization (`FLASHCARDS_CANONICAL_ADAPTER`). Keep it to ONE row, keyed by the run's conversation id:

- Surfaces never call `createSetWithCards` for a generated deck; they call `fcService.createGeneratedSetForConversation(conversationId, input, cards)`, which adopts the adapter's set if it won the race, else creates it stamped `metadata.source_system="cx_conversation"` / `source_id=<cid>`. The adapter looks up that stamp and links, never twins.
- Every generation here launches with `surfaceOwnsOutput: true` (on the conversation record, survives reload), so neither the stream commit nor a reload reconcile materializes a twin.
- Try again continues the stopped run's deck (`{ continues }` → `continueGeneratedSet`: half-made cards archived, retry's cards added) instead of saving a second.
- Pinned by `data/__tests__/generated-set-single-writer.test.ts` and `try-again-continues-the-stopped-runs-deck.test.ts`. Limit: dedupe is look-before-write, not a DB constraint (a global unique would break multi-deck chats), so a few-ms interleave could still double-create.

## Images on card faces

Rules, status and open work live in the common-docs images FEATURE; the frontend shape is: **one renderer** ([`FlashcardFaceImage`](../../components/mardown-display/blocks/flashcards/FlashcardFaceImage.tsx)), **one adapter** ([`components/study/cardImages.ts`](./components/study/cardImages.ts) — never inline `details.find(...)`), **one writer** (`fcService.setCardImage` / `removeCardImage`, supersede-then-insert; server lanes in aidream `services/education/card_images.py`). Editor lanes: `components/editor/CardImageSlot.tsx` (Upload, Photo via the shared `lib/media/unsplash.ts`, Find, Generate, Remove); per-set "Illustrate this set" is `set-detail/illustrateSetRun.ts` + `IllustrateSetWindow.tsx` (live rows while it runs, then the keep/reject review pass; `fcService.reviewCardImage` stamps `metadata.human_review` before a soft delete).

Frontend-only traps: alt text is required on both free lanes; a signed URL is never persisted (`isSignedUrl` guard); `metadata.credit` renders as a caption (adapter → `FaceImageRef.credit`); the print window is unauthenticated, so a `file_id`-only face is skipped and counted in a toast (`utils/deckPrintData.ts` `buildDeckPrintData`, the one deck-to-printer mapper).

## Enrichment (detail layers)

- ONE reader [`data/cardDetailLayers.ts`](./data/cardDetailLayers.ts) defines "this card is enriched" (excludes audio, image and memory-aid rows); ONE renderer `components/study/CardDetailLayers.tsx` ("More on this card" strip + "Explain more"); ONE lane `data/enrichCardLane.ts` (`enrichAndSaveCard`: generate → `fcService.addDetail` → clear the pending proposal). Kind `card_enrichment` renders agent PROPOSALS (dialog preview), not stored rows.
- Bulk: `set-detail/bulkEnrichRun.ts` `planBulkEnrich` is the one place that decides the work AND the button label ("Enrich selected (3)" / "Enrich all cards (5)"); an explicit pick beats the skip-already-enriched heuristic and is reported separately. Each in-flight card is an `EnrichingCardTile` reading its own `selectKindEnvelope(requestId, "card_enrichment")` live (no second parser); concurrency 3; cancel stops the cursor, in-flight cards land. Guarded once on `education.card_enrichment`, committed per card, COPPA before billing.
- Tests: `data/__tests__/card-detail-layers.test.ts`, `set-detail/__tests__/bulk-enrich-run.test.ts`.

## Study modes

- Every grade funnels through `useFlashcardStudy().grade` (writes `study_attempt`, advances `item_mastery`, offline-aware via `recordAttemptOfflineAware`); mobile and desktop both use `FlashcardConfidenceRow` (1–5, `confidenceToResult` in `lib/srs/fsrs.ts`) — never a fork.
- Round size for Test / Write / Match: `data/roundSize.ts`, saved per learner at `userPreferences.flashcard.testQuestionCount` / `writeCardCount` / `matchPairCount` (0 = every card); distractors come from the whole deck. Cloze/formula cards always render through `studyFaces` / `CardFaceBlock`, never raw markup.
- Collapse-on-mastery: one pure resolver `data/collapse.ts` folds mastered `expands_into` sub-cards; the per-learner decision is `item_mastery.collapse_state` (`studyService.setCollapseState`). Wired into the Fast Fire launcher only.
- The public deck page (`components/public/PublicFlashcardDeck.tsx`) studies the real deck signed out with the SAME `StudyDeck`; progress is device-local (`data/useLocalFlashcardStudy.ts`) because `study_record_attempt` would file a signed-in visitor's attempts under the deck OWNER's organization. Matching/formula cards study as plain flips there (the public read has no `dynamic_content`).
- Formula cards (`dynamic_content.formula`, composed by `studyFaces`), a generation Depth tier (`foldDepthIntoRequest`), and semantic Write grading (`gradeTypedSemantic` on `flashcards.grade_typed_answer`; Levenshtein stays the instant verdict) are live.
- Give-away fixer: `components/giveaway/FixGiveawayCardsAction.tsx` (editors only, mounted on Match) runs `flashcards.fix_giveaway_cards`; it answers `list_change_proposal_v1` (target `flashcard_deck`) and accepted rewrites save via `fcService.updateCard` (`features/list-change-proposals/applyListChange.ts`).

## Fast Fire (`fast-fire/`)

- The spoken grader takes the clip as the mandate's NAMED offered value `variables.answer_audio = <durable file_id>` (declared `kind="file"`, guaranteed — the server refuses a no-audio run before any spend). `runSpokenGrader` (`fast-fire/agents/grading-core.ts`) is the only launch path; with no clip the learner sees `NO_ANSWER_HEARD`, never a blank "skipped". Same conversion for `education.spoken_practice_grade` and `education.grade_handwritten`.
- Microphone capture starts BEFORE the durable study session is created (a refusal can't orphan a session). The coach review waits for every launched card grade to settle before snapshotting Redux. Spoken-front/variation hashes stay unsigned (a negative index silently drops TTS offers).
- The local QA audio fixture activates only in a dev build on `localhost`/`127.0.0.1` with the exact `matrxQaAudio=fastfire-browser-spoken-answer-fixture-v2` query value.
- Helper audio: `flashcards.enrich_card` writes `helper` text, `flashcards.helper_tts` renders it once to `audio_file_id` on that `fc_detail` row (`fast-fire/helper-audio/`); "I'm confused" plays the cached clip instantly while `flashcards.help_live` deepens it. Missing cache = old behavior. The session transcript (`fast-fire/session-transcript.ts`) feeds the end review and persists to `study_session.session_transcript`; review pills include Best and a Play-all playlist.
- The education layout owns header clearance once; the page adds no second offset. The initial load has a terminal retry boundary (20 s).

## AI jobs and agent surfaces

- The list of AI jobs is [data/mandates.ts](./data/mandates.ts) (`FC_MANDATES`); declarations are in aidream `aidream/services/education/mandates.py` plus the TTS ones in `aidream/services/mandates/client_mandates.py`. Never copy the list here or hardcode an agent id or prompt. Consumers read results through ONE reader each (`data/coerce-card.ts`, `coerceGradeVerdict`, `parseSessionReview`) and mount kind components via `KindInstanceRender`; the generated-set title is the `flashcard_set` kind's `title` only.
- Each surface registers only the mandates it can launch (`data/mandate-disclosure.ts`, `intelligence-places.ts`), UI-free: disclosure is the shell's Agents menu, never page chrome. Fast Fire declares its instant-help job in its static manifest. Plan: `common-docs/systems/intelligence/mandates/REGISTER.md`.
- Surface manifests: `features/surfaces/manifests/education-flashcards`, `-flashcard-set`, `-flashcard-editor`, `-flashcard-study`. Study routes register through ONE hook, `components/study/useFlashcardStudySurface.ts` (the card in view, side shown, history, score). Deck and Edit pages register the five write targets from `components/editor/deckWriteHandlers.ts`. The list surface exposes `create_decks` / `update_decks` / `delete_decks` / `duplicate_decks` (`components/home/deckAgentWrites.ts`, `data/deckOperations.ts`). A broad route prefix must never claim a child route whose vocabulary it can't emit.
- The deck page reads deck, mastery, access, consent verdict and lineage once per tab (Redux `storeReads`).
- Inline voice tutoring (`VoiceTutorPanel`, `education.voice_tutor`) is closed to the current card: no web_search tool; it hands off to the full tutor for anything outside the card.
