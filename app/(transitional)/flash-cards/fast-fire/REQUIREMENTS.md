# Fast Fire Flashcards — Requirements & Rebuild Spec

> **Status: NOT BUILT. This route does not work and never has.** This document is the
> single source of truth for the eventual ground-up rebuild. It captures (a) the original
> vision, (b) a firsthand audit of the failed attempt and *why* it failed, and (c) the
> target architecture using today's platform primitives. When the rebuild happens, it
> happens from this doc — not by patching the existing files.
>
> **Do not "quick-fix" the current route.** The owner has deliberately chosen to wait so
> this fits the larger learning system (persistence, per-card scoring, adaptive selection)
> rather than shipping a working-but-isolated toy. Premature patching is the wrong move.

**Route:** `/flash-cards/fast-fire` → `app/(transitional)/flash-cards/fast-fire/page.tsx`
**Author of vision:** Armani (owner). This is a years-long dream — "I love helping kids learn,
and the technology had just gotten in my way." Get it right.

---

## 1. The Vision (the *why*)

Fast Fire is **spoken, timed, AI-graded flashcard practice** — oral-exam drilling where the
learner *talks* their answers out loud instead of flipping cards, and an AI judge scores each
answer and gives spoken coaching that can be replayed afterward.

But Fast Fire is **only the first surface of a much bigger system.** The real goal:

> **A flashcard engine that doesn't flip through a static set — it surfaces the exact cards a
> learner needs to see, when they need to see them, based on the topics they've chosen to study
> and their entire history of performance on those cards.**

That requires tracking *everything* the learner does, storing it correctly, and running
selection algorithms on top of it. This is the part the owner is most passionate about. Fast
Fire is one *input method* feeding that engine; it must be built so its data is a first-class
citizen of the larger system from day one.

**This generalizes beyond flashcards.** The same session + per-item-scoring + provenance +
adaptive-selection spine should serve **quiz sessions** and other study modes. Design the
persistence and grading layers to be mode-agnostic, with Fast Fire as the first consumer.

---

## 2. The Learner Experience (UX flow)

1. **Setup** — choose a card source (a saved set today; in the target, *any* set or a
   dynamically-assembled batch), seconds-per-card, and number of cards.
2. **"Get Ready!"** — short 3·2·1 countdown.
3. **The drill — fully automatic, no buttons.** For each card:
   - Show **only the front** (the question).
   - A timer bar depletes over the allotted seconds.
   - The learner **speaks the answer aloud**.
   - Timer expires → advance immediately to the next card. The learner never waits on the AI.
4. **Background grading — parallel, non-blocking.** Each answer is graded while the drill keeps
   moving. The UI shows live "processing N in background…" without ever stalling the flow.
5. **Live scoreboard** — running total score, # correct, overall %, expandable per-question list.
6. **Review modes** — after the session: *Review All / Review Correct / Review Best* play back
   the AI's spoken feedback (TTS) for the matching cards.

The defining principle: **"fast fire" = you never wait on the AI.** Answers stream off to
graders; grades and coaching catch up in the background.

---

## 3. Audit of the Failed Attempt (firsthand)

### 3.1 What's in the folder — three coexisting generations, only one is wired

| File | Generation | Wired in? | Notes |
|---|---|---|---|
| `page.tsx` (`FastFirePractice`) | **Gen 3 (live)** | **Yes** — the route | Settings panel, countdown, auto-record loop, `processingCount`. Uses `useFastFireSession`. |
| `FastFirePractice.tsx` | Gen 2 | No (orphan) | Manual Start/Stop buttons, "buffer phase". Reads `bufferTimeLeft`/`isInBufferPhase` the live hook no longer returns — hence its `@ts-ignore` + `as any`. |
| `FastFireContainer.tsx` | Gen 1 | No (orphan) | Uses a *second* hook `useFastFireSessionNew`; renders the two below. |
| `FastFireFlashcard.tsx` | Gen 1 | No (orphan) | Child of Container only. |
| `FastFireAnalysis.tsx` | Gen 1 | No (orphan) | Child of Container only. |

**Hooks:** `hooks/flashcard-app/useFastFireFlashcards.ts` (`useFastFireSession`, live) and
`hooks/flashcard-app/useFastFireSessionNew.ts` (`useFastFireSessionNew`, orphan) +
`hooks/flashcard-app/useAudioRecorder.ts`.

**Rebuild deletes all five components + both session hooks.** Keep only the audio-capture
primitives (below). One clean hook/slice replaces the lot.

### 3.2 What actually works — and it's the part you'd expect to be hard

