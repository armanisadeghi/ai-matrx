# Shortcut Display Rules — Spec

Five shortcut settings govern what the user is allowed to *see* of a conversation
(user-message side and assistant-response side). They are authored in
`agents/[id]/shortcuts/new` and must be respected in **every** result UI, for
**both** live streaming and DB reload — and ideally remembered when the
conversation is reopened later in a different UI.

## Terms

- **Definition** = any TURN baked into the agent's core template (system / user /
  assistant), with or without variables. Most commonly the first user message,
  sometimes a chain of user↔assistant turns. Variables may appear anywhere and be
  reused.
- **System prompt is NEVER shown.** (Not a setting — an absolute invariant.)

## The five rules

| Setting | Field | Meaning |
|---|---|---|
| **Show definition messages** | `showDefinitionMessages` | If **false**, the definition TURNS are *entirely* hidden. (Whole turn gone → "show content" is moot.) |
| **Show definition content** | `showDefinitionMessageContent` | Only meaningful when the turn IS shown. If **false**: show only what the user *physically entered* — their typed input + the values they put into the variable form. If **true**: also include the text we baked into the definition around those values. |
| **Hide reasoning** | `hideReasoning` | Suppress the assistant's intermediate reasoning blocks from the output. |
| **Hide tool results** | `hideToolResults` | Suppress not just tool *output* but everything revealing what the agent is doing with tools — collapse it all to generic status ("processing", "thinking", "executing", …). |
| **Allow chat** | `allowChat` | Whether the user sees a chat input after the first response. Off = single-turn action (e.g. a "Translate" button + language selector). |

## What must be verified (facts gathered below)

1. **Storage in state** — for new agents (agent **builder**) and existing agents
   (agent **run** + **chat**).
2. **Save to DB** — where/how each field persists.
3. **Respected in each of the 3 UIs** for: (1) live stream, (2) later from DB.
4. **Remembered across reopen** — when history is opened in a different UI next
   time (suspected: lost).

---

## FACTS (investigation)

### Storage

- **DB (authoritative author intent):** all 5 are columns on **`agx_shortcut`** —
  `show_definition_messages`, `show_definition_message_content`,
  `hide_reasoning`, `hide_tool_results`, `allow_chat`. Mapped by
  `agent-shortcuts/converters.ts` (`dbRowToAgentShortcut` ↔
  `agentShortcutToInsert/Update`). They are stored **on the shortcut, not on the
  conversation.**
- **Runtime state:** all 5 live on **`instanceUIState.byConversationId[cid]`**
  (`instance-ui-state.slice.ts`), an **in-memory, per-conversation** slice. Set
  once via `initInstanceUIState`. Defaults: `showDefinitionMessages: true`,
  `showDefinitionMessageContent: false`, `hideReasoning: false`,
  `hideToolResults: false`, `allowChat: true`.
- **Builder:** `AgentRunWrapper.tsx` hard-codes `showDefinitionMessages: true`
  (no per-builder authoring of these). Tester surfaces (`TesterSettingsPanel`,
  `AgentWidgetsPage`) expose them as local toggles.
- **Run / chat launch:** `createInstanceFromShortcut` (`create-instance.thunk.ts`)
  reads the shortcut and passes all 5 into `initInstanceUIState`. ✅ initial run
  honors author intent.

### Who actually enforces each rule (consumers)

| Rule | Selector | Consumer | Enforced? |
|---|---|---|---|
| `hideReasoning` | `selectHideReasoning` | `BlockRenderer.tsx` (self-gates reasoning blocks by `conversationId`) | ✅ |
| `hideToolResults` | `selectHideToolResults` | `BlockRenderer.tsx` + `ToolHandlers.tsx` | ✅ (suppresses output; see gap — not yet reduced to generic "processing" status) |
| `allowChat` | `selectAllowChat` | `AgentRunner.tsx` (gates chat input) | ✅ |
| `showDefinitionMessages` | `selectShowDefinitionMessages` | **NONE** — selector exists, zero component consumers | ❌ **not implemented** |
| `showDefinitionMessageContent` | `selectShowDefinitionMessageContent` | **NONE** | ❌ **not implemented** |

> Repo-wide grep: `selectShowDefinitionMessages` / `selectShowDefinitionMessageContent`
> appear only in their own definition + the phase-03.6 trace report. No transcript
> code reads them. (The trace report claims they "filter definition messages" — that
> is aspirational, not built.)

### Live (stream) vs DB reload

- `hideReasoning` / `hideToolResults` self-gate in `BlockRenderer` purely by
  `conversationId`, so they apply to **both** live and DB-rendered blocks —
  **as long as an `instanceUIState` entry exists for that conversation.**
- `allowChat` same — reads instance state, agnostic to live vs DB.
- Definition rules: irrelevant (no consumer either way).

### Persistence across reopen (the suspected gap — CONFIRMED)

- The shortcut id / its display flags are **not** persisted onto
  `cx_conversation`. 
- `loadConversation` only re-creates `instanceUIState` from
  `cx_conversation.metadata.display` (`load-conversation.thunk.ts:345-353`).
- **Nothing ever writes `metadata.display`** (repo-wide: only the *read* exists).
- ⇒ On reopen in a new UI, `initInstanceUIState` is not called with the flags →
  the conversation falls back to **defaults** (show everything, hide nothing,
  allow chat). **All 5 rules are LOST on reopen.** Author intent survives only
  for the live session that launched from the shortcut.

### Summary of gaps to fix (we'll go one by one)

1. **`showDefinitionMessages`** — not enforced anywhere (live or DB).
2. **`showDefinitionMessageContent`** — not enforced anywhere (live or DB).
3. **`hideToolResults`** — suppresses, but does not collapse to generic status
   ("processing/thinking/executing") per spec.
4. **Persistence** — none of the 5 survive reopening the conversation in another
   UI (need to persist intent, e.g. `cx_conversation.metadata.display`, and have
   `loadConversation` rehydrate it).
5. **Builder authoring** — builder hard-codes `showDefinitionMessages: true`;
   no place to author these for a bare agent (only shortcuts author them).
