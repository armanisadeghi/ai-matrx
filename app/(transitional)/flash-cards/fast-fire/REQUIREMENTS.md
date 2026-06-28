# Fast Fire Flashcards — Requirements, Vision & Ground-Up Build Spec

> **Status: NOT BUILT. Build from scratch, correctly, canonical from day one.**
>
> This is the single source of truth for the eventual rebuild. We are **not** patching the old
> route and **not** binding to any existing flashcard tables. Everything the platform has today
> (the `education` schema, the old `users.user_flashcard_*` tables, the localStorage AI hooks) is
> **inspiration only** — we study it to understand the goal, then design the ideal from a blank
> page so every table is built right and every aspect of the vision is captured from the start.
>
> Two hard constraints govern the database:
> 1. **It must follow our new canonical system** (`docs/official/canonical_db.md`).
> 2. **It must allow everything described in this document** — nothing in the vision may be
>    blocked by a shortcut taken in the schema.
>
> **Do not "quick-fix" the current route.** Working-but-isolated is the wrong outcome. The point
> of waiting is to fit the larger learning system from day one.

**Route today:** `/flash-cards/fast-fire` → `app/(transitional)/flash-cards/fast-fire/page.tsx`
**Vision owner:** Armani. A years-long dream — "I love helping kids learn, and the technology
had just gotten in my way." Get it right.

---

## 1. The Vision (the *why*)

**Fast Fire** is **spoken, timed, AI-graded flashcard practice** — oral-exam drilling where the
learner *talks* their answers out loud instead of flipping cards, and an AI judge scores each
answer and gives spoken coaching that can be replayed afterward.

But Fast Fire is only the **first input method** into a much larger learning engine. The real goal:

> **A study system that doesn't flip through a static set — it surfaces the exact cards a learner
> needs to see, when they need to see them, based on the topics they've chosen to study and their
> entire history of performance on every card.**

That demands tracking everything a learner does, storing it correctly, and running selection
algorithms on top of it. This is the part the owner is most passionate about. Every persistence
and identity decision in this doc is made to keep that reachable.

**This is mode-agnostic by design.** The same spine — rich cards, sessions, per-card scoring with
provenance, dimensions, lineage, adaptive selection — must also serve **quiz sessions** and other
study modes. Fast Fire is the first consumer, never the only one.

---

## 2. The Learner Experience (Fast Fire flow)

1. **Setup** — choose a source (a saved set, or a dynamically-assembled batch — see §4.3),
   seconds-per-card, and number of cards.
2. **"Get Ready!"** — short 3·2·1 countdown.
3. **The drill — fully automatic, no buttons.** For each card: show **only the front**; a timer
   bar depletes; the learner **speaks the answer aloud**; timer expires → advance immediately. The
   learner never waits on the AI.
4. **Background grading — parallel, non-blocking.** Each answer is graded while the drill keeps
   moving; the UI shows "processing N in background…" without ever stalling.
5. **Live scoreboard** — running score, # correct, overall %, expandable per-question list.
6. **Review modes** — after the session: *Review All / Review Correct / Review Best* play back the
   AI's spoken feedback for the matching cards.

Defining principle: **"fast fire" = you never wait on the AI.** Answers stream off to graders;
grades and coaching catch up in the background.

---

## 3. What a Flashcard *Can Be* (simple → arbitrarily rich)

A card is not "front + back." It is a **rich, hierarchical, sourced, multi-media knowledge object**
that can be as simple or as complex as we want. The model must support, from day one:

- **Core prompt/answer** — `front` / `back`, plus optional `card_kind` (basic, cloze/fill-in,
  concept, definition, image-prompt, etc.) so we're not locked to one question shape.
- **Layered explanation** — `example`, `detailed_explanation`, and AI-written **helper text** (the
  "I'm confused" copy), each independently present or absent.
- **Pre-generated audio** — durable TTS of the helper text (and potentially the answer/example), so
  "I'm confused" plays **instantly** from storage, not generated on click (see §9).