The **audio layer is modern and solid.** `useAudioRecorder` and `useFastFireFlashcards` were
retrofitted (2026-06-24, per `features/audio/FEATURE.md`) onto the canonical primitives:
- `acquireMicStream` / `releaseMicStream` — the app-wide mic singleton (chosen device, warm
  grant, no re-prompt on iOS, never `track.stop()`s the shared device).
- `getSharedAudioContext` / `resumeSharedAudioContext` — one shared `AudioContext` (iOS caps live
  contexts).
- `claimCapture` / `releaseCapture` — app-wide "one live capture, anywhere," start-always-wins.

**Recording is a solved problem here. Do not rebuild it — reuse it.**

### 3.3 Why it never worked — root causes (all in state/result plumbing, none in audio)

1. **🔴 KILLER BUG — stale-state read after `await submit()`.** Both hooks do:
   ```ts
   await submit(audioBlob);
   const conversation = getCurrentConversation();
   const lastResult = conversation?.structuredData?.[last];   // always stale → undefined
   ```
   `submit()` (in `hooks/ai/useDynamicVoiceAiProcessing.tsx`) writes the AI result via
   `setConversations(...)` (async React state) and **returns `void`**. The next line reads
   `conversations` from the *same render's closure*, which hasn't updated. `lastResult` is
   `undefined` → `useFastFireSessionNew` throws *"No response received from AI"*; the live hook's
   `if (lastResult)` guard silently fails and **no result is ever recorded.** The AI grades
   correctly server-side — the grade just never reaches the UI. **This alone makes the whole
   feature look broken.**
   - *Fix shape:* the grade function must **return** the structured result up the call stack
     (`processAiRequest` already returns it — the hook throws it into state and re-reads stale).
     Never read React state immediately after the `await` that set it.

2. **🔴 `audioPlayer` is a ref mutated inside an effect.** `useDynamicVoiceAiProcessing` returns
   `audioPlayer: audioPlayerRef.current`, set by mutating `.current` in a `useEffect`. Mutating a
   ref never triggers a re-render → the review/playback player is flaky-to-dead. Must be `useState`.

3. **🟠 The timer fights React.** A `setInterval` decrementing React state, inside an effect whose
   deps include `startRecording`/`stopRecording` (new identities every render). The effect tears
   down and re-subscribes constantly → double-starts, dropped ticks, mid-card resets.
   - *Fix shape:* a **deadline** (`deadlineTs` in a ref) read by a single `requestAnimationFrame`
     loop against `Date.now()`. Never resets on re-render, never double-fires.

4. **🟠 Legacy AI path (whole approach is obsolete).** `actions/ai-actions/assistant-modular.ts`
   (`processAiRequest`) is a self-contained Next.js server action calling OpenAI/Groq/Anthropic
   SDKs with raw API keys; `useDynamicVoiceAiProcessing` keeps its own localStorage conversation
   store + a bespoke `TextToSpeechPlayer` queue. This predates the platform's AI integration and
   violates the "no Next.js middle tier; agents run on the Python backend" rule. **Replace
   wholesale** (§5).

5. **Minor:** `sessionState.isProcessing` is never set true in the live hook (only
   `processingCount`); results dedupe by a synthetic `cardId` that can collide; `moveToNextCard`
   and `recorder.onstop` capture `currentCardIndex` from stale closures.

---

## 4. Audio Capture — the better model (owner's design)

The old design **cut the mic off and on per card.** That introduces start/stop unknowns,
re-arm latency, and brittle per-chunk grading. The new design:

- **One continuous recording for the whole session.** Start the stream once; never stop between
  cards.
- **Chunk what you *send*, not what you *record*.** Slice the continuous stream per card for
  grading.
- **~1 second of overlap on each side.** Each card's grading clip includes ~1s *before* the card
  appeared and ~1s *after* the buzzer — so a learner who starts a beat early or trails a word or
  two past the buzzer still has their full answer captured.
- **Audible markers for the AI.** Play a small buzz/tone at each card's start and stop. The grader
  hears these boundaries in the audio, but is instructed to still count a stray word or two
  *after* the buzzer as part of the answer. Agents reason about "what's going on" far better with
  a continuous, marked clip than with an isolated hard-cut chunk.
- **Retain the full-session audio.** Because it's one stream, we keep the entire session recording.
  That unlocks §6.

This is both more robust (no per-card mic re-arm) and more intelligent (the model gets context,
not a naked slice).

> Implementation note: reuse the mic singleton + shared `AudioContext`. Continuous capture +
> client-side slicing (with overlap) is the new requirement on top of the existing recorder.
> Decide whether slices are produced client-side (`MediaRecorder` timeslices buffered + re-assembled
> with overlap) or whether the whole stream is uploaded and sliced server-side by timestamps.

---

## 5. Grading — agent-based, audio-native, auto-persisted

