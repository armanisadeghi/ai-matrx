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
edges** (`fc_card → file`, the page/chunk in `metadata`) — not a column and not a bespoke table
(§12.5). Set-level source content attaches the same way at the set (`fc_set → file`).

---

## 12. The Canonical Database — Finalized Design

> **Greenfield, `fc_` prefix, singular names, 100% canonical** per `docs/official/db-rules.md`.
> No `is_deleted`/`is_public` booleans, no per-feature permission/version/junction tables, no
> `shared_with` arrays, no `user_id`-as-owner. Flashcards have no dedicated schema, so every table is
> prefixed `fc_` and lives in **`education`** (domain fit; already holds `quiz_session`/`study_*`;
> PostgREST-exposed). Tokens are singular and equal the table name (`fc_card`, `fc_set`, …).

### 12.0 Canonical base — every entity table carries this (stated once)
Per db-rules §2: `id uuid` · `organization_id uuid NOT NULL → iam.organizations` · `created_by`,
`updated_by uuid → auth.users` · `created_at`, `updated_at`, `deleted_at timestamptz` ·
`version int` · **`metadata jsonb`** (now a base column). Entities that participate in discovery/
sharing also carry **`visibility platform.visibility`** (`private|internal|link|public`).
- **Triggers:** `_stamp` (`platform._stamp_actor`) · `_touch` (`platform._touch_row`) · `_history`
  (`platform._version_capture('<token>')`, set `is_versioned=true`). Composition children inherit org
  via `platform.inherit_org_from_parent()` (BEFORE-INSERT) — never hand-NULL `organization_id`.
- **Register** the token in `platform.entity_types`; components declare the parent in
  `platform.entity_relationships` (`kind='composition'`, `child_type`, `parent_type`, `fk_column`).
- **RLS** via `iam.apply_rls('education','<table>','<token>','<variant>')` — `entity` / `component` /
  `ledger`. Never hand-write. **Sharing** via `iam.permissions` keyed on the token + registration in
  `platform.shareable_resource_registry` (`owner_column='created_by'`).
- **Controlled vocabularies (db-rules §5):** a *growing* label list is a **registry you FK into**
  (`platform.categories`, namespaced by `dimension`) — never a CHECK array or enum. CHECK is allowed
  **only** for tiny, near-static state machines. Applied below: `card_kind`, `fc_detail.kind`,
  `fc_session.mode`, `fc_attempt.method`, and association `role` are **category-backed** (growing);
  `difficulty`, `generation_status`, `generated_by`, `result`, `status`, `collapse_state` are
  **CHECK** (near-static).
- **Gate:** `iam.verify_canonical_ok('education','<table>','<token>','<variant>')` → true, zero WARN.

> **No junction tables.** Per db-rules §3, anything-to-anything is a ROW in `platform.associations`;
> a new `x_y` table is a bug. The *only* relationships that are tables here are **composition**
> children (a part owned by exactly one parent): `fc_detail`. Everything else is an edge (§12.5).

### 12.1 The shape, top-down — and the two layers

Two layers, and keeping them apart is the whole game:

- **Layer A — Core content** (`fc_set`, `fc_card`, `fc_detail`): the durable knowledge objects. They
  exist and are fully useful with **zero practice and zero audio** — you can author, browse, share, and
  organize a set without ever running Fast Fire.
- **Layer B — Study & performance** (`fc_session`, `fc_attempt`, `fc_mastery`): what happens **when
  cards are used.** Entirely **mode-agnostic** — Fast Fire, classic self-review, and quiz-of-cards all
  write the same three tables.
- **Layer C — Adaptive** (`fc_goal`): the learner's stated intent that feeds card selection. Future-
  facing; cheap to stand up now.

> **Where is "the real-time audio concept"?** It is **not its own tables.** Fast Fire's signature —
> continuous recording, per-card clips, background grading, full-session review — is **behavior plus a
> few optional `file`-reference columns on Layer B** (`fc_session.session_audio_file_id`,
> `fc_attempt.response_audio_file_id`, the transcripts, `session_review`). A non-audio mode just leaves
> those NULL. So the audio/real-time feature adds **zero dedicated schema** — it rides the shared
> performance spine. That is exactly the reuse you want: **solidify Layer A + B as the core, and Fast
> Fire becomes one writer of values, not a fork of tables.** Quizzes-over-cards reuse the same spine.