- **Media** — one or more images, diagrams, or audio clips attached to a card.
- **Learner annotations** — `personal_notes`, custom tags.
- **Difficulty / level / topic / lesson** — for filtering, scheduling, and adaptive selection.
- **Hierarchy (expand / collapse)** — a card can **expand into child cards** when a learner
  struggles (one concept becomes several finer-grained cards) and **collapse** when they've
  mastered a topic (children fold back into the parent). Cards form a tree/graph, not a flat list.
  This is a first-class feature, not a tag. See §4.2.
- **Dimensions / themes / cross-cutting tags** — entity-level connectors that let a single
  "string" run through ten different sets and assemble, say, 25 cards into a themed batch. See §4.3.
- **Source lineage** — a reference back to where the card's knowledge originated: class notes, a
  textbook, a specific page of a specific uploaded guide. Powered by the knowledge system. See §11.
- **Provenance-tagged performance history** — every score the learner ever earns on this card,
  from any mode, follows the card everywhere. See §10 / §12.

> Acceptance test for the card model: *"Can a card be a one-line Q&A, AND a concept that expands
> into five sub-cards, each with an image, pre-recorded audio, a citation to page 42 of an uploaded
> PDF, three cross-set themes, and a full per-learner score history — with no schema change?"*
> If no, the model is too thin.

---

## 4. Structure: Sets, Hierarchy, Dimensions

### 4.1 Sets (explicit, ordered collections)
A **set** is a named, ordered collection that **references** cards (many-to-many) — it does not own
or embed them. The same card lives in many sets and carries one identity and one history across all
of them. Order is a property of the membership, not the card.

### 4.2 Hierarchy (expand-on-struggle / collapse-on-mastery)
Cards relate to other cards through typed relations (`expands_into`, `summarizes`, `prerequisite_of`,
`see_also`, …). "Expand" surfaces a card's `expands_into` children when the learner struggles;
"collapse" hides them once mastery is shown. The relation graph is queryable and ordered, and the
adaptive engine (§13) drives expand/collapse automatically from performance.

### 4.3 Dimensions / Themes (cross-cutting connectors)
Beyond sets, cards carry **dimensions** — tags, categories, and entity associations that cut across
sets. A theme is a dimension value ("Photosynthesis", "Unit 3 Final", "Cell Biology"); querying a
dimension assembles a **dynamic batch** of cards drawn from many sets. Dynamic batches are
first-class study sources, equal to saved sets, and are exactly what feeds the adaptive engine.

---

## 5. Audit of the Failed Attempt (firsthand — kept so the lessons aren't lost)

### 5.1 Files in the folder — three coexisting generations, only one wired
- **Live route:** `page.tsx` (`FastFirePractice`) → `useFastFireSession`
  (`hooks/flashcard-app/useFastFireFlashcards.ts`). Settings panel, countdown, auto-record loop.
- **Orphans (imported by nothing):** `FastFirePractice.tsx`, `FastFireContainer.tsx`,
  `FastFireFlashcard.tsx`, `FastFireAnalysis.tsx`, plus the second hook
  `hooks/flashcard-app/useFastFireSessionNew.ts`.

The rebuild **deletes all five components + both session hooks**. One clean hook/slice replaces them.

### 5.2 What actually works — the audio layer
The mic stack is modern and solid (retrofitted 2026-06-24, per `features/audio/FEATURE.md`):
mic **singleton** (`acquireMicStream`/`releaseMicStream`), **shared** `AudioContext`, app-wide
**capture lock** (`claimCapture`/`releaseCapture`, start-always-wins, no iOS re-prompt). **Reuse
this. Do not rebuild it.**

### 5.3 Why it never worked — root causes (all state/result plumbing, none in audio)
1. **🔴 KILLER — stale React state read after `await submit()`.** `submit()` writes the AI grade via
   `setConversations(...)` and returns `void`; the next line reads `conversations` from the same
   render's closure (not yet updated) → `lastResult` is `undefined` → the grade is computed
   server-side but **never reaches the UI**. *Fix:* grading must **return** the result up the call
   stack (or be read from the DB after auto-persist — §7), never re-read state set in the same tick.
2. **🔴 `audioPlayer` is a ref mutated in an effect** → never re-renders → review playback is dead.
   Must be state.