**Replace the client-side server action entirely with a real Matrx agent run.** Grading is
compute that belongs on the Python backend (or a realtime agent), via the normal agent execution
system — not a Next.js server action with baked-in API keys.

### 5.1 Preferred path — native-audio model, batch grading

- **Send the audio clip directly to a model that natively accepts audio** and ask for JSON back.
  Owner's current pick: **Google Gemini 3.5 Flash** — fast, inexpensive, native audio in,
  structured JSON out. (Confirm exact model id at build time.)
- Grade **per card, in parallel, in the background**, keyed by a stable card identity (§7). The
  drill loop must never await a grade.
- **Matrx action auto-persist.** The server can bake in a **Matrx action** — a marker the backend
  auto-detects in the model's response and persists to the DB before the response returns. So a
  grade is **already saved** by the time the client reads it. The client still consumes the
  response for live UI, but persistence does not depend on the client round-trip.

### 5.2 Alternative path — realtime agent (e.g. xAI Grok Realtime, already working)

- Stream audio to a realtime agent and give it a **tool call that records the score.**
- **Advantage:** lowest latency → true real-time feedback during the drill.
- **Disadvantage:** if we're *not* playing audio feedback back live, realtime may not actually
  save wall-clock vs. fast background batch grading. Choose per product goal: real-time coaching
  → realtime agent; review-after → batch native-audio.

### 5.3 Scoring rubric

- The old **0–6 score is irrelevant** and will be redone. Owner doesn't recall the original logic;
  the new rubric will be **highly structured**, defined in the grading agent's prompt.
- The grade payload must record **provenance**: this score came from **Fast Fire** (spoken,
  AI-graded) as opposed to other methods (e.g. normal flashcard review = self-reported). See §7.

---

## 6. Session-level review (unlocked by continuous audio)

Because we keep the entire session as one recording:

- **Transcribe the full session.**
- Run **one agent over the whole set together** as a *secondary* score/insight indicator —
  catching patterns no single-card grade can (consistency, confusion across related cards,
  improvement within the session, topics to revisit).

This is a second grading lane layered on the per-card grades, not a replacement.

---

## 7. Persistence — the part that justifies waiting

### 7.1 What exists today (and why it's not enough)

A persistence layer already exists (`features/flashcards/`):
- `users.user_flashcard_sets` — sets (cards stored as JSON; auto-generated from chat, linked to
  `cx_conversation`/`cx_message`).
- `users.user_flashcard_reviews` — review log keyed by **`(set_id, card_index)`**, result is
  `correct | partial | incorrect`.
- A Leitner spaced-repetition concept (`LeitnerBox = 1|2|3`, `isDue`), `CardReviewStats`,
  `masteryPercent`, in `features/flashcards/services/flashcardPersistenceService.ts`.

**The blocking limitation:** reviews are keyed by a card's **position inside one set**
(`set_id` + `card_index`). A card has no identity of its own. That **directly conflicts** with the
owner's core requirement:

> "Score per individual card… all of the scores you ever get for that flashcard follow you
> wherever you go… even reviewing flashcards randomly created into a batch by taking individual
> cards from different places."

You cannot make scores follow a card across sets/batches when the card *is* just an index into a
set. **The card must become a first-class entity with a stable id.**

### 7.2 Target persistence model (redo the table structure)

The owner explicitly expects to **redo the DB structure**. Target concepts (names illustrative —
finalize against the platform DB conventions and the 2026 schema reorg / canonical-RLS rules):

- **Canonical card entity** — a stable per-card identity so the same card can live in many sets
  and in ad-hoc batches, and carry its history everywhere. Sets/batches *reference* cards rather
  than embedding them as positional JSON (or: embedded cards still resolve to a canonical card id).
- **Study session entity** — one row per session (e.g. one Fast Fire run): mode, source, settings,
  start/end, the **full-session audio reference** (durable, per the media-durability rules — never
  a raw signed URL), the session-level review (§6), aggregate score.
- **Per-card score/attempt log** — every attempt on a card, with:
  - stable **card id** (not set-position),
  - **provenance / method** (`fast_fire` vs `self_reported` vs `quiz` vs …),
  - structured score (new rubric), correct/partial/incorrect or richer,
  - link back to the **session** and to the **audio clip** for that card,
  - timestamp.
- **Study analytics surface** — enough signal to later (a) drive adaptive selection and (b) help a
  learner prep for a final exam by identifying weak topics/cards. Track topics, mastery trends,
  struggle areas.

This model is **mode-agnostic** on purpose: quiz sessions and other study modes write the same
session + per-item-score shape, just with a different `method`/mode.