```
LAYER A — Core content (no practice required)
  fc_set ──(member)──< fc_card >──┬── fc_detail   (helper / example / spoken_front / …)   [owned child]
        │                          ├──► file       (media: illustration / diagram / video)  [edge]
        │                          ├──► file       (source lineage: which page/chunk)        [edge]
        │                          ├──► fc_card    (hierarchy: expands_into / prerequisite)   [edge]
        │                          └──► category   (themes / topics → dynamic batches)        [edge]
        └──► file   (set-level source lineage: the textbook/PDF this set came from)           [edge]

LAYER B — Study & performance (mode-agnostic; Fast Fire / classic / quiz all write here)
  fc_session ──(has many)──< fc_attempt >──(rolls up into)──► fc_mastery
       └ optional audio columns = the only "real-time" footprint

LAYER C — Adaptive
  fc_goal ──► category   (the topics a learner is targeting)
```

### 12.2 Layer A — Core content

**`fc_set`** *(entity · token `fc_set`)* — **the group.** The home a card almost always starts in, and
the natural anchor for **set-level source content** (the textbook chapter / uploaded PDF / class notes
a whole set was generated from). A set **references** cards (M2M membership edge), so the same card can
belong to many sets while keeping one identity — but in practice a card is created *within* a set.

| Column | Type | Notes |
|---|---|---|
| `name` | text NOT NULL | The set's title |
| `description` | text | What this set covers |
| `topic`, `lesson` | text | Display convenience; real dimensions are category edges (§12.5) |
| `difficulty` | text CHECK | `easy`/`medium`/`hard`, nullable |
| `audio_overview_file_id` | uuid FK → `file` | nullable — optional spoken overview of the set (a `narrate()` file, §12.6) |
| `visibility` | `platform.visibility` | sets can be `private` → `public` (shareable templates) |

- **Source content lives here as an edge, not a column** (db-rules §3: lineage is an edge):
  `fc_set → file`, `role='source'`. When the whole set was generated from one document, that's the tie.
  Individual cards may *also* carry their own finer lineage (`fc_card → file`, with page/chunk) when a
  specific card maps to a specific passage. Set-level + card-level lineage coexist.
- **Membership** is `fc_card → fc_set` (`role='member'`, `position` = order). Counts/listing come from
  the membership edges (or a view) — no denormalized counter on the set to drift.
- Generation provenance (the agent run / prompt that built the set) is sparse → `metadata`.

**`fc_card`** *(entity · token `fc_card`)* — the rich, stable card; its `id` is the identity all
history / relationships / lineage hang off (never a set-position).

| Column | Type | Notes |
|---|---|---|
| `front` | text NOT NULL | Core card content |
| `back` | text NOT NULL | Core card content |
| `card_kind` | category-ref (dim `fc_card_kind`) | `basic`/`cloze`/`concept`/`definition`/`image_prompt` (growing → registry) |
| `difficulty` | text CHECK | `easy`/`medium`/`hard`, nullable (near-static) |
| `topic`, `lesson` | text | Display convenience; real dimensions are category edges (§12.5) |
| `personal_notes` | text | Learner annotation |
| `dynamic_content` | jsonb | Flexible extra panels |

- **No audio columns on the card.** Front/back audio is an *authored auditory version* (the front
  phrased as a spoken question — its own text, not a literal read of `front`) → it is an `fc_detail`
  row (`kind = spoken_front | spoken_back`). Literal "read this aloud" is an on-demand `narrate()` call
  (§12.6), not stored content.

**`fc_detail`** *(composition child of `fc_card` · token `fc_detail` · `component` RLS)* — the
exclusive, button-wired pedagogy: helper text, examples, spoken versions — each with its own authored
text and an optional narration. The "I'm confused" + explanation buttons read from here. Org is
inherited from the parent card via `platform.inherit_org_from_parent()`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `card_id` | uuid FK → `fc_card` | NOT NULL | Parent |
| `kind` | category-ref (dim `fc_detail_kind`) | NOT NULL | `helper` (load-bearing) / `example` / `detailed` / `hint` / `mnemonic` / `simplified` / `spoken_front` / `spoken_back` — growing → registry |
| `text` | text | NOT NULL | **Authoritative** source-of-truth; editable, versioned |
| `audio_file_id` | uuid FK → `file` | nullable | The narration (a `file`); null until rendered |
| `generation_status` | text CHECK | NOT NULL | `pending`/`text_ready`/`audio_ready`/`failed` (near-static) |
| `generated_by` | text CHECK | NOT NULL | `agent`/`user` |
| `position` | int | NOT NULL | Sort among a card's details |

