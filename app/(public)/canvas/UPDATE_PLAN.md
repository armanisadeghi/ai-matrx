Let me pull up your current schema. I'll check both the canvas-related tables and the cx_ conversation tables.Good, I can see all 6 canvas tables. Now let me pull the cx_ tables.Now let me check existing indexes, foreign keys, and any existing RPC functions related to canvas or cx_ tables.One more check — let me see if `canvas_items` has a `source_message_id` that's currently linked to `cx_message` or if it's just a loose text field, and whether there's any data in these tables to understand what's actually in use.Good — now I have the full picture. Here's my analysis and plan.

---

## What You Have Now

**Canvas tables (6 tables):**
- `canvas_items` — the core artifact table. Has `source_message_id` (text, nullable) and `conversation_id` (FK to `cx_conversation`), but **neither is populated** on any existing rows. Content is stored as `jsonb`. Types in use: `iframe`, `diagram`, `flashcards`. Already has a `content_hash` dedup mechanism.
- `shared_canvas_items` — a full denormalized copy for public sharing (13 rows). Has its own social counters, forking, search_vector, etc. This is essentially a "published" snapshot.
- `canvas_comments`, `canvas_likes`, `canvas_scores`, `canvas_views` — social/engagement layer, all FK to `shared_canvas_items`. Low usage.

**CX tables (6 tables):**
- `cx_conversation` — 86 rows, well-structured with org/workspace/project scoping, forking support, config/variables/overrides jsonb fields.
- `cx_message` — 275 rows, `content` is jsonb (array), has `position` (smallint), `status`, `content_history`. Smart indexes for context window and display filtering.
- `cx_user_request` — the "turn" level. Links user's prompt to the resulting iterations, tokens, cost.
- `cx_request` — individual API calls within a user_request (supports multi-iteration agentic loops).
- `cx_tool_call` — comprehensive tool execution tracking.
- `cx_media` — file attachments per conversation.

**Existing functions:** You already have `cx_message_edit` and `cx_update_timestamp` as RPC patterns, plus a full suite of canvas social functions (leaderboard, counters, search vector).

---

## The Core Gap

Right now `canvas_items` and `cx_message` are **disconnected**. The `source_message_id` field exists but is a loose `text` — not a proper FK, not populated, and not typed as UUID. The `conversation_id` FK exists but also isn't populated. So when the model generates an artifact inside a conversation, there's no reliable link back to which message produced it.

---

## The Plan

### Phase 1: Schema Changes (Postgres — I'll do this)

**1. Fix `canvas_items.source_message_id`** — Convert from `text` to `uuid`, add FK to `cx_message`. This is the critical missing link. Since all 6 existing rows have `NULL` for this field, the migration is safe.

**2. Add `artifact_index` (smallint)** to `canvas_items` — This is the sequential number from the model (`artifact_1` → `1`). Combined with `source_message_id`, it creates the deterministic composite identity we discussed.

**3. Add unique constraint** on `(source_message_id, artifact_index)` — Prevents duplicate artifacts per message. Partial index where both are NOT NULL so existing rows aren't affected.

**4. Add `version` (smallint, default 1)** to `canvas_items` — For when the model updates an artifact in a later message. The new row gets `version = 2` with the same logical identity but a new `source_message_id`.

**5. Add `parent_canvas_id` (uuid, FK self-ref)** to `canvas_items` — When an artifact is "updated" by the model in a subsequent message, the new canvas_item points back to the original. This gives you version chains without a separate versions table.

**6. Create RPC functions:**
- `cx_canvas_upsert(...)` — The main function AI Dream calls after parsing artifacts from a response. Takes `message_id`, `artifact_index`, `type`, `title`, `content_jsonb`, `conversation_id`, `user_id`. Generates the content_hash, checks for dedup, handles insert-or-update. Returns the canvas_item id.
- `cx_canvas_get_by_message(p_message_id uuid)` — Returns all artifacts for a given message, ordered by `artifact_index`.
- `cx_canvas_get_conversation_artifacts(p_conversation_id uuid)` — Returns the latest version of each artifact in a conversation (for the sidebar/panel view).
- `cx_canvas_update_version(...)` — When the model updates `artifact_1` in a later message, this creates a new row linked to the original via `parent_canvas_id` with incremented version.

### Phase 2: What NOT to Change

- **Don't touch `shared_canvas_items`** — That's your publish/share layer and it works fine as a denormalized snapshot. The existing social infra (comments, likes, scores, views, leaderboard) all FK to it and shouldn't be disrupted.
- **Don't change `cx_message.content` structure** — The raw model response with `<artifact>` tags stays in the message content. The canvas_items table is the *parsed* output, not a replacement for the raw message.
- **Don't add the composite text ID (`msg_uuid:artifact_1`)** to the database — That was a conceptual shorthand. In Postgres, the proper way is the `(source_message_id, artifact_index)` unique constraint. The composite key is something you build in application code if you need it for API routes.

### Phase 3: React Developer Instructions

Here's what I'd write for the dev team:

---

**For the frontend team — Canvas/Artifact integration with CX messages:**

**1. Artifact Parsing (streaming layer)**
When streaming an assistant response, detect `<artifact` as a sentinel token. When encountered, buffer the artifact content separately from prose. On stream completion (or on each artifact close tag), call the new `cx_canvas_upsert` RPC with: the `cx_message.id` of the assistant message being written, the `artifact_index` parsed from the tag's `id` attribute (strip the `artifact_` prefix, cast to int), the `type` and `title` from tag attributes, and the content body as a JSON object `{ raw: string }` (or whatever your existing `canvas_items.content` jsonb structure expects for that type).

**2. Message Rendering**
When rendering a `cx_message` that contains artifacts, query `cx_canvas_get_by_message(message_id)` to get the parsed artifacts. Render inline artifact cards/panels at the positions where the `<artifact>` tags appeared in the prose. Do NOT re-parse the raw message content on every render — use the persisted canvas_items.

**3. Conversation Artifact Panel**
Use `cx_canvas_get_conversation_artifacts(conversation_id)` to populate a sidebar showing all artifacts in the conversation. This returns only the latest version of each, so updated artifacts show once, not per-version.

**4. Artifact Updates**
When the model reuses an artifact ID (e.g. `artifact_1` appears in message 5 after first appearing in message 2), the Python backend calls `cx_canvas_update_version` which creates a new `canvas_items` row with `parent_canvas_id` pointing to the original and `version` incremented. The frontend should show the latest version by default with an option to view version history.

**5. IDs**
Never generate UUIDs for artifacts on the frontend. The `canvas_items.id` is always `gen_random_uuid()` from Postgres via the RPC. The model's `artifact_1` identifier is only used as `artifact_index` for dedup and ordering. If you need a stable client-side key before the RPC returns, use `${messageId}:${artifactIndex}` as a temporary React key.

---

Want me to go ahead and write the migration + RPC functions? I'll do it all in a single migration so you can review before I apply.