> DB work follows the house rules: the DB is the source of truth, migrations applied via Supabase
> MCP + verified live + `pnpm db-types`, canonical RLS via `iam.apply_rls`, schema reorg aware.
> See `CLAUDE.md` and the `db-change` skill family. Coordinate with the existing
> `features/flashcards/` persistence so we extend/replace it cleanly rather than forking a parallel
> store.

---

## 8. The Adaptive Engine (the dream — design toward it, don't block on it)

The end state isn't flipping a static set. It's a system that **chooses what to show next**:

- Learner states the **topics** they want to study.
- The engine draws on **all past performance** (per-card history, provenance, recency, mastery,
  spaced-repetition scheduling) to assemble the next batch — pulling individual cards from across
  many sets.
- "Random batch from different places" is a first-class concept, which is *why* per-card identity
  and cross-set scoring (§7) are non-negotiable foundations.

Fast Fire feeds this engine; it doesn't have to *be* it on day one. But every persistence and
identity decision must keep this reachable. This is the owner's north star — treat it as the
acceptance criterion for the data model.

---

## 9. Build Plan — keep / replace / delete + the simple wins

### Keep
- Mic singleton (`acquireMicStream`/`releaseMicStream`), shared `AudioContext`, `captureLock`.
- The `flashcardGrader` JSON shape as a *starting point* (`{correct, score, audioFeedback}`) —
  will evolve with the new rubric.
- `FlashcardData` type (`types/flashcards.types.ts`) and existing flashcard sets as a data source
  to start, pending the DB redo.

### Replace
- `useDynamicVoiceAiProcessing` + `processAiRequest` (legacy client/server-action AI) → **agent
  run on the Python backend** (native-audio model, Matrx-action auto-persist) or **realtime agent**.
- Bespoke `TextToSpeechPlayer` ref-as-render trick → platform audio/TTS primitives
  (`@/features/files` / `InlineMediaRef` / the audio pipeline).
- Per-card mic on/off → **one continuous stream, sliced with overlap + buzzer markers** (§4).

### Delete (after the rebuild lands)
- All 5 components in this folder, `useFastFireSession`, `useFastFireSessionNew`,
  `useAudioRecorder` (if superseded). No shims, no fallbacks (house rule: deprecated code is
  deleted, not preserved).

### The simple wins that actually unblock this (smallest leverage first)
1. **Grading returns its result** instead of stashing in state and re-reading stale. Single
   highest-leverage fix — surfaces every grade. (Or rely on Matrx-action DB persistence + read
   back, sidestepping client state entirely.)
2. **Never `await` the AI in the drill loop.** Fire-and-forget per card, keyed by stable card id;
   render grades as they resolve. (Already the *intent* — the stale-read bug defeats it.)
3. **Deadline timer, not a countdown.** One `deadlineTs` ref + one rAF loop vs `Date.now()`.
   Kills the entire class of timer bugs.
4. **One explicit state machine** (`idle → countdown → recording → advancing → … → complete`) in a
   single reducer / Redux slice, not four drifting `useState`s + a fragile effect.

Rough effort once the DB model is decided: the drill mechanics are small (~150 lines with a
deadline timer); the AI side is the "few lines" of a normal agent run. **The DB redo + adaptive
foundations are the real work, and the reason to wait.**

---

## 10. Open Decisions (resolve before/at build time)

1. **Card identity & DB redo** — finalize the canonical-card + session + per-card-attempt schema
   (§7) against the 2026 schema reorg and `features/flashcards/` current tables. *Biggest item.*
2. **Card source** — when does Fast Fire start taking a real set/batch id from the DB instead of
   the hardcoded `historyFlashcards`?
3. **Grading lane** — batch native-audio (Gemini 3.5 Flash) vs realtime agent (Grok). Likely
   support both; pick the default by whether live coaching matters.
4. **Audio slicing** — client-side `MediaRecorder` timeslice re-assembly with overlap, vs upload
   whole stream + server-side slice by timestamps. (Affects where overlap/markers are applied.)
5. **Buzzer markers** — exact tones, and the grader-prompt instruction for handling post-buzzer
   trailing words.
6. **Session review agent** (§6) — in v1 or fast-follow?
7. **Generalization** — confirm the session + per-item-score + provenance spine is the shared
   foundation for **quiz sessions** and other modes, and name them so the schema is designed for
   reuse, not retrofitted later.

---

## 11. Change Log
- `2026-06-28` — Initial requirements doc. Firsthand audit of the failed attempt (3 generations,
  root-cause bug catalog), plus the owner's full target vision: continuous-audio capture with
  overlap + buzzer markers, agent-based audio-native grading with Matrx-action auto-persist,
  redone per-card-identity persistence with provenance, session-level review, and the adaptive
  topic/performance-driven card-selection engine as the north star. Nothing from the discussion
  omitted.