- The `file` it points to is a canonical narration (§12.6) — **referenced by id, never copied.**
  `fc_detail.text` (current source of truth) and the file's stored `source_text` (immutable record of
  what the audio actually says) deliberately differ when text is edited but audio isn't re-rendered —
  that divergence is how staleness is detected.

### 12.3 Layer B — Study & performance *(mode-agnostic: Fast Fire, classic review, quiz-of-cards)*

How the three relate, in one line: **a `fc_session` is one sitting; it has many `fc_attempt` rows (one
per card answered); those attempts roll up into one `fc_mastery` row per (learner, card).** Session is
the *container*, attempt is the *atomic event* and the cross-mode spine, mastery is the *derived state*
the adaptive engine reads.

**`fc_session`** *(entity · token `fc_session`)* — one practice run. The audio columns are the **only**
Fast-Fire-specific footprint here; other modes leave them NULL.

| Column | Type | Notes |
|---|---|---|
| `mode` | category-ref (dim `fc_session_mode`) | `fast_fire`/`classic_review`/`quiz`/`adaptive` (growing) |
| `source_kind` | text CHECK | `set`/`dynamic_batch`/`adaptive` |
| `source_set_id` | uuid FK → `fc_set` | nullable (set runs) |
| `source_query` | jsonb | dynamic-batch criteria (nullable) |
| `settings` | jsonb | seconds-per-card, count, … |
| `started_at`, `ended_at` | timestamptz | — |
| `status` | text CHECK | `active`/`completed`/`abandoned` |
| `aggregate_score` | jsonb | — |
| `session_audio_file_id` | uuid FK → `file` | **real-time only** — durable full-session recording (§6), nullable |
| `session_transcript` | text | **real-time only** — full-session transcript (§8) |
| `session_review` | jsonb | **real-time only** — holistic agent review (§8) |

**`fc_attempt`** *(ledger — append-only · token `fc_attempt` · `ledger` RLS)* — **the heart, and the
reuse point.** One row per card answer, keyed by stable `card_id` + `method`, so **every mode writes
here and a card's history is unified across all of them.** Immutable.

| Column | Type | Notes |
|---|---|---|
| `card_id` | uuid FK → `fc_card` NOT NULL | Stable identity — history follows the card |
| `session_id` | uuid FK → `fc_session` | nullable (attempts can exist outside a session) |
| `method` | category-ref (dim `fc_attempt_method`) | `fast_fire`/`self_reported`/`quiz`/`classic_review` — **provenance** |
| `result` | text CHECK | `correct`/`partial`/`incorrect` |
| `score` | jsonb | structured rubric breakdown (§7.3) |
| `score_value` | numeric | normalized 0–1 for fast adaptive queries |
| `response_audio_file_id` | uuid FK → `file` | **real-time only** — per-card clip, nullable |
| `response_transcript` | text | **real-time only** |
| `latency_ms` | int | — |
| `graded_by` | text | model/agent id |

**`fc_mastery`** *(entity · token `fc_mastery` · `visibility=private`)* — per-(learner, card) rollup +
scheduling for the adaptive engine; recomputable from `fc_attempt` but persisted for fast selection.

| Column | Type | Notes |
|---|---|---|
| `card_id` | uuid FK → `fc_card` NOT NULL | **UNIQUE (`created_by`, `card_id`)** |
| `mastery_score` | numeric | 0–1 |
| `box` | smallint | Leitner box |
| `interval_days` | int | spaced-rep interval |
| `ease` | numeric | spaced-rep ease |
| `due_at` | timestamptz | next-due |
| `last_result` | text | — |
| `last_attempt_at` | timestamptz | — |
| `attempt_count`, `correct_count`, `streak` | int | — |
| `struggle_flag` | bool | drives expand-on-struggle |
| `collapse_state` | text CHECK | `expanded`/`collapsed`/`auto` |

> **Reusability stance (per your goal):** `fc_attempt` + `fc_mastery` are reusable *by keying on the
> card and stamping `method`* — any mode that shows a card and grades it writes the same ledger and rolls
> into the same mastery. That's cohesion without a forced universal table. `fc_session` is card-practice-
> scoped; the broader `quiz_session` entity stays its own thing. If a fully domain-neutral session spine
> is ever wanted, promoting `fc_session`→a shared `study_session` is a rename, not a redesign — but we
> don't pay that generality until a second domain needs it (so it never "gets in our way").

