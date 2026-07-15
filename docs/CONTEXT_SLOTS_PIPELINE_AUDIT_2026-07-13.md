# Context Slots (a.k.a. "Contact Slots") Pipeline Audit — 2026-07-13

Investigation triggered by: agent created with a batch of context slots, but the slots (a) don't appear in
chat/run UI and (b) appear ignored server-side. This doc separates **confirmed facts** (read directly from
code) from **assessment** (inference/recommendation), so decisions can be made without re-deriving the
research.

## STATUS (updated same day, after fixes — all four execution routes now fixed)

The real root cause turned out to be **three separate bugs stacked on top of each other**, plus the same
wiring gap repeated across every context-carrying execution route in aidream. All now fixed:

1. **FIXED (aidream, all 4 routes)** — `chat_run.py`, and all three functions in `continue_conversation.py`
   (`prepare_continue_conversation` — turn 2+ of every chat, `prepare_fork_and_run` — "regenerate from
   here"/fork, `prepare_resume_conversation` — resuming after a client-delegated tool suspend) never loaded
   the agent's own declared `context_slots` at all, so `ContextManifest.build()` never even knew a slot
   existed, regardless of value. Only `agent_run.py` (the dedicated agent "run" endpoint) did this. This is
   the actual "server completely ignores them" observed on `/chat`, **and** the "agents instantly lose all
   context" on fork/resume — the `prepare_resume_conversation` docstring itself already documented this
   exact symptom for tool-call resume specifically ("ctx_get answered 'No context objects are available'"),
   confirming it as a known, previously-undiagnosed instance of the same class of bug. See §2.1.
2. **FIXED (aidream)** — even on the one route that did resolve slots, an unresolved slot
   (`on_missing="empty"`) was dropped entirely instead of surfaced as null, so a slot with no active-scope
   value never reached the model and never granted its edit tool. See §1 update.
3. **FIXED (frontend)** — `ConversationContextRail.tsx` never nudged the user to set a scope; it only
   checked "is *any* org/scope/project/task active," so an unrelated active org silently masked the need.
   Now checks per-scope-type coverage against the agent's own declared slots and shows a working "set
   scope" control (with an amber ring for visual urgency, independent of whatever else is active) when
   needed. See §3 update.

**Not changed, deliberately deprioritized:** the `resolve_full_context` RPC's null-drop behavior (§1,
originally flagged as "Decision needed #1", the riskiest/broadest option). Once fix #2 above is in place,
the Python resolver already treats "no cell" as "missing" and handles it via the slot's own `on_missing`
policy — so the RPC-level null-drop no longer blocks context-slot visibility. It's left alone because
changing it would touch every consumer of a heavily shared migration for no remaining benefit here.

**Not yet done:** `prepare_fork_and_run` and `prepare_resume_conversation` (also in
`continue_conversation.py`) have the same gap as fix #1 but are lower-traffic (fork / error-resume paths)
— not fixed in this pass, flagged in §6.

Terminology used consistently below: **"context slot"** = what the user calls "contact slot" = a
`ContextSlot` an agent declares it needs (`features/agents/types/agent-api-types.ts:300-382`). Not to be
confused with a **scope** (the user-authored Client/Department/Case dimension) or a **context item** (a
column within a scope). A context slot is how an agent *pins itself* to a scope's context item.

---

## 1. The data model (confirmed)

- `ContextSlot` (`features/agents/types/agent-api-types.ts:300-382`):
  ```ts
  interface ContextSlot {
    key: string;
    type: ContextObjectType;
    label?: string;
    description?: string;
    mutable?: boolean;          // model may rewrite via ctx_patch; default false
    persist?: "auto" | "never" | "client"; // meaningful only when mutable=true
    source?: { kind: string; scope_type_id?: string; item_key?: string; on_missing?: string };
  }
  ```
  Stored as JSONB on the agent (`agx_agent.context_slots` / `AgentDefinition.contextSlots`, line 228).
  Explicit comment: **"Clients do NOT send slots... slot defined, no content sent → silently skipped
  (not an error)."** This is a deliberate design: the client is not the source of slot content, the server is.