3. **🟠 Timer fights React** — `setInterval` decrementing state in an effect with unstable deps →
   teardown/re-subscribe every render → double-starts, dropped ticks. *Fix:* a **deadline** (`ref`)
   read by one `requestAnimationFrame` loop vs `Date.now()`.
4. **🟠 Legacy AI path** — `processAiRequest` (Next.js server action, raw SDK keys) +
   `useDynamicVoiceAiProcessing` (localStorage store, bespoke TTS) predate the platform's agent
   system and violate "agents run on the Python backend." **Replaced wholesale** (§6).

---

## 6. Audio Capture — the better model

The old design cut the mic off/on **per card**, introducing start/stop unknowns, re-arm latency,
and brittle per-chunk grading. New design:

- **One continuous recording for the whole session.** Start the stream once; never stop between cards.
- **Chunk what you *send*, not what you *record*.** Slice the continuous stream per card for grading.
- **~1 second of overlap each side** — each card's grading clip includes ~1s *before* the card
  appeared and ~1s *after* the buzzer, so an early start or a trailing word or two is still captured.
- **Audible buzzer markers** at each card's start/stop. The grader hears the boundaries but is
  instructed to still count a stray word after the buzzer as part of the answer. Agents reason about
  a continuous, marked clip far better than a naked hard-cut slice.
- **Retain the full-session audio** (durable media ref) — one stream means we keep the whole thing,
  which unlocks §8.

> Reuse the mic singleton + shared `AudioContext`. The new requirement is continuous capture +
> per-card slicing with overlap. Open decision (§14): client-side `MediaRecorder` timeslice
> re-assembly vs upload-whole-stream + server-side slice by timestamps.

---

## 7. Grading — agent-based, audio-native, auto-persisted

**Replace the client-side server action with a real Matrx agent run** through the normal agent
execution system. Grading is compute that belongs on the Python backend (or a realtime agent).

### 7.1 Preferred — native-audio model, parallel background grading
- Send the audio clip **directly to a model that natively accepts audio** and ask for JSON back.
  Current pick: **Google Gemini 3.5 Flash** — fast, inexpensive, native audio in, structured out.
  (Confirm exact model id at build time.)
- Grade **per card, in parallel, in the background**, keyed by the **stable card id** (§12). The
  drill loop never awaits a grade.
- **Matrx-action auto-persist.** The server bakes in a **Matrx action** — a marker the backend
  auto-detects in the model's response and persists to the DB before returning. The grade is
  **already saved** by the time the client reads it; the client read is a nicety, not a dependency.
  (This structurally prevents the §5.3 killer bug.)

### 7.2 Alternative — realtime agent (e.g. xAI Grok Realtime, already working)
- Stream audio to a realtime agent with a **tool call that records the score.** Lowest latency →
  true real-time feedback. Trade-off: if we're not playing feedback back live, realtime may not beat
  fast background batch grading. Default per product goal; likely support both lanes.

### 7.3 Rubric & provenance
- The old **0–6 score is discarded.** The new rubric is **highly structured**, defined in the
  grading agent's prompt; the score payload stores a structured breakdown, not just a number.
- Every grade records **provenance/method** (`fast_fire`) so it's distinguishable from other modes
  (e.g. `self_reported` classic review, `quiz`). See §12.

---

## 8. Session-Level Review (unlocked by continuous audio)
Because the whole session is one recording: **transcribe the full session**, then run **one agent
over the entire set together** as a *secondary* score/insight indicator — catching cross-card
patterns (consistency, confusion between related cards, in-session improvement, topics to revisit)
that no single-card grade can. A second lane layered on the per-card grades.

---

## 9. Background Helper-Text → Audio ("I'm confused" plays instantly)

**Vision:** when a learner generates a set and starts using it, a background agent writes short
helper/explanation text for **batches** of cards, and those batches are **processed into audio
(TTS) and stored durably** — so clicking "I'm confused" on a card plays **pre-recorded** audio with
zero wait.

**Today's gap (confirmed):** the "confused" button currently generates TTS **on click** (Groq, via
`useTextToSpeech` → `/api/audio/text-to-speech`) and the audio is **transient**. The vision is
**pre-generated and persisted.** The schema must therefore:
- store helper text per card,
- store a **durable audio asset** per card (a `file_id` / media ref under the file handler + media
  durability rules — never a transient blob, never an expiring signed URL),