### 12.4 Layer C — Adaptive input

**`fc_goal`** *(entity · token `fc_goal`)* — the topics a learner declared they want to study. Domain:
`title` NOT NULL, `target_date date`, `status` text CHECK (`active`/`paused`/`achieved`/`archived`).
Topics are category edges (§12.5), not columns. The adaptive engine reads `fc_goal` + `fc_mastery` +
the dimension graph to choose the next batch (§13).

### 12.5 Relationships — `platform.associations` edges (verified live)

`platform.associations` columns: `source_type, source_id, target_type, target_id, organization_id,
role, label, position, metadata, created_by, created_at`. **`source_type`/`target_type` are FK to
`platform.entity_types(token)`** (not a CHECK list — confirmed), so we only need to *register* new
tokens. **Edge identity = `UNIQUE (source_type, source_id, target_type, target_id, role)`** — one
edge per role. `role` and `position` are canonical columns; the edge carries only what is true of the
*relationship* (endpoint properties stay on the endpoint, db-rules §3).

| Relation | Edge `source → target` | `role` | `position` / `metadata` |
|---|---|---|---|
| **Set membership** | `fc_card → fc_set` | `member` | `position` = order in set |
| **Hierarchy** (expand/collapse) | `fc_card → fc_card` | `expands_into` / `prerequisite_of` / `related` | `position` orders children → §4.2 |
| **Quiz ↔ card** | `fc_card → quiz_session` | `member` | `position`; `quiz_session` token exists |
| **Media** (images/diagrams/video) | `fc_card → file` | `illustration` / `diagram` / `chart` / `photo` / `video_ref` | `metadata.placement` (§12.5a); `position` |
| **Card source lineage** | `fc_card → file` | `source` | `metadata` = `{processed_document_id, chunk_id, page}` |
| **Set source lineage** | `fc_set → file` | `source` | the document a whole set was generated from (§12.2) |
| **Themes / dimensions** | `fc_card → category` (or `fc_set`/`fc_goal → category`) | `theme` / `topic` | dynamic-batch "strings" (§4.3) |

- **`role` is a label** (db-rules §5) → values live in `platform.categories` (role dimension), not a
  CHECK. **Media on an `fc_detail`** (not the card face) uses `fc_detail → file` as the source — no
  placement needed; the detail *is* the anchor.
- **Tokens to register before edges:** `fc_card`, `fc_set`, `fc_detail`, `fc_session`, `fc_attempt`,
  `fc_mastery`, `fc_goal`. (`file`, `quiz_session`, `category` already exist — verified.)
- **FE access is RPC-only** — `authenticated` has no `platform` grant; reach edges via the `public`
  `SECURITY DEFINER` RPCs (`assoc_for_entity`/`assoc_add`/`assoc_remove`/`assoc_set_targets`) through
  `features/scopes/service/associationsService.ts` + `useAssociations` + `EntityAssociator`. Never
  `.from('platform.associations')`. Categories reuse `assoc_add(target_type='category')`.

#### 12.5a `placement` — resolved: `metadata.placement` (not a canonical association column)
A media edge needs a *second* axis beyond `role`: **where** it attaches (`front` / `back`, or a
`detail`). db-rules §5 says a label's second classification axis can be a top-level column — but the
canonical association columns (`role`, `position`, `label`) are promoted because they are **universal
to every edge**; `placement` is **not** (a hierarchy edge, a theme edge, a quiz edge have no
placement). Adding a mostly-NULL column to the universal edge table fails the §4 sparsity test, and we
don't filter media by placement across all rows (a card has a handful of media — partition
client-side). **So `placement` lives in edge `metadata`** (`{placement: 'front'|'back', detail_id?}`).
*Promotion trigger:* the first time a second feature needs a generic "where on the source does this
edge anchor" axis, promote a canonical `placement`/`anchor` column to `platform.associations` system-
wide — a deliberate platform improvement, not a flashcard hack.

### 12.6 The narration primitive (extracted here — NOT a flashcard table)
"Authored text + its AI-rendered audio, kept paired" recurs app-wide, so it belongs to the
audio/files layer, not a per-feature table:
- The **`file` entity carries narration provenance** in `metadata.narration =
  { source_text, voice, model, source_type, source_id, narrated_at }` — any audio file self-describes
  what text it speaks, in whose voice, derived from what.