- Resolution RPC: **`resolve_full_context(p_user_id, p_entity_type, p_entity_id, p_scope_ids)`**
  (`migrations/ctx_resolve_full_context_restore_cells_after_schema_move.sql`). Returns:
  `{ scope_labels, variables, sources, cell_values, context, resolved_at }`.
  - `cell_values` keyed by `context_item_id` (collision-proof) — this is what slot-binding resolution
    should use.
  - **CONFIRMED: null/unset values are dropped, not returned as placeholders** —
    `CONTINUE WHEN rec.value IS NULL;` appears in every version of this RPC. An item with no cell value
    for the active scope is simply *absent* from the result.
  - **CONFIRMED: no `editable` flag is returned by this RPC.** Editability lives entirely on the agent's
    own declared `ContextSlot.mutable` / `.persist`, never on the resolved value.

This matches the user's stated requirement almost entirely, with one explicit gap: **the requirement "the
agent needs to see the slot and its value, even when null" is not satisfied by the current RPC contract** —
today, a slot with no value doesn't show up as "present but empty," it just doesn't show up.

**RESOLVED — at the resolver layer, not the RPC.** `aidream/services/conversation_context/
scope_binding_resolution.py::_apply_missing_slot()` previously discarded a slot entirely when its bound
cell had no value (`on_missing="empty"` did nothing — comment said "don't synthesize an empty entry").
Since `ContextManifest.build()` (`aidream/services/conversation_context/context_objects.py:497`) only
creates a `ContextObject` for keys present in the dict it's handed, an omitted key meant the agent never
saw the slot **at all** — not as null, and critically, never with its `context_patch` edit tool either
(that tool is gated by `mutable` on the constructed object, which never got constructed). Fixed by setting
`result.context[slot_key] = None` for the `"empty"` outcome — `ContextManifest.build` then constructs the
object with the slot's own `mutable`/`persist`/`source` defaults, so a null-valued mutable slot still shows
up (rendered as the literal string `"null"` via `content_as_str()`) and still gets its edit tool. `"skip"`
is left alone (still omitted — that's its intended semantic). Given this, the RPC's own null-drop no longer
needs to change: a genuinely-cleared cell and a never-set cell both correctly resolve to "missing" at the
resolver, which now handles "missing" correctly.

---

## 2. Server-side resolution (confirmed — contradicts the "server is lazy" hypothesis)

Traced in `aidream`:

- `build_agent_context()` (`packages/matrx-ai/matrx_ai/context_engine.py:150`) wraps
  `resolve_full_context` via the Matrx ORM and is called through
  `resolve_agent_context_block()` (`aidream/services/conversation_context/context_utils.py:266`) from
  **six call sites**: `chat_run.py:302`, `agent_run.py:405,679`, `continue_conversation.py:293,486,765`,
  `prompts/execution.py:144`.
- `resolve_scope_bindings()` (`aidream/services/conversation_context/scope_binding_resolution.py:340`)
  reads the **agent's own declared** `context_slots`/`variable_defaults` and resolves each against the
  active scope's resolved cells — independent of what the client sent — handling
  `on_missing = "empty"|"skip"|"error"` explicitly. Called from `agent_run.py:298,701`.
- Precedence is server-first: scope-bound value < explicit non-empty client-sent value
  (`agent_run.py:306-319`) — i.e. the client can *override*, but resolution always happens server-side
  first, and only overrides for values it explicitly sends.
- An edit-tool mechanism **does exist**: `context_patch`
  (`packages/matrx-ai/matrx_ai/tools/implementations/ctx_write.py:74`), gated by `obj.mutable`, plus
  `context_writeback.py` which persists edits back to the scope cell when `mutable=true` and
  `persist="auto"`. It is generic (works on any `ContextManifest`), not a bespoke per-slot tool — there is
  no separate `update_context_item`/`set_scope_value` tool.

**Original assessment (superseded — see §2.1 below):** on `main`, the server-side machinery for "resolve my
own declared slots independent of client payload" looked correctly designed *in isolation*. What that
assessment missed: **it's only wired into one of the four execution entry points.**

### 2.1 FOUND + FIXED — `resolve_scope_bindings` was never called from the actual chat routes

`grep -rln "resolve_scope_bindings"` across all of `aidream` turned up exactly **one caller**:
`agent_run.py` (2 call sites — first-turn and continue-turn). It was **never called** from:

- `aidream/services/ai_execution/chat_run.py` (`prepare_chat_run` — the `/ai/chat` first-turn handler)
- `aidream/services/conversation_context/continue_conversation.py` — all three of `prepare_continue_conversation`
  (turn 2+ of every ongoing chat), `prepare_fork_and_run`, `prepare_resume_conversation`

Worse, `chat_run.py` and `prepare_continue_conversation` never even **loaded** the agent's own declared
`context_slots` — `chat_run.py`'s `config` comes straight from the raw request body
(`build_unified_config`), never from a loaded agent record, and grepping the file for `agent_config` turns
up zero matches. Their calls to `apply_context_objects(...)` omitted the `agent_slots_raw` positional
argument entirely (defaults to `None`), while `agent_run.py`'s calls pass `agent_config.context_slots`
explicitly. Since `ContextManifest.build()` only knows about a slot if it's in `agent_slots`, **a saved
agent's declared context slots were 100% invisible to the model on every route except the dedicated "run"
endpoint** — this is the literal, complete explanation for "the server completely ignores them" when
testing through the normal `/chat` surface, independent of whether any value was ever set.

**Fixed** (mirroring the exact continue-turn pattern already used inside `agent_run.py`, best-effort via
try/except so a resolve failure never blocks the turn):

- `chat_run.py::prepare_chat_run` — when `request.agent_id` is set, loads the agent via
  `agx.load_for_execution`, calls `resolve_scope_bindings(..., resolve_variables=False)` (variables are
  already resolved separately on this route), merges `scope_bound.context` under the client's explicit
  `request.context`, and passes `agent_slots_raw` through to `apply_context_objects`.
- `continue_conversation.py::prepare_continue_conversation` — same pattern, using
  `ctx.agent_version_id or ctx.agent_id` (already restored via `stamp_agent_attribution_from_conversation`
  earlier in the same function) since this route deliberately avoids a full agent reload on the hot path.

Both changes are additive and gated (`if request.agent_id: try: ... except: log + continue`), so an agent
with no declared slots, or any resolve failure, costs nothing and never breaks the turn.

**Also fixed (same pass, follow-up round):** `prepare_fork_and_run` and `prepare_resume_conversation` in the
same file had the identical gap. `prepare_resume_conversation`'s own docstring already documented the
symptom in the wild — "the suspended run's context objects lived only in its request scope... every
resumed loop ran context-blind" — which is exactly the "agents instantly lose all context" behavior
reported after fork/resume. Both now resolve scope bindings the same way as the other two routes, gated on
`ctx.agent_version_id or ctx.agent_id` being available (already restored via
`stamp_agent_attribution_from_conversation` before this point in both functions).

---

## 3. UI rendering (confirmed — this is where the regression is real and locatable)

Two independent UI surfaces exist, and they've diverged:

- **`ContextSlotChipStrip`** (`features/agents/components/context-slots-display/ContextSlotChipStrip.tsx`)
  — the grouped/stacked chip display the user remembers. Wired into **historical message bubbles only**
  (`AgentUserMessage.tsx:613-619`), reading `record.modelContext.items` (from DB `model_context` column,
  `conversation-bundle.ts:341`) or `metadata.context_snapshot` (frozen at submit,
  `execute-instance.thunk.ts:455-464`). **By design, if neither source has data, it renders nothing — a
  silent, not loud, failure** (explicit comment: "Neither source → show nothing (honest)"). It was never
  wired into the pre-send composer, even historically, per its own FEATURE.md invariant.

- **`ConversationContextRail`**
  (`features/agents/components/inputs/smart-input/ConversationContextRail.tsx`) — the *current* live
  composer rail, wired into both composer layouts (`SmartAgentInputStacked.tsx:109`,
  `SmartAgentInputSingleRow.tsx:76`), which sit under both `/chat` and the agent `/run` page. This is
  the intended successor described in its own header comment: "the ONE rail — adding a future source is
  a single push into `items`, never a new bespoke strip."

**The concrete bug (FIXED):** `ConversationContextRail.tsx` only pushed a "Scopes" pill when
`layers.count > 0` (from `useActiveContextLayerItems.ts:118`) — i.e. *any* org/scope/project/task was
active. **When no scope is active yet, or when an unrelated scope is active (e.g. a law-firm org is
selected but the agent needs a "Goal" scope type), the rail had no empty-state branch — no pill, no "set
your scope" CTA — it just omitted that row entirely.** This is exactly the behavior the user described
("does not show me these contact slots… should prompt me to set scope").

Fixed by comparing the agent's own declared `context_slots` (`source.scope_type_id` for every
`source.kind === "ctx_item"` entry) against `selectActiveScopeIdsByType` (per-scope-type active coverage,
not just "is anything active") — `ConversationContextRail.tsx` now shows a `needsScope` nudge whenever at
least one declared slot's required scope type has zero active scopes, regardless of what else is active.
The nudge reuses the existing canonical `ActiveContextButton` (Surface A's own sanctioned scope-setting
control, `features/scopes/components/active-context/ActiveContextButton.tsx`) rather than inventing new
UI or writing to `appContextSlice` directly — clicking it opens the same scope picker used everywhere else.
**Verified live**: temporarily added a scope-bound slot to a real agent record, confirmed the control
renders and opens the correct scope picker, then reverted the test data.

