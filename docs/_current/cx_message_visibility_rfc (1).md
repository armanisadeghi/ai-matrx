# RFC: cx_message Visibility Architecture

**Status:** Proposed — awaiting team feedback  
**Scope:** Database migration, Python write-path changes, React read-path changes, new RPC functions

---

## Problem

When a user opens a stored agent conversation, they see everything the model saw — including the agent's secret template wrapping, system prompt structure, and injected context. We need clean separation between what the **user** sees and what the **model** sees, both today (agent secrets) and for the upcoming condensation feature.

---

## What Changes in the Database

### New columns on `cx_message`

| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `source` | `text` | `'user'` | NOT NULL | Who produced this message |
| `agent_id` | `uuid` | — | YES (FK → agents, ON DELETE SET NULL) | Which agent, if any |
| `is_visible_to_user` | `boolean` | `true` | NOT NULL | Should the client render this? |
| `is_visible_to_model` | `boolean` | `true` | NOT NULL | Should the backend include this when building the API request? |
| `user_content` | `jsonb` | — | YES | Display-only content override (same structure as `content`) |

**`source` values:**

| Value | Meaning |
|-------|---------|
| `user` | Real user input (typed message, follow-up turn) |
| `agent_template` | Resolved agent template message (contains secret wrapping) |
| `system` | System injection (condensation summary, context injection, etc.) |

**`user_content` explained:**

For `source = 'agent_template'` messages, `content` holds the full resolved template (what the model needs). `user_content` holds only what the user provided — their variable values, user_input text, and attachments — in the same `[{type, text, ...}]` format. The client renders `user_content` when present, falls back to `content` when null.

For `source = 'user'` messages, `user_content` is always NULL. `content` *is* the user content.

### New CHECK constraint

```sql
source IN ('user', 'agent_template', 'system')
```

### New indexes (replace existing)

```sql
-- Model view: what goes into the API request
cx_message_model_view ON (conversation_id, position)
  WHERE is_visible_to_model = true AND deleted_at IS NULL

-- User view: what the client displays
cx_message_user_view ON (conversation_id, position)
  WHERE is_visible_to_user = true AND deleted_at IS NULL
```

The two existing partial indexes (`cx_message_conversation_context` and `cx_message_conversation_display`) remain during transition, then get dropped once both teams confirm the new ones are in use.

### New RPC functions

Two Postgres functions that React calls instead of writing raw queries:

**`get_conversation_messages_for_display(p_conversation_id uuid)`**
Returns messages for UI rendering. Applies visibility rules:
- Filters to `is_visible_to_user = true`
- Returns `user_content` as `display_content` when not null, otherwise returns `content`
- Excludes `cx_conversation.system_instruction`
- Joins basic metadata (source, agent_id) for UI hints (e.g. "agent-generated" badge)
- Returns messages ordered by position

**`get_conversation_messages_for_model(p_conversation_id uuid)`**  
Returns messages for building the API request. Python uses this (or equivalent ORM query):
- Filters to `is_visible_to_model = true`
- Always returns `content` (never `user_content`)
- Ordered by position

### What does NOT change

| Thing | Status |
|-------|--------|
| `cx_conversation.system_instruction` | Stays. Still the system prompt. Still hidden from user display. |
| `cx_conversation.variables` | Stays. Canonical variable values for the conversation. |
| `cx_conversation.overrides` | Stays. Model/config overrides. |
| `cx_message.position` | **No change to numbering scheme.** One row per logical position. |
| `cx_message.status` | Stays. Orthogonal to visibility (`active`/`condensed`/`summary`/`deleted`). |
| `cx_message.role` | Stays. No new roles needed. |
| `cx_message.content` | Stays. Always the model-facing version. |

---

## Impact on Other cx_ Tables

### cx_user_request — No schema change

`trigger_message_position`, `result_start_position`, `result_end_position` all reference `cx_message.position`. Since position numbering is unchanged, these continue to work as-is. 

**Python note:** When an agent start creates the initial template messages, the `cx_user_request` for that run should still track position 0 as the trigger, same as today.

### cx_request — No change

Tracks individual API calls (tokens, cost, duration). Not message-aware. Unaffected.

### cx_tool_call — No change

Links to `message_id` (the assistant message containing the tool call). Tool calls only appear on model-generated assistant messages which are always `source = 'user'` or visible to both. No change needed.

### cx_media — No duplication needed

`cx_media` links to `conversation_id`, not `message_id`. Media (images, files, audio) uploaded by the user exists once at the conversation level. Both the `content` and `user_content` versions of a message can reference the same media by URL/ID. **No duplicate media rows.**

### cx_artifact — No change

Links to `message_id` (the assistant message that produced it). Always user-visible. Unaffected.

### cx_agent_memory — No change

Conversation-level, not message-level. Unaffected.

---

## How It Works: Agent Start Flow

When `POST /ai/agents/{agent_id}` fires and the backend resolves the template:

**Example agent template (2 non-system messages):**
```
messages[0]: role=system  → goes to cx_conversation.system_instruction (as today)
messages[1]: role=user    → "Analyze: {{topic}}\n---"
messages[2]: role=assistant → "Here is my analysis of..."
messages[3]: role=user    → "Now focus on {{aspect}}\n---\n{{__agent_user_input__}}"
```

**What gets written to cx_message:**

