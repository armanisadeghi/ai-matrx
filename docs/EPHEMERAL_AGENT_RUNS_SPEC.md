# Ephemeral Agent Runs — Requirements Spec

> **Status: the ephemeral path is half-built on BOTH client and server and must be reimagined from
> the ground up.** This document specifies *what* a correct ephemeral agent run must guarantee, on the
> client and the server. It is a requirements contract, not an implementation guide. Owner will
> implement with a capable model; the point here is an unambiguous definition of done.

## What an "ephemeral agent run" is

A **one-shot, stateless agent invocation**: send inputs (variables and/or media parts), stream the
result, read a structured output, and **persist nothing about the conversation itself**. The run is
fire-and-forget from the conversation system's point of view. Any durable artifact it produces (e.g. a
flashcard grade) is written by its *own* domain path (here: `study_attempt`), **not** by persisting the
conversation.

Primary consumer today: Fast Fire grading/tutor/review (`features/flashcards/fast-fire/agents/*`), which
runs up to ~20+ concurrent one-shot audio-graded runs per drill. Also: `executeBuiltinWithJsonExtraction`
(programmatic extraction). Both want stateless runs.

## Why it's broken today (the exact root cause — so it isn't rediscovered)

There is a **direct contradiction** between the client's identity invariant and the server's gate:

- **Server gate** (`aidream` `resolve_conversation`, `conversation_gate.py`) behavior matrix:
  - `no conversation_id` + `is_new=false` → **stateless ephemeral** (server *generates its own id*,
    `skip_persistence=true`). ← the only no-persist path.
  - `conversation_id` + `is_new=true` → strict INSERT → **persists** a `cx_conversation` row.
  - `conversation_id` + `is_new=false` → strict SELECT → **404 `conversation_not_found`** if it was
    never created. ← what the client currently sends for ephemeral, so every run 404s.
- **Client invariant** (`features/agents/.../utils/assert-conversation-id.ts`): the client generates the
  conversation id up front and **requires the server to honor it** — any divergence (X-Conversation-ID
  header, `conversation_id` data event, `record_reserved`) **throws in dev**.

So: the server's only no-persist path requires *it* to mint the id, but the client forbids the id from
differing from the one it generated. The two cannot both hold. The client's ephemeral turn-1 currently
sends `conversation_id + is_new:false`, lands in the 404 branch, and grading never runs.

**Current state for Fast Fire (owner-confirmed 2026-06-30):** Fast Fire runs are `isEphemeral:false` and
**intentionally persist** — a durable record of each grade/help/review run is desirable (audit, re-grade,
debugging). They are kept out of the user's normal chats by distinct system `source_feature`s
(`fastfire-grade`/`fastfire-help`/`fastfire-review`, registered in
`features/agents/redux/conversation-history/source-registry.ts`). So for Fast Fire this is the chosen
design, not a stopgap. This spec remains the requirement for a TRUE stateless ephemeral run, which other
consumers (e.g. `executeBuiltinWithJsonExtraction`) still need and which the platform should support
properly; reverting Fast Fire to ephemeral once it exists is then optional, not required.

## Requirements — the contract

### R1. One coherent ephemeral concept, end to end
A single, first-class "ephemeral run" mode understood identically by client and server — not an
ad-hoc combination of `is_new`/`store` flags that each side interprets differently. When a caller marks a
run ephemeral, every layer (request assembly, the gate, streaming, persistence, the client conversation
list/history/instance lifecycle) treats it as ephemeral with no special-casing at call sites.

### R2. Stateless on the server — zero conversation persistence
An ephemeral run MUST NOT create or update any `cx_*` row for the conversation: no `cx_conversation`,
no `cx_request`/`cx_user_request`, no `cx_message`, no reservations. Cost/usage accounting that must
still happen is the implementer's call, but the conversation itself leaves no trace.

### R3. Client-generated id is honored (no drift, no contradiction)
The client generates the run id and the server MUST use that exact id everywhere it echoes one back
(stream headers, data events). The identity invariant in R-client below must hold *without* persisting a
row. (i.e. resolve the contradiction in favor of "honor the client id for an in-memory-only run" — the
server creates the run context in memory keyed by the client id, streams, and discards it.)

### R4. Full input + output capability
Ephemeral runs MUST support everything a normal run does at the input/output layer:
- **Inputs:** `variables`, and **media parts** (audio/image/file) attached to the user message — Fast
  Fire sends an `audio/wav` clip per card. (Verified working: the WAV reaches the server today; only the
  conversation gate rejects it.)
- **Outputs:** streamed tokens, **structured/JSON output read by `requestId`**, and **Matrx-action
  auto-persist of downstream artifacts** (the grade → `study_attempt`) — which must succeed even though
  the conversation is not persisted.

### R5. Concurrency
Many ephemeral runs MUST be safe in flight simultaneously (a 20-card drill grades ~20 at once, plus
help/review). No shared mutable conversation state may collide; each run is independent and keyed by its
own client id + `requestId`.

### R6. Client lifecycle — invisible and self-cleaning
On the client an ephemeral run MUST:
- never be written into any conversation list cache or history scope (the `conversationList` slice, the
  per-agent `get_agent_conversations` caches, the `/chat` sidebar, the history window);
- never appear to the user as a chat anywhere;
- be tracked only by its local instance + `requestId` while live, and be destroyed on completion/error;
- survive the identity-drift guard (R3): a server-honored client id is the contract, not a violation.

### R7. Errors are loud and contained
A failed ephemeral run surfaces a real, structured error (not a silent drop) to its caller, and still
leaves no persisted conversation residue. The downstream artifact path records the failure in its own
store if it needs to (Fast Fire records a result-less `study_attempt`).

### R8. Backward compatibility
Normal (persistent) conversations are unaffected. The change is additive: persistent turn-1 keeps
creating its `cx_conversation` exactly as today; only the ephemeral path changes.

## Acceptance criteria (definition of done)

1. A Fast Fire drill grades every card with **zero `conversation_not_found` 404s** and **zero new
   `cx_conversation` rows** for the grade/help/review runs (verify with a live row count before/after).
2. The grade still lands: a `study_attempt` row per card with the structured score (Matrx-action
   auto-persist works under an ephemeral run).
3. Per-card `audio/wav` clips are delivered and graded (media input works ephemerally).
4. ~20 concurrent grades in one drill all resolve correctly, keyed by stable card id, out of order.
5. Nothing from these runs appears in `/chat`, the history window, or any conversation list.
6. The dev-mode conversation-id drift guard does **not** fire for ephemeral runs.
7. `executeBuiltinWithJsonExtraction` (the other ephemeral consumer) works under the same path.
8. Once shipped, Fast Fire's interim `isEphemeral:false` + system `source_feature` workaround is
   reverted to `isEphemeral:true` and the throwaway-conversation behavior is gone.

## Touch points (where the contract lives — for orientation, not prescription)

- **Client:** `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts` (turn-1 routing,
  `is_new`/`store`), `run-ai-stream.ts` + `process-stream.ts` (id reconciliation, `record_reserved`
  → list upsert), `utils/assert-conversation-id.ts` (the drift invariant), the launch thunk's
  `isEphemeral` flag, the `conversationList` slice.
- **Server (aidream):** `aidream/api/utils/conversation_gate_utils.py` (`resolve_conversation`),
  `packages/matrx-ai/matrx_ai/db/conversation_gate.py`, and the agent route handler that calls them.

## Change log
- 2026-06-30 — Created. Root cause documented (client id-honor invariant vs server gate's no-id-only
  stateless path); requirements + acceptance criteria defined; interim non-ephemeral + system-source
  workaround recorded.
</content>