**Also fixed (visual polish):** `ActiveContextButton`'s built-in `warnWhenEmpty` amber-ring treatment
triggers off its own global `hasContext` (any org/project/task/scope at all), so it stayed un-amber when an
unrelated context was already active even though the control was functionally correct. Rather than change
the shared component's public behavior (used elsewhere with its own correct semantics), the rail now wraps
its own instance in a locally-scoped amber ring whenever `needsScope` is true — always visually distinct in
exactly the case that matters here, verified live with the same temporary test agent.

**Timeline (git-confirmed):**
- `2026-07-07` (`8ebc014b8`/`3ecaeb6a0`) — a confirmed prior regression: "new components copied stale
  one-per-type doc text," breaking multi-scope active-context selection. Fixed same day.
- `2026-07-10` (`fa916e480`/`fe70a43c5`/`f0a917fb3`) — "Massive context item update" — reworked
  `ConversationContextRail` and its context-item registry substantially. This is the most likely point
  where the empty-state branch for "no scope set" was never carried over from whatever the rail replaced
  — the diffs read as refactors (shared `ContextValueRow`), not a deliberate deletion.
- `2026-07-12` (`66ccb3eca`) — **the same bug class recurred** in a parallel selection family
  (`useHierarchySelection.ts` / Hierarchy* components), fixed the same day, deleting ~2000 lines of dead
  fallback code.