- track generation status per card (pending / text-ready / audio-ready) so the UI knows what's warm.

**Flow to build:** set created → background agent writes helper text per card in batches → TTS job
renders each to a durable audio file → status flips to audio-ready → "I'm confused" serves the
stored file instantly (regenerate-on-miss as a loud recovery, never as the happy path).

---

## 10. Context Management Integration

Study sessions run inside the learner's **active working context**. Read it from the canonical
context system and pass it to every generation/grading agent so the agent knows what the learner is
working on:
- Global active context lives in `lib/redux/slices/appContextSlice.ts`
  (`selectEffectiveOrganizationId`, `selectScopeSelectionsContext`, `selectProjectId`,
  `selectTaskId`). The backend `resolve_full_context` RPC merges these into the agent's context
  slots at invocation — no client-side resolution.
- Card/session **local** context (a card's own topic/dimension tags) is read local-first with the
  global active context as fallback, per the scopes invariant (`features/scopes/FEATURE.md`). A
  study picker must **never** silently rewrite the global active context.

---

## 11. Knowledge-System Source Lineage ("See source")

Every card can carry a **lineage reference back to its origin** — the knowledge system already
models exactly this. A card generated from ingested knowledge captures, per source:
`{ source_kind, source_id, processed_document_id, chunk_id, page_number, offsets }`, resolving
through `docproc.processed_documents` → `rag.kg_chunks` (and `education.study_source_chunk` /
`study_structured_section`) back to the original file/page. The study UI offers **"See source"**,
opening the RAG **Source Inspector** (`features/rag/components/source-inspector/`) at the exact cited
page with the matched chunk highlighted.

This is a core requirement, not a nicety: knowing the **root source** of every fact (class notes vs
textbook vs page 42 of an uploaded guide) is a headline feature of the knowledge system, and cards
are a knowledge surface. A card may cite **multiple** sources, modeled as **`platform.associations`
edges** (`flashcard → <source>`, the page/chunk/offsets in `metadata`) — not a column and not a
bespoke table (§12.4).

---

## 12. The Canonical Database — Ground-Up Design

> **Greenfield. Canonical from day one.** Every entity table below carries the full canonical base
> and is registered + access-controlled the canonical way. No `is_deleted`/`is_public` booleans, no
> per-table permission/version tables, no `shared_with` arrays, no `user_id`-as-owner — those are
> exactly the legacy patterns the canonical standard kills.

### 12.0 Canonical base (applies to EVERY entity table — stated once)
Per `docs/official/canonical_db.md`:
- **Identity/owner:** `id uuid pk`, `created_by uuid`, `updated_by uuid`.
- **Org:** `organization_id uuid NOT NULL` → `public.organizations`.
- **Audience:** `visibility platform.visibility` (`private|internal|public|link`); `is_listed` for
  discovery. No `is_public` boolean as the access driver.
- **Soft delete:** `deleted_at timestamptz` (NULL = live). No `is_deleted`.
- **Versioning:** `version int` via `_touch`; `is_versioned=true`; `_history` →
  `history.row_versions`. No per-table version tables.
- **Timestamps/triggers:** `created_at`, `updated_at`, trigger trio `_stamp` / `_touch` / `_history`.
- **Register** in `platform.entity_types` (declare token; for components declare the parent in
  `platform.entity_relationships`, `kind='composition'`).
- **RLS** generated by `iam.apply_rls(schema, table, token, variant)` — variant `entity`
  (owner+org), `component` (defers to parent), or `ledger` (append-only). Never hand-write policies.
- **Sharing** via rows in `public.permissions` keyed on the entity token + registration in
  `public.shareable_resource_registry` (`owner_column='created_by'`). No bespoke share tables.
- **Satellites** (polymorphic, attach as needed, never per-feature clones): `platform.associations`
  (cross-cutting links/themes), `platform.categories` (tags/dimensions/topics), comments, favorites,
  `platform.activity_log`.
- **Gate:** `iam.verify_canonical_ok('<schema>','<table>','<token>')` returns true (zero WARN).

Schema: target **`education`** (or a dedicated study schema — open decision §14), exposed to
PostgREST so the FE reaches it via `.schema(...)` direct reads + `SECURITY DEFINER` RPCs, per the
data-flow rules. **Names below are illustrative**; finalize tokens at build time.

> **Relationships use `platform.associations`, NOT bespoke M2M/junction tables.** The canonical
> association system exists precisely to *replace per-feature M2M tables and FK litter*. So a card's
> membership in sets, the card↔card hierarchy, quiz↔card links, and card↔source lineage are all
> **association edges** — not their own tables. The *only* relationship that stays a real table is
> **composition** (a component owned by exactly one parent), declared in
> `platform.entity_relationships`. Rule: **owned by one parent → composition table; relates
> many↔many across entities → association edge.** (See §12.4.)

### 12.1 Content entities

**`flashcard`** *(entity — new token, must be registered)* — the rich, stable card. Domain columns
(beyond base): `card_kind`, `front`, `back`, `example`, `detailed_explanation`, `helper_text`,
`difficulty`, `topic`, `lesson`, `personal_notes`, `dynamic_content jsonb` (flexible extra panels).
Stable `id` is the identity that performance, relationships, and lineage hang off of — **never** a
set-position. *(`entity_types` today has `flashcard_set`/`flashcard_history`/`flashcard_review` but
**no bare `flashcard`** — register it.)*

**`flashcard_set`** *(entity — token exists)* — a named, ordered collection. Domain: `name`,
`description`, `topic`, `lesson`, `difficulty`, optional `audio_overview` media ref. Does **not**
embed or own cards; membership is an association edge (§12.4).

### 12.2 Owned sub-content (composition — real child tables)

**`flashcard_asset`** *(composition child of `flashcard`)* — media/explanation owned by one card:
`flashcard_id` (FK), `asset_kind` (`image|audio_explanation|example_audio|diagram|…`),
`media_ref` (`file_id` under the file handler / media durability rules), `generation_status`
(`pending|text_ready|audio_ready|failed`), `generated_by` (`agent|user`), `metadata jsonb`. Holds the
pre-generated "confused" audio durably (§9) and multiple images/audio. **Stays a table** because it
is owned sub-content, not a cross-entity relation — declare it in `platform.entity_relationships`
(`kind='composition'`, `child_type='flashcard_asset'`, `parent_type='flashcard'`,
`fk_column='flashcard_id'`) and use the `component` RLS variant.

### 12.3 Study + performance spine (mode-agnostic — also serves quizzes)

**`study_session`** *(entity)* — one run of any study mode. Domain: `mode`
(`fast_fire|quiz|classic_review|…`), `source_kind` (`set|dynamic_batch`), `source_ref` (set id or a
serialized batch query), `settings jsonb` (seconds-per-card, count, etc.), `started_at`, `ended_at`,
`status`, `aggregate_score jsonb`, `session_audio_ref` (durable full-session recording, §6),
`session_review jsonb` (the §8 holistic agent review).

**`study_attempt`** *(ledger — append-only)* — **the heart of the system.** One row per card answer,
keyed by **stable `flashcard_id`** so a card's history follows it everywhere. Domain:
`flashcard_id`, `session_id` (nullable — attempts can exist outside a formal session),
`method` (`fast_fire|self_reported|quiz|…` — provenance), `result` (`correct|partial|incorrect` or
richer), `score jsonb` (structured rubric breakdown, §7.3), `response_audio_ref` (per-card clip),
`response_transcript`, `latency_ms`, plus base ledger columns. Append-only; never updated in place.

**`flashcard_mastery`** *(entity — per (learner, card) rollup)* — durable scheduling/mastery state
for the adaptive engine: `flashcard_id`, `user_id` (owner), `mastery_score`, spaced-repetition
fields (`box`/`interval`, `due_at`, `ease`), `last_result`, `streak`, `struggle_flag`,
`collapse_state` (whether children are folded). Derivable from `study_attempt` but persisted for
fast selection; refreshed on each attempt (and recomputable from the ledger for integrity).

### 12.4 Relationships — `platform.associations` edges (the rich-relation layer)

**Every M2M / cross-entity relation is an association edge** on `platform.associations`
(`source_type, source_id, target_type, target_id, organization_id, label, metadata jsonb,
created_by`). One edge table relates any entity to any entity — which is exactly what lets a quiz
relate to a specific card, a card expand into others, a card belong to many sets, and a card cite
many sources, all uniformly and queryably. Ordering and typed-kind ride the edge's
`label` / `metadata` (e.g. `metadata.order`, `metadata.kind='expands_into'`).

| Relation | Edge (`source_type → target_type`) | Carries | Replaces |
|---|---|---|---|
| **Set membership** | `flashcard_set → flashcard` | `metadata.order` | a `flashcard_set_member` junction |
| **Hierarchy (expand/collapse)** | `flashcard → flashcard` | `label`/`metadata.kind` = `expands_into\|summarizes\|prerequisite_of\|see_also`, `metadata.order` | a `flashcard_relation` table — drives §4.2 |
| **Quiz ↔ card** | `quiz_session → flashcard` | `metadata` (role, weight) | ad-hoc FK litter; `quiz_session` token already exists |
| **Source lineage** | `flashcard → <source>` | `metadata` = `{processed_document_id, chunk_id, page_number, offsets}` (§11) | a `flashcard_source` table |
| **Themes / dimensions** | `flashcard → category` | cross-set "strings" → dynamic batches (§4.3) | bespoke tag tables |

**Required platform work (small, but NOT free — verified against the live DB):**
1. **Register the `flashcard` token** in `platform.entity_types` (absent today).
2. **Widen `associations_target_type_chk`** — today it allows only
   `scope/scope_type/project/task/context_item/thread/war_room/category`. Add `flashcard`,
   `flashcard_set`, and the chosen source token(s). (`source_type` is free-text — no change needed.)
3. **FE access is RPC-only.** `authenticated` has **no** grant on the `platform` schema; the FE must
   reach edges through the existing `public` `SECURITY DEFINER` RPCs (`assoc_for_entity` / `assoc_add`
   / `assoc_remove` / `assoc_set_targets`) via `features/scopes/service/associationsService.ts` +
   `useAssociations` + `EntityAssociator` — never `.from('platform.associations')`. Category
   assignment reuses `assoc_add(target_type='category')`; favorites/pins use `ues_*`.

### 12.5 Goals & dimensions (adaptive inputs)

**Topics/themes/tags** ride **`platform.categories`** (dimension-based) + **`platform.associations`**
(cross-set "strings", §4.3/§12.4) rather than bespoke tag tables — so the same primitives that tag
agents, notes, and files tag cards, and dynamic batches are just dimension queries.

**`study_goal`** *(entity — optional, near-term)* — the topics a learner has declared they want to
study: `user_id`, `topic`/dimension refs, `target`/exam date, `metadata jsonb`. The adaptive engine
reads goals + `flashcard_mastery` + the dimension graph to choose the next batch.

> **RLS variants:** entities (`flashcard`, `flashcard_set`, `study_session`, `flashcard_mastery`,
> `study_goal`) → `entity`; the one composition child (`flashcard_asset`) → `component` (declared in
> `entity_relationships`); `study_attempt` → `ledger` (append-only). Relationships are edges on
> `platform.associations`, governed by the association system's own RLS — not new tables. Every
> entity/component table must pass `iam.verify_canonical_ok`.

---

## 13. The Adaptive Engine (north star — design toward it, don't block on it)

The end state isn't flipping a static set. It's a system that **chooses the next card**: the learner
declares **topics** (`study_goal`); the engine draws on **all past performance**
(`study_attempt` provenance + recency + `flashcard_mastery` scheduling) and the **dimension graph**
to assemble the next batch — pulling individual cards from across many sets, expanding cards on
struggle and collapsing on mastery (§4.2). "Random themed batch from different places" is a
first-class concept, which is *why* stable per-card identity and cross-set scoring (§12) are
non-negotiable foundations. Fast Fire feeds this engine; it need not *be* it on day one, but every
schema decision must keep it reachable. **This is the acceptance criterion for the data model.**

---

## 14. Build Plan & Open Decisions

### Keep
- Mic singleton, shared `AudioContext`, capture lock (`features/audio/**`).
- The canonical primitives: file handler / media durability for audio, `appContextSlice` for
  context, RAG source-inspector for lineage, agent execution system for grading/generation.

### Replace
- `useDynamicVoiceAiProcessing` + `processAiRequest` → agent run on the Python backend
  (Gemini-3.5-Flash native audio + Matrx-action auto-persist) and/or realtime agent (Grok).
- Transient on-click TTS → **pre-generated, durable** helper audio (§9).
- Per-card mic on/off → one continuous stream, sliced with overlap + buzzer markers (§6).

### Delete (after the rebuild lands — no shims, no fallbacks)
- All 5 components in this folder, `useFastFireSession`, `useFastFireSessionNew`, and
  `useAudioRecorder` if superseded.

### The simple wins that unblock the drill
1. **Grading returns its result** (or read from the DB after Matrx-action auto-persist) — never
   re-read React state set in the same tick. Single highest-leverage fix.
2. **Never `await` the AI in the drill loop** — fire-and-forget per card, keyed by stable card id;
   render grades as they resolve.
3. **Deadline timer, not a countdown** — one `deadlineTs` ref + one rAF loop vs `Date.now()`.
4. **One explicit state machine** in a Redux slice (`idle → countdown → recording → advancing →
   complete`), not drifting `useState`s + a fragile effect.

### Open decisions (resolve at build time)
1. **Schema home & token names** — `education` vs a dedicated study schema; finalize every
   `entity_types` token. *(Biggest structural item.)*
2. **Hierarchy storage** — resolved: `platform.associations` `flashcard → flashcard` edges with a
   typed `kind` (§12.4), not a junction table or self-FK. Confirm the `kind` vocabulary.
3. **Card source for Fast Fire v1** — real set/batch id from the DB from the start (no hardcoded
   `historyFlashcards`).
4. **Audio slicing** — client-side `MediaRecorder` timeslice re-assembly with overlap vs
   upload-whole + server-side slice by timestamp (affects where overlap/markers apply).
5. **Grading lane default** — batch native-audio (Gemini) vs realtime (Grok); likely both.
6. **`flashcard_mastery`** — persisted rollup (proposed, for fast selection) vs computed-on-read
   from `study_attempt`. Confirm refresh strategy.
7. **Session review agent** (§8) — v1 or fast-follow.
8. **Generalization** — confirm `study_session` + `study_attempt` + dimensions are the shared spine
   for **quiz sessions** and other modes, and name those modes now so the schema is designed for
   reuse, not retrofitted.
9. **Buzzer markers** — exact tones + the grader-prompt instruction for post-buzzer trailing words.

---

## 15. Change Log
- `2026-06-28` — **Relationships moved onto `platform.associations`.** Verified live: the
  association system is the canonical replacement for per-feature M2M tables, and is what enables
  rich cross-entity relations (quiz↔card, card↔card, set↔card, card↔source). Collapsed the proposed
  `flashcard_set_member` / `flashcard_relation` / `flashcard_source` junction tables into association
  edges (§12.4); kept only `flashcard_asset` as a composition child (owned sub-content). Flagged the
  required platform work (register a `flashcard` token — absent today; widen
  `associations_target_type_chk`; FE via `assoc_*` RPCs only, no direct `platform.*` access).
- `2026-06-28` — **Reframed to ground-up + canonical.** Removed all binding to legacy tables.
  Studied the `education`-schema flashcard/quiz/study tables, the canonical standard
  (`docs/official/canonical_db.md`), and three live systems (background helper-text→audio,
  active-context, knowledge/RAG source lineage) as inspiration, then specified a greenfield
  canonical schema: rich hierarchical sourced cards, sets via ordered membership, card↔card relation
  graph (expand/collapse), dimensions/themes via canonical categories+associations, a mode-agnostic
  `study_session` + append-only `study_attempt` spine with provenance, `flashcard_mastery` for the
  adaptive engine, durable pre-generated "confused" audio, and source lineage. Kept the failed-attempt
  audit and the better continuous-audio capture + audio-native grading design. Nothing from the
  discussion omitted.
- *(superseded)* `2026-06-28` — Initial audit + first-pass requirements (legacy-aware version).
