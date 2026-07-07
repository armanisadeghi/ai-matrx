# P2 — AI Tutor

> **Status date:** 2026-07-07 · **Wave 1, priority tier 1** · One agent, human in the loop.
> Read [`README.md`](./README.md) and the vision doc §4 (AI Tutor) — this project IS the
> platform's #1 stated differentiator: "a personal tutor, not a chatbot."

## Objective

Build the persistent, memory-carrying, RAG-grounded tutor that is present at every study surface:
a conversation home at `/education/tutor`, cross-session memory of everything the student has
studied, Socratic mode, first-class voice, source citations from the student's own materials, and
a shared inline "I'm confused" entry point reachable from any card or study surface with full
context already loaded.

## Current state (verified — build on this)

- **Routes are stubs:** `app/(core)/education/tutor/page.tsx` + `[conversationId]/page.tsx` both
  render `EduToolComingSoon`.
- **The tutor brain already exists in embryo, inside flashcards:**
  `features/flashcards/data/tutor/` — `helpLive` (agent `fc_help_live`, UUID `9035ed6e-…`, the
  in-context "help me with this card" call), `reviewBatch` (`fc_review_batch`, `780fb7ab-…`, the
  batch "professor" reviewer), `microCoach.ts` + `config.ts` (a fully-wired no-op: agent id is
  `null`; setting a real id lights it up through `StudyDeck.tsx:316`). **Generalize this into
  `features/education/tutor/` — do not fork it.**
- **Voice is a solved primitive:** `gradeSpokenAnswer` / grading-core (2026-07 commits), the
  drop-anywhere `VoiceTestButton`, `SingleCardVoiceTest`, and the FastFire streaming-capture
  machinery. See `docs/.../VOICE_INTERACTIONS` map (commit `62a318405`). Reuse; never rebuild
  audio capture.
- **Memory raw material is populated:** `study_session` (147) / `study_attempt` (190) /
  `item_mastery` (110, FSRS state) / `study_goal` — who studied what, when, how well, and their
  goals/exam dates. The flashcards `learnerContext` assembly is the starting point.
- **RAG is live** (`features/rag`, vector store, `CreateFromSource` lineage pattern shows the
  source-grounding flow). Conversations belong on the canonical chat infra (`cx_conversation` /
  `chat` schema + the agents chat pipeline) — do NOT invent a tutor-specific conversation store.

## Scope

**IN**
- The tutor conversation surface: `/education/tutor` (list of conversations + start-new) and
  `[conversationId]` (the live conversation), built on the agent-execution pipeline + canonical
  chat/conversation storage, education-skinned.
- **RAG grounding with citations:** answers grounded in the student's own decks/notes/uploads,
  citing which card/note/source each claim came from.
- **Cross-session memory:** the tutor's context assembly reads the study spine (recent sessions,
  weak areas, mastery trends, upcoming `study_goal` exam dates) + conversation history. Persisted,
  not per-session. Define the `learnerContext` assembly as a named, reusable module.
- **Socratic mode** (guiding questions, not answers) and **tunable personality/teaching style** —
  a per-user tutor settings surface (use the settings system, `features/settings`).
- **Voice Q&A** as a first-class input/output mode in the conversation.
- **The shared `AskTutor` entry primitive:** an "I'm confused" affordance any surface can mount
  (flashcard study, quiz results, notes) that opens the tutor pre-loaded with local context
  (current card/item/set). Ship it consumed by at least the flashcards study surface.
- **Author the missing agents:** `microCoach` (spec already written —
  `features/education/docs/AGENT_SPECS.md` §11; setting its id in `data/agents.ts` activates the
  existing wiring) plus the main tutor agent(s). Register via agent_author; document in
  `LIVE_AGENTS.md`.

**OUT**
- Grading engines (reuse grading-core / FastFire's). The study data itself (spine-owned).
  Homework-help file ingestion breadth (reuse `fileHandler` for what exists; ingestion breadth is
  a Wave-2 fan-out). Real-time co-study / multi-student rooms (Wave-2 social). Sharing/billing
  internals (consume P7/P8 contracts).

## Deliverables / Definition of done

1. A persistent tutor conversation grounded in the user's own decks/notes, with visible source
   citations.
2. Cross-session memory demonstrably recalled ("last week you struggled with X") from real spine
   data.
3. Socratic mode + personality tuning both function and persist as settings.
4. A full voice round-trip: spoken question → grounded spoken/text answer.
5. `AskTutor` launched from a flashcard mid-study opens with that card's context — no
   re-explaining.
6. `microCoach` authored and live (id set; the no-op wiring lights up in `StudyDeck`).
7. Tool flipped `live` in `tools.ts`; admin map updated; `features/education/tutor` FEATURE
   section written.

## Surfaces touched

- `app/(core)/education/tutor/**` (replace stubs)
- New `features/education/tutor/**` — generalized from `features/flashcards/data/tutor/`
  (flashcards then imports the generalized module; leave no duplicate)
- `features/flashcards/data/agents.ts` (microCoach id), `StudyDeck.tsx` (AskTutor mount)
- `features/rag` (consume), canonical chat/conversation infra (consume)
- New authored agents; `AGENT_SPECS.md` / `LIVE_AGENTS.md`

## Dependencies & contracts

- Agent pipeline ✅, RAG ✅, study spine ✅, voice primitives ✅, chat infra ✅.
- **Consumes:** P7 `useAccess` (shared conversations later; wire the signature), P8
  `useEntitlement` (tutor messages are a metered capability — wrap the send path day 1).
- **Coordination flag:** `microCoach` is listed among the flashcards agent's in-flight items but
  is tutor-domain; this brief claims it. Confirm with Arman/the flashcards agent at kickoff.

## Build guidance

- Generalize, don't fork: move `features/flashcards/data/tutor/` logic to
  `features/education/tutor/` and re-point flashcards imports in the same change (no shims — see
  the no-legacy-code rule).
- Conversation storage: reuse `cx_conversation`/chat-schema reads the way `/chat` does
  (`features/agents/components/chat/FEATURE.md`); education tutor conversations are tagged/scoped,
  not a new table.
- Overlay/panel work (AskTutor as a side panel): invoke the `overlay-system` skill first.
- `type-safety` for all DB/RPC code; `finalize-and-ship` at the end.

## Verification

Real conversations against real data (no mocked streams — the no-fake-verification rule): seed a
deck, study it, then ask the tutor about it and confirm citations point at the studied cards;
verify memory recall in a second session; run a live voice round-trip; launch AskTutor from a
card. Hand Arman the exact routes + a script of what to try.