| pos | role | source | is_visible_to_user | is_visible_to_model | content | user_content |
|-----|------|--------|-------------------|--------------------|---------|-|
| 0 | user | `agent_template` | true | true | Full resolved: `"Analyze: Iran Israel War\n---"` | Extracted: `[{type: "text", text: "Iran Israel War"}]` |
| 1 | assistant | `agent_template` | true | true | Pre-baked response | NULL |
| 2 | user | `agent_template` | true | true | Full resolved: `"Now focus on diplomacy\n---\nExpand on the core disagreements"` | Extracted: `[{type: "text", text: "diplomacy"}, {type: "text", text: "Expand on the core disagreements"}]` |
| 3 | assistant | `user` | true | true | Model's actual response | NULL |

**Position 4+ (follow-up turns):** `source = 'user'`, both visibility flags true, `user_content` = NULL. Business as usual.

### What goes in `user_content`

For agent template messages, `user_content` contains the user-provided parts extracted from the resolved message:

- Variable values (from `cx_conversation.variables`)
- `__agent_user_input__` text
- Attachments/media content parts (images, files, audio)
- Context policy values that came from the user

The template wrapping text (the secret prompt engineering) is stripped out. Only what the user typed or uploaded appears.

### What goes in `metadata` (optional enrichment)

```jsonb
{
  "variable_values": { "topic": "Iran Israel War", "news_url": "..." },
  "context_slots": { "user_profile": {...} },
  "resources": [ { "type": "file", "name": "report.pdf" } ]
}
```

This is informational. The client does not need it for display — `user_content` is sufficient. But it's available for admin/debug views.

---

## How It Works: Condensation (Future)

When conversations get condensed:

1. Condensed original messages: set `is_visible_to_model = false`, `status = 'condensed'`
2. New summary message inserted: `source = 'system'`, `is_visible_to_user = false`, `is_visible_to_model = true`, `status = 'summary'`

Result: user scrolls through the full history. Model gets the condensed version. The two RPC functions handle this automatically.

---

## Team Responsibilities

### Python Team (All Writes)

Python owns every write to `cx_message`. No other system writes to this table.

1. **Agent start path** (`POST /ai/agents/{agent_id}`): When resolving agent templates and writing `cx_message` rows:
   - Set `source = 'agent_template'` on all template-derived messages
   - Set `agent_id` to the agent's UUID
   - Build and populate `user_content` with only the user-provided parts
   - Populate `metadata` with structured variable/context/resource breakdown
   - Visibility flags default to `true/true` for template messages (the RPC handles display logic)

2. **Conversation continue path** (`POST /ai/conversations/{id}`): No change. Messages get `source = 'user'`, defaults apply.

3. **Chat path** (`POST /ai/chat`): No change. Messages get `source = 'user'`, defaults apply.

4. **Model request builder**: When loading conversation history to build the API request, query using `is_visible_to_model = true` (or use `get_conversation_messages_for_model` RPC). This replaces any current "load all active messages" query.

5. **Condensation** (when implemented): Update old messages' `is_visible_to_model = false`, insert summary messages with `is_visible_to_user = false`.

6. **Backfill migration**: Write a one-time migration that tags existing agent conversation messages. Identifiable by `cx_conversation.variables != '{}'`. For these conversations, position 0 (and position 1 if the agent has a pre-baked assistant response) should get `source = 'agent_template'` and the appropriate `agent_id`. `user_content` backfill is optional (requires re-parsing against agent templates).

### React Team (All Reads)

React never writes to `cx_message`. It reads via Supabase client or RPC.

1. **Conversation display**: Replace any direct `cx_message` query with a call to `get_conversation_messages_for_display(conversation_id)`. This function returns a `display_content` field — always render that instead of raw `content`.

2. **Rendering logic**: 
   - If `display_content` is present → render it (this is the user-facing version)
   - The `source` field is available for UI hints (e.g. showing a subtle "Agent" indicator on template-generated messages)
   - `system_instruction` is never returned by the RPC — no client-side filtering needed

3. **No changes needed** for: streaming (stream events are unchanged), sending new messages (React sends `user_input`, Python writes the row), tool results, or media display.

4. **Existing conversation list / search**: No impact. These query `cx_conversation`, not `cx_message`.

---

## Migration Plan

### Phase 1: Schema (deploy first, zero breaking changes)

- Add columns with defaults (all existing rows get `source='user'`, `is_visible_to_user=true`, `is_visible_to_model=true`, `user_content=NULL`)
- Add CHECK constraint, FK, and new indexes
- Create both RPC functions

### Phase 2: Python writes (deploy second)

- Update agent start write path to populate new columns
- Update model request builder to filter on `is_visible_to_model`
- Run backfill for existing agent conversations

### Phase 3: React reads (deploy third)

- Switch conversation display to use the RPC
- Add `display_content` rendering logic

### Phase 4: Cleanup

- Drop old indexes (`cx_message_conversation_context`, `cx_message_conversation_display`) once confirmed unused
- Remove any client-side system prompt filtering logic (the RPC handles it now)

---

## Open Questions for Team Review

1. **`user_content` extraction**: Python needs to parse the resolved template and extract just the user-provided parts. Is the current template resolution code structured in a way that makes this extraction straightforward, or does it need refactoring?

2. **Pre-baked assistant messages**: Some agents have assistant messages in their template (positions like system→user→assistant→user). Should the pre-baked assistant response show a visual indicator in the UI, or just display normally?

3. **Condensation interaction**: When a condensed range includes agent template messages, the summary replaces them for the model. Should the user-visible versions of those messages remain scrollable, or collapse into a "condensed" indicator?

4. **RPC vs. direct query**: Are there React use cases that need more flexibility than the two proposed RPCs provide? If so, what additional parameters or return fields are needed?
