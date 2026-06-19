# Artifact System — Vision & Design (living doc)

**Status:** active design doc. The single source of truth for *what the artifact system should be*. Owner: Arman (vision). Update as decisions land. The shipped-code reality lives in `features/artifacts/FEATURE.md`; this doc is the target + the agreements + the open questions.

> This is the most important feature in the app. The goal: an agent streams structured content, it becomes a **persistent, live, referenceable artifact**, and on later turns the agent can see and edit what it (and the user) created — without bloating context or corrupting the user's data.

---

## Terminology (draft — to refine)

- **Render block** — the raw structured content an agent emits in its response (`<artifact>`, `<flashcards>`, ` ```tasks `, a quiz JSON object, etc.). Ephemeral wire form.
- **Artifact** — the persisted, id'd record that a render block becomes. Has a stable UUID, a **kind**, a version, and (when applicable) a **link** to a real feature record. Accessible from many surfaces outside the chat.
- **Materialize** — recognize a render block → create the artifact record → rewrite the message so the block now carries the artifact's id.
- **Link** — the association from an artifact to a real app record (e.g. artifact `kind="task"` → `ctx_task` UUID). **Once linked, the DATABASE record is the ONLY source of truth.**
- **Two artifact classes** (load-bearing distinction — see below): **self-contained** (flashcards, html, diagrams) vs **data-touching** (tasks).

---

## Agreed principles (decisions)

1. **Linked artifact → the DB record is the sole source of truth.** Never render or trust the inline/markdown copy once an artifact is linked. Prevents stale/incorrect state and double sources.
2. **Recognize → add an id → rewrite history** is the chosen path (NOT "make the agent emit ids itself"). The system assigns the id and updates the agent's history so it reads as though the agent produced it with an id in place. (Avoids polluting the agent's job with UUID bookkeeping.)
3. **Never fully delete the block from history.** Replace it with a near-identical, id-bearing form (like how tool calls are kept but summarized). Fully removing it risks teaching the agent to emit garbage. **This is the #1 risk to validate.**
4. **The agent always sees exactly ONE, latest copy** of each artifact — even after many edits — via context, not via accumulated history.
5. **Two classes, different rules:**
   - **Self-contained (flashcards, html, diagrams, …):** the artifact IS the thing → **auto-save** to the user's library/profile on materialize. Safe; touches no existing user data.
   - **Data-touching (tasks):** **do NOT auto-create** the real record. Materialize as a *tracked/proposed* artifact only, with an explicit **"Convert to task"** action. Auto-creating user tasks from agent output is unwanted (annoying, error-prone, dangerous). ← **This corrects the current build.**
6. **Artifacts are context.** Each agent turn attaches the conversation's current artifacts as context items (live, latest state); the agent has a tool to query them and (future) edit them.

---

## Target architecture

### The rewrite (history)
When a render block is recognized, replace it in `cx_message.content` with the **canonical artifact form**: the same shape the agent emitted **plus an `id`** (XML → `id` attr; JSON → `id` field; fenced/other → wrapped as `<artifact type="…" id="…">`). Optionally the body is **kept (small artifacts) or shimmed to a short summary (large, e.g. code)** to save context. The original raw is archived (`content_history`).

- **UI reads it:** sees an artifact-with-id → does NOT render the inline body → renders the **live object** by id (a thin link to the real data).
- **Model reads it (next turn, via aidream reconstruction):** sees its own format + id (+ summary if shimmed) — natural, compact, not garbage-teaching.
- **Three consumers, possibly one stored format:** UI render, model context, data tracking. Open question whether storage == model-facing format or they're decoupled (see Open Questions).

### Source of truth + live state
- Self-contained artifact → its own row/table is the truth (e.g. flashcards set + reviews). Renderer reads/writes the live rows; interactions (study progress) round-trip by id.
- Data-touching artifact → tracked artifact until **converted**; after conversion, the artifact carries `kind` + the real record's UUID, and the renderer binds to the live record. Before conversion it's a proposal (a "draft" — possibly a flag, but kept minimal to avoid sprawl).

### Artifact data model (to formalize)
A generalized artifact: `{ id, kind, version, owner, conversation_id, source_message_id, link?: { system, id }, content/object }`. Versioned so edits don't lose history; `kind` + `link` let one artifact associate with many app features (task, html page, flashcard set, …). Today this is approximated by `canvas_items` (+ `external_system`/`external_id`) and the `cx_artifact` discovery index — see Open Questions on consolidation.

### Context + editing (aidream side — not built)
- Attach current artifacts as context each turn (live state).
- Agent tool: query artifacts; (future) edit an artifact by id → updates the live record → the agent's single latest copy reflects it.

---

## Current implementation vs target (the gap, honestly)

**Shipped + live-verified — Waves 0–4 (2026-06-19).** The six divergences below are closed (frontend committed on `main`; aidream committed, deploy-pending):

1. ✅ **Rewrite shape** — converged to the **R1 text form** `<artifact type id version title>body</artifact>` (`artifactWire.ts`). The foreign `artifact_ref` block is deleted; 19 live messages migrated. [Wave 1]
2. ✅ **Tasks no longer auto-create** — tracked proposal + explicit **Convert** via `ctx_task_associations` (`TasksArtifact.tsx`). [Wave 0]
3. ✅ **Per-item interactivity round-trips** — `canvas_item_state` via `useArtifactState` (recipe/presentation/comparison + progress/decision-tree/troubleshooting); flashcards/quiz via custom adapters. [Wave 2]
4. ✅ **Model is no longer blind** — the R1 text passes through to the model natively (no aidream reconstruction needed). [Wave 1]
5. ✅ **Artifact-as-context** — `conversation_artifacts` injected read-only each turn with latest copy + status + the user's interaction state (`aidream/api/utils/artifact_context.py`). [Wave 3] (The agent **edit tool** is Phase 2 / Wave 5 — below.)
6. ◑ **HTML publishing** — server-side idempotency shipped (`/api/html-pages` create updates-in-place by source message). [Wave 4] Remaining: the `canvas_items.external_system` link for html artifacts + mymatrx live-verify.

**Still standing (per the phasing):** Phase 2 — model-facing body summarization + `edit_artifact(id,…)` tool — **staged behind the garbage-teaching test** (R4/R5, Wave 5). Per-type renderer + discovery index (`cx_artifact` → `/artifacts`) predate this build.

---

## FINALIZED RULES (2026-06-19 — ratified with Arman)

**R1 — Canonical stored form (all types):** `<artifact type="X" id="UUID" [version="N"]>…original body verbatim…</artifact>`. JSON, code, and fenced blocks are wrapped as-is inside (the body is opaque to the wrapper; the type's renderer parses it). *Impl caveat:* the parser must match the correct closing tag (a body that literally contains `</artifact>` — e.g. code about artifacts — needs escaping or a length/fence-delimited body).

**R2 — Creation:** the model emits its natural format (id optional). The system recognizes it → assigns a fresh UUID → rewrites the message to R1. **The model is never required to manage ids.**

**R3 — The recognition rule (this is what makes everything safe):**
- `<artifact … id="KNOWN-in-this-conversation">body</artifact>` → **EDIT** = new version of that artifact.
- artifact with **no id / unknown id** → **NEW** artifact (assign fresh UUID; ignore any bogus id).
This single rule means it does NOT matter whether the model learns to emit the shape — every case is handled. It dissolves the Option 1/2 fear.

**R4 — Model-facing history (Option 1 vs 2, resolved by phasing):**
- **Phase 1 (no aidream work):** pass the canonical `<artifact id>body</artifact>` through to the model, **body kept**. The model may start mimicking the shape — fine, R3 handles it. No blindness; nothing to build server-side.
- **Phase 2 (context savings):** aidream replaces the body in the *model-facing* history with a compact, **tool-call-style summary** (`[artifact <kind> "<title>" id=<id> — current state in context]`) and attaches the conversation's live artifacts as context. This is the Option-1 "strip from history" move, done **only after the don't-teach-garbage test** and where it pays (big code bodies). Storage stays R1; model-facing is derived.

**R5 — Editing:** Phase 1 = inline re-emit with a known id (R3 → version). Phase 2 also adds an `edit_artifact(id, …)` tool (cleaner for precise/large edits). The model gets ids from context, never invents them.

**R6 — Live-state storage (the "track state on random things" requirement):**
- **Artifact content** (the html, diagram source, any authored body) → `canvas_items.content` + version chain = source of truth for types WITHOUT a domain table (most types + all user-created ones).
- **Domain-table types** (tasks→`ctx_tasks`, flashcards→`flashcard_*`) → that table is the truth, linked via `canvas_items.external_system`/`external_id`.
- **Per-viewer interaction state** (checked items, study progress, quiz answers) for no-domain-table types → `canvas_item_state(canvas_id, user_id, state)` (already built). **No new table needed.**

**R7 — Two classes:** self-contained (flashcards, html, diagram, …) → **auto-save** to library on materialize. Data-touching (tasks) → **tracked/proposed artifact only**, explicit **Convert** → links to the real record → thereafter the DB row is truth and the artifact is a **live two-way mirror** of it.

**R8 — Server context:** one query by `conversation_id` returns all artifacts → injected as context each turn (automatic, the system already supports context items). Agent edit-by-tool comes after the core.

### Smaller opens (decide during build)
- "Draft/proposed" = a real flag vs "unlinked artifact = proposal" (lean: minimal — unlinked = proposal, maybe a `status`).
- Convert UX: convert-one / convert-all / convert-on-interact.
- Exact model-facing summary wording + the garbage-teaching test protocol (Phase 2 gate).

---

## Recommended next steps (sequencing)

1. **Stop the harm:** make tasks NOT auto-create `ctx_tasks` (Decision 5). Tracked artifact + Convert action.
2. **Pick the canonical format (Q1–Q3)** + implement the rewrite as "agent's form + id," keeping the body initially (no shim) to de-risk.
3. **Bind one custom renderer to live domain rows** end-to-end as the proof (flashcards is closest), so interactions round-trip.
4. **aidream: reconstruct the artifact block + attach artifacts as context** (the model-side half) — coupled with #2.
5. **Idempotent, artifact-driven HTML publishing.**
6. **Run the garbage-teaching test** before enabling body-shimming.

---

## Best practices (as we build)

- One canonical artifact format; one renderer per type; one source of truth per linked artifact.
- Self-contained vs data-touching is the first question for any new artifact type.
- Idempotent everywhere (re-running materialize/publish never duplicates).
- The rewrite must never make the model *blind* — land the aidream reconstruction with any history rewrite.
- Loud on failure; never silently corrupt user data (esp. data-touching types).

---

## Change log
- `2026-06-19` (4) — claude: **HTML inline auto-preview (frontend).** Bare ` ```html ` fences that are COMPLETE documents now auto-convert to a live inline webpage once streaming finishes (`features/html-pages/components/HtmlInlinePreview.tsx`, wired in `BlockRenderer`): streaming/fragment → code block; complete → loader → published-page iframe (with "View code" + "Open in canvas"); on error → silent code block with opt-in detail. Conversion forwards `sourceMessageId` so the html-pages API dedupes (update-in-place per message); the API ALSO dedupes by identical `html_content` per user, so surfaces without a message id (notes/rich-document) never accumulate duplicate pages either. Single media embeds (one YouTube/Vimeo/etc. iframe, or a lone `<video>`) — even as fragments — auto-preview **seamlessly** (snug to the embed's aspect ratio, no card chrome); complete documents get the bounded card preview. **Hand-off / still open:** (a) this does NOT yet rewrite the message into the canonical `<artifact type="html" id>` R1 form — dedupe currently relies solely on html-pages server idempotency by `source_message_id`, which is per-message (multiple html blocks in one message would collapse to one page; needs the `(source_message_id, artifact_index)` natural key like `canvas_items`); (b) no `cx_artifact` / `canvas_items.external_system` link is registered from the inline path (the `HtmlPreviewBridge` editor path does this — inline should converge on the same materialization). Owner of the materialization/rewrite integration: artifact-system dev.
- `2026-06-19` (3) — claude: **SHIPPED Waves 0–4** (frontend on `main`: `7a552f8d0` tasks-Convert, `066ae2a5a` R1 rewrite+R3+migrated 19, `e8f3278ca` interaction round-trip, `30ef1bd83` idempotent HTML; aidream `d316f10bc` R8 artifacts-as-context, deploy-pending). All six divergences closed (see status section). Live-verified frontend; aidream helper live-DB-verified. Phase 2 (summarization + `edit_artifact` tool) staged behind the garbage-teaching test.
- `2026-06-19` (2) — claude: **ratified R1–R8.** Canonical `<artifact type id>body</artifact>` for all types; recognition rule (known id→edit, else→new) makes model-emitted shapes safe; Option 1/2 resolved by phasing (Phase 1 pass-through body, Phase 2 summarize+context, gated on the garbage test); live state via canvas_items.content + canvas_item_state + domain tables (no new table); tasks = tracked+Convert→live-mirror.
- `2026-06-19` — claude: created from the design conversation with Arman. Captures the history-rewrite vision (recognize→add-id→rewrite), the two-class rule (tasks must NOT auto-create — corrects current build), artifacts-as-context, source-of-truth-is-DB, and the open questions (canonical format, shim policy, artifact table).