- A canonical **`narrate(text, { voice, model, source_ref }) → file_id`** service (dedup by
  `hash(text, voice)`) so no feature re-implements TTS→durable-file. `fc_detail.audio_file_id`,
  `fc_session.session_audio_file_id`, and `fc_attempt.response_audio_file_id` all just point at files.
The pairing is 1:1 (one text+voice → one file), so it needs no table; the text's home stays in its
domain entity (`fc_detail.text`), and the file records an immutable snapshot of what it narrated.

---

## 13. The Adaptive Engine (north star — design toward it, don't block on it)

The end state isn't flipping a static set. It's a system that **chooses the next card**: the learner
declares **topics** (`fc_goal`); the engine draws on **all past performance**
(`fc_attempt` provenance + recency + `fc_mastery` scheduling) and the **dimension graph**
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

### Resolved (schema)
- **Schema & names** — `education`, `fc_` prefix, singular, token = table name. Tokens to register:
  `fc_card`, `fc_set`, `fc_detail`, `fc_session`, `fc_attempt`, `fc_mastery`, `fc_goal` (§12).
- **Relationships** — `platform.associations` edges (FK to `entity_types`, no CHECK to widen);
  `role`/`position` canonical; `placement` → edge `metadata` (§12.5 / §12.5a).
- **Front/back audio** — `fc_detail` rows (`kind=spoken_front|spoken_back`), not card columns (§12.2).
- **`fc_mastery`** — persisted rollup, recomputable from `fc_attempt` (§12.3).
- **Narration** — file-level provenance + a `narrate()` service, not a table (§12.6).

### Open decisions (resolve at build time)
1. **Card source for Fast Fire v1** — real `fc_set`/batch id from the DB from the start (no hardcoded
   `historyFlashcards`).
2. **Audio slicing** — client-side `MediaRecorder` timeslice re-assembly with overlap vs
   upload-whole + server-side slice by timestamp (affects where overlap/markers apply).
3. **Grading lane default** — batch native-audio (Gemini) vs realtime (Grok); likely both.
4. **Session review agent** (§8) — v1 or fast-follow.
5. **Buzzer markers** — exact tones + the grader-prompt instruction for post-buzzer trailing words.
6. **Seed vocabularies** — confirm the `platform.categories` dimension values for `fc_card_kind`,
   `fc_detail_kind`, `fc_session_mode`, `fc_attempt_method`, and association `role`.

---

## 15. Change Log
- `2026-06-28` — **Restructured §12 into layers + fully detailed `fc_set`.** Added a top-down shape
  diagram and split the tables into **Layer A core content** (`fc_set` → `fc_card` → `fc_detail`),
  **Layer B study & performance** (`fc_session`/`fc_attempt`/`fc_mastery`, mode-agnostic), and **Layer C
  adaptive** (`fc_goal`). Detailed `fc_set` as a real table (the group; set-level source lineage via
  `fc_set → file`; M2M membership). Made explicit that the **"real-time audio" concept is NOT its own
  tables** — it's behavior + optional `file`-ref columns on Layer B — so Fast Fire and quiz-of-cards
  reuse one performance spine. Clarified session→attempt→mastery relationship and the reusability
  stance (key on card + `method`; promote to a neutral `study_session` only if a second domain needs it).
- `2026-06-28` — **Finalized the schema against `docs/official/db-rules.md`** (the updated base:
  `metadata` is now a base column, org → `iam.organizations`, child org-inheritance trigger, `role`
  + `position` canonical on `associations`, growing vocab → `platform.categories` registry not enum,
  lineage-is-an-edge, `*_type` FK to `entity_types`). Named every table `fc_*` (singular, token =
  name): `fc_card`, `fc_set`, `fc_detail`, `fc_session`, `fc_attempt` (ledger), `fc_mastery`,
  `fc_goal`. Resolved: `fc_asset` split → owned `fc_detail` (text+narration) + media as `fc_card→file`
  edges; front/back audio → `fc_detail` (`spoken_front`/`spoken_back`) since they're authored spoken
  versions with their own text; `placement` → edge `metadata` (not universal enough for a canonical
  column, with a documented promotion trigger); the text↔audio pairing extracted as a file-level
  narration primitive + `narrate()` service. Verified live: associations `*_type` are FK to
  `entity_types` (no CHECK to widen) and edge identity includes `role`.
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