- `2026-07-13` — pure scope-editor polish commits, unrelated to this path.

So: "used to work a bit, then stopped a few days ago" lines up almost exactly with the 07-10 rail rework.

---

## 4. Decisions from the original audit — resolved

1. ~~Null-value contract in `resolve_full_context`~~ — **resolved at the resolver layer (§1), RPC left
   unchanged.** No sign-off needed for a shared-migration change since none was made.
2. ~~Editability signal~~ — **resolved as recommended**: the server-side merge approach (agent's own
   `mutable`/`persist` flowing through once the slot is actually constructed) was the fix — no new DB
   field.
3. ~~UI empty-state~~ — **shipped** (§3).
4. **Stacking behavior** — confirmed correct as-is: `ConversationContextRail` already renders scope as one
   "Scopes" pill regardless of how many scopes are active; nothing further needed here.
5. ~~Live trace before touching server code~~ — superseded: static tracing (grepping every caller of
   `resolve_scope_bindings`) found the actual bug (§2.1) without needing a live network trace.

## 5. What shipped (2026-07-13)

- `matrx-frontend`: [ConversationContextRail.tsx](../features/agents/components/inputs/smart-input/ConversationContextRail.tsx)
  — per-scope-type "set your scope" nudge (amber-ringed for visibility), reusing `ActiveContextButton`.
- `aidream`: [scope_binding_resolution.py](../../aidream/aidream/services/conversation_context/scope_binding_resolution.py)
  `_apply_missing_slot` — surfaces a missing slot as null instead of omitting it.
- `aidream`: [chat_run.py](../../aidream/aidream/services/ai_execution/chat_run.py) — loads and resolves
  the agent's declared context slots on the `/ai/chat` first-turn route.
- `aidream`: [continue_conversation.py](../../aidream/aidream/services/conversation_context/continue_conversation.py)
  — same fix applied to all three functions: `prepare_continue_conversation` (turn 2+), `prepare_fork_and_run`
  (fork/regenerate), `prepare_resume_conversation` (resume after tool-call suspend).

Every aidream execution route that can carry a conversation forward now independently resolves the agent's
own declared context slots — `agent_run.py` already did; `chat_run.py` and all three
`continue_conversation.py` functions were the gap, and all are now closed.

All changes are syntax/type-checked (`py_compile`, `tsc --noEmit`). The frontend nudge (including the amber
ring) was verified live in the browser against a real agent record (temporary test data added, confirmed
rendering + click-through to the scope picker, then reverted). The aidream changes could **not** be
live-verified end-to-end in this session (no way to trigger a real aidream chat turn from here) —
recommend one real live-chat turn with the "my test" agent (`70399b83-a8a6-460c-a01a-12f3ef0b3903`) after
aidream deploys, confirming the model's `<available_context>` block lists its declared slots, and one
fork + one resume test to confirm the class of "agents instantly lose all context" is actually gone.
