# AI Matrx Context Engine — Complete System Reference

**Audience:** Python/AI Dream team, React/Next.js team, agent authors, platform integrators
**Status:** Database schema live, Python integration in progress (March 2026)
**Companion doc:** `docs/deferred-context-system.md` (the Deferred Context System internal architecture)

---

## Table of Contents

1. [How the Two Systems Connect](#1-how-the-two-systems-connect)
2. [The Hierarchy — Where Everything Lives](#2-the-hierarchy--where-everything-lives)
3. [The 9 Scoped Entities](#3-the-9-scoped-entities)
4. [The Three-Tier Context Model (Updated)](#4-the-three-tier-context-model-updated)
5. [Database: New Tables](#5-database-new-tables)
6. [Database: New Columns on Existing Tables](#6-database-new-columns-on-existing-tables)
7. [Database: Resolution Functions](#7-database-resolution-functions)
8. [Connecting to the Deferred Context System](#8-connecting-to-the-deferred-context-system)
9. [Python / AI Dream Integration Guide](#9-python--ai-dream-integration-guide)
10. [React / Next.js Integration Guide](#10-react--nextjs-integration-guide)
11. [Agent Author Guide](#11-agent-author-guide)
12. [Variable Taxonomy and Examples](#12-variable-taxonomy-and-examples)
13. [Design Rules](#13-design-rules)
14. [Real-World Hierarchy Examples](#14-real-world-hierarchy-examples)
15. [Hierarchy Design Principles (Learned from Examples)](#15-hierarchy-design-principles-learned-from-examples)
16. [Future Work](#16-future-work)

---

## 1. How the Two Systems Connect

Two systems now work together:

**The Context Engine** (this document) manages *where* context lives and *what* values are available. It owns the hierarchy (`User → Org → Workspace → Project → Task`), the scoping of all entities, the `context_variables` table, and the `user_active_context` tracker. It answers the question: **"Given where this user is working right now, what variables and data are relevant?"**

**The Deferred Context System** (companion doc) manages *how* context is delivered to the model. It owns the three-tier delivery model (inline variables, deferred manifest + `ctx_get`, tools), the `context_slots` on agents, and the request-time plumbing in `apply_context_objects()`. It answers the question: **"Given a set of context objects, how do we get them to the model efficiently?"**

The connection point: the Context Engine *produces* the data (by resolving `context_variables` and querying scoped entities), and the Deferred Context System *delivers* it to the model (via the `context` field on request bodies and the `ctx_get` tool).

```
┌────────────────────────────────────┐     ┌──────────────────────────────────┐
│       CONTEXT ENGINE               │     │    DEFERRED CONTEXT SYSTEM       │
│                                    │     │                                  │
│  context_variables (DB)            │     │  context_slots (agent config)    │
│  user_active_context (DB)          │     │  ctx_get tool (runtime)          │
│  resolve_context_variables() (DB)  │     │  apply_context_objects() (Py)    │
│  Scoped entities (DB)              │     │  ContextManifest (Py)            │
│                                    │     │                                  │
│  Answers: WHAT is available?       │     │  Answers: HOW to deliver it?     │
│                                    │     │                                  │
│        Produces dict ──────────────┼────►│  Receives context dict           │
│                                    │     │  Builds manifest                 │
│                                    │     │  Inlines small values            │
│                                    │     │  Defers large values             │
│                                    │     │  Model calls ctx_get on demand   │
└────────────────────────────────────┘     └──────────────────────────────────┘
```

---

## 2. The Hierarchy — Where Everything Lives

Every piece of work in AI Matrx exists somewhere in this hierarchy. Each layer is optional; a conversation can belong directly to a user with no org, or be scoped all the way down to a specific task.

```
auth.users + profiles
│
└── organizations                    ← org_members, org_invitations
    │   settings: jsonb
    │
    └── workspaces (nestable)        ← workspace_members, workspace_invitations  [NEW]
        │   parent_workspace_id → workspaces (self-ref)
        │   settings: jsonb
        │
        └── projects                 ← project_members, project_invitations
            │   workspace_id → workspaces  [NEW FK]
            │   organization_id → organizations
            │   settings: jsonb
            │
            └── tasks (nestable)
                    parent_task_id → tasks (self-ref)
                    project_id → projects
                    settings: jsonb  [NEW column]
```

**Key relationships confirmed in the database:**

| From | Column | To |
|------|--------|----|
| `workspaces` | `organization_id` | `organizations` |
| `workspaces` | `parent_workspace_id` | `workspaces` |
| **`projects`** | **`workspace_id`** | **`workspaces`** [NEW] |
| `projects` | `organization_id` | `organizations` |
| `tasks` | `project_id` | `projects` |
| `tasks` | `parent_task_id` | `tasks` |

**Membership tables:**

| Table | Mirrors | Role enum | RLS |
|-------|---------|-----------|-----|
| `organization_members` | — | `org_role` (owner, admin, member) | Yes |
| `organization_invitations` | — | `org_role` | Yes |
| **`workspace_members`** [NEW] | `organization_members` | `workspace_role` (owner, admin, member) | Yes |
| **`workspace_invitations`** [NEW] | `organization_invitations` | `workspace_role` | Yes |
| `project_members` | — | `project_role` (owner, admin, member) | Yes |
| `project_invitations` | — | `project_role` | Yes |

---

## 3. The 9 Scoped Entities

These are the things users create and work with. Every one now has optional FK columns to `organizations`, `workspaces`, `projects`, and `tasks` — meaning any entity can be scoped at any level of the hierarchy.

| # | Entity | Primary table | Scope columns | Notes |
|---|--------|---------------|---------------|-------|
| 1 | **Conversations** | `cx_conversation` | org, ws, proj, task | The primary vessel for all AI interaction |
| 2 | **Artifacts** | `canvas_items` | org, ws, proj + `conversation_id` → cx_conversation | Generated outputs (SVGs, HTML, code, diagrams). Also has social layer via `shared_canvas_items` |
| 3 | **Notes** | `notes` | org, ws, proj, task | User text, documentation, anything. Has `note_versions` for history |
| 4 | **Files** | `user_files` | org, ws, proj, task | Binary assets in S3/deprecated file backend |
| 5 | **Data** | `user_tables` | org, ws, proj, task | Tabular data with `table_fields` (schema) and `table_data` (rows) |
| 6 | **Knowledge** | `rs_topic` → `rs_source` → `rs_content` | `rs_topic.project_id` (pre-existing) | Research content, uploaded docs, analyses, syntheses |
| 7 | **Transcripts** | `transcripts` | org, ws, proj, task | Audio/video to text with segments and timestamps |
| 8 | **Code** | TBD | TBD | Git repos, code files — not yet integrated |
| 9 | **Environments** | `app_instances` + `sandbox_instances` | org, ws, proj, task | Local app instances and cloud sandboxes |

**All scope columns are nullable.** An entity with no scope columns set belongs to the user only. An entity with `organization_id` set but nothing below it is org-wide. And so on. This is strictly additive — no existing queries or data are affected.

**canvas_items as the artifact system:** `canvas_items` already stores typed content (iframe, diagram, flashcards, code, html, image, etc.) with a `type` field, `content` jsonb, and an existing social sharing layer through `shared_canvas_items` (likes, comments, scores, views, forks, bookmarks). The new `conversation_id` FK links artifacts back to the AI conversation that produced them. The new scope columns let artifacts be discovered within a project or task context.

> **Note on `canvas_items.task_id`:** The original column is `text` type (not uuid). A separate data migration should cast existing values and transition to a proper FK. The new scope columns (`organization_id`, `workspace_id`, `project_id`) are proper uuid FKs.

---

## 4. The Three-Tier Context Model (Updated)

The Deferred Context System doc describes three tiers. With the Context Engine providing the data, here is the complete picture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TIER 1: Inline Variables  {{variable_name}}                             │
│                                                                          │
│  SOURCE: context_variables with inject_as = 'direct'                     │
│          + system-derived variables (org name, task title, etc.)          │
│          + agent context_slots with max_inline_chars set                  │
│                                                                          │
│  DELIVERY: Substituted directly into the prompt before the model runs    │
│  TOKEN BUDGET: ~500–2,000 tokens. Always present.                        │
│  EXAMPLES: org_name, tech_stack, task_title, response_style              │
├─────────────────────────────────────────────────────────────────────────┤
│  TIER 2: Deferred Context  (ctx_get tool)                                │
│                                                                          │
│  SOURCE: context_variables with inject_as = 'tool_accessible'            │
│          + scoped entity queries (notes, knowledge, data tables)          │
│          + per-request context dict from caller/frontend                  │
│          + IDE state from Matrx Code / Matrx Local                       │
│                                                                          │
│  DELIVERY: Manifest appended to user message, ctx_get for retrieval      │
│  TOKEN BUDGET: Unlimited, on demand. Model decides what to pull.         │
│  EXAMPLES: db_schema, api_docs, active_file, large research docs         │
├─────────────────────────────────────────────────────────────────────────┤
│  TIER 3: Tools                                                           │
│                                                                          │
│  SOURCE: context_variables with inject_as = 'searchable'                 │
│          + registered tools that query scoped entities                    │
│                                                                          │
│  DELIVERY: Full tool execution pipeline — model calls, server runs       │
│  EXAMPLES: search_notes, query_data, search_knowledge,                   │
│            run_in_sandbox, summarize_context                              │
└─────────────────────────────────────────────────────────────────────────┘
```

**How `inject_as` on `context_variables` maps to these tiers:**

| `inject_as` value | Tier | Delivery |
|---------------------|------|----------|
| `direct` | Tier 1 | Inlined into system prompt as `{{key}}` or `<agent_context>` block |
| `tool_accessible` | Tier 2 | Added to the `context` dict → appears in manifest → `ctx_get` |
| `searchable` | Tier 3 | Available through search/query tools |
| `metadata` | None | Stored in DB for frontend/API use; never sent to the model |

---

## 5. Database: New Tables

### `context_variables`

The cascading key/value store. A variable defined at the Org level applies to everything below it unless overridden at a narrower scope.

```
context_variables
├── id                  uuid PK
├── user_id             uuid FK → auth.users        ┐
├── organization_id     uuid FK → organizations      │ exactly ONE
├── workspace_id        uuid FK → workspaces         │ must be set
├── project_id          uuid FK → projects           │ (CHECK constraint)
├── task_id             uuid FK → tasks              ┘
├── key                 text NOT NULL
├── value               jsonb NOT NULL
├── value_type          text NOT NULL  (string|number|boolean|json|secret|file_ref|model_ref|prompt_ref|tool_ref|template)
├── inject_as           text NOT NULL  (direct|tool_accessible|searchable|metadata)
├── description         text
├── is_system           boolean (auto-populated by platform)
├── is_secret           boolean (never sent to client)
├── is_active           boolean
├── tags                text[]
├── created_at          timestamptz
├── updated_at          timestamptz
└── created_by          uuid FK → auth.users
```

**Unique constraints:** Each `key` is unique per scope (e.g., only one `tech_stack` per organization).

**RLS:** Users can read variables at scopes they belong to (via membership tables). Insert/update/delete requires ownership or admin role.

### `user_active_context`

One row per user. Updated by the frontend on navigation events. Read by the resolution function.

```
user_active_context
├── user_id             uuid PK FK → auth.users
├── organization_id     uuid FK → organizations
├── workspace_id        uuid FK → workspaces
├── project_id          uuid FK → projects
├── task_id             uuid FK → tasks
├── active_entity_type  text        (cx_conversation, note, workflow, data, etc.)
├── active_entity_id    uuid
├── app_source          text        (web, mobile, desktop, extension, api)
├── last_activity       timestamptz
└── updated_at          timestamptz
```

**RLS:** Users can only read/write their own row.

### `workspace_members`

Mirrors `organization_members` exactly. Uses `workspace_role` enum (owner, admin, member).

### `workspace_invitations`

Mirrors `organization_invitations` exactly. Same token/email/expiry pattern.

---

## 6. Database: New Columns on Existing Tables

All columns are `uuid`, nullable, with FK constraints and `ON DELETE SET NULL`.

| Table | New columns |
|-------|-------------|
| `projects` | `workspace_id` → workspaces |
| `tasks` | `settings` (jsonb, default `{}`) |
| `cx_conversation` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `notes` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `user_tables` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `user_files` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `transcripts` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `workflow` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `prompts` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `sandbox_instances` | `organization_id`, `workspace_id`, `task_id` (already had `project_id`) |
| `app_instances` | `organization_id`, `workspace_id`, `project_id`, `task_id` |
| `canvas_items` | `organization_id`, `workspace_id`, `project_id`, `conversation_id` → cx_conversation |

**Zero breaking changes.** Every column is nullable. No existing data was modified. No existing queries are affected.

---

## 7. Database: Resolution Functions

### `resolve_context_variables()`

```sql
resolve_context_variables(
    p_user_id         uuid,
    p_organization_id uuid DEFAULT NULL,
    p_workspace_id    uuid DEFAULT NULL,
    p_project_id      uuid DEFAULT NULL,
    p_task_id         uuid DEFAULT NULL,
    p_inject_as       text DEFAULT NULL,     -- filter by tier, or NULL for all
    p_include_secrets  boolean DEFAULT false
) → jsonb
```

Walks the hierarchy from broad to narrow. For the same `key`, a value set at the Task level overrides Project, which overrides Workspace, which overrides Org, which overrides User.

**Resolution priority:** Task (5) > Project (4) > Workspace (3) > Organization (2) > User (1)

**Return shape:**

```json
{
  "variables": {
    "tech_stack": {
      "value": "Python, FastAPI, React, Supabase",
      "type": "string",
      "inject_as": "direct",
      "source": "organization",
      "description": "Primary technologies"
    },
    "task_title": {
      "value": "Auth Migration",
      "type": "string",
      "inject_as": "direct",
      "source": "task",
      "description": ""
    }
  },
  "sources": {
    "tech_stack": "organization",
    "task_title": "task"
  },
  "context": {
    "user_id": "...",
    "organization_id": "...",
    "workspace_id": "...",
    "project_id": "...",
    "task_id": "..."
  },
  "resolved_at": 1773888827.51
}
```

### `resolve_active_context()`

```sql
resolve_active_context(
    p_user_id   uuid,
    p_inject_as text DEFAULT NULL
) → jsonb
```

Reads `user_active_context` for the given user, then calls `resolve_context_variables` with those scope IDs. If no active context row exists, resolves with user-level only.

---

## 8. Connecting to the Deferred Context System

This is the integration point. The Python team's existing `apply_context_objects()` in `context_utils.py` accepts a `context: dict[str, Any]` and builds a `ContextManifest`. The Context Engine produces that dict.

### The flow

```
1. Frontend navigates → upserts user_active_context (via Supabase client)

2. User sends a message (any of the 3 endpoints)

3. Router resolves the agent config (existing)

4. NEW: Router calls resolve_active_context(user_id)
   → Gets dict of resolved variables split by inject_as

5. Variables with inject_as='direct' → merged into inline variables
   (they become {{key}} substitutions via the existing variable system)

6. Variables with inject_as='tool_accessible' → merged into the context dict
   (they go through apply_context_objects → manifest → ctx_get)

7. Per-request context from the caller → also merged into context dict
   (ad-hoc values from frontend, IDE state, etc.)

8. apply_context_objects() builds the ContextManifest as it already does

9. Model sees: inline vars in prompt + manifest in user message + ctx_get tool

10. Model calls ctx_get as needed → gets deferred content
```

**Caller-provided `context` always wins.** If the frontend sends `"tech_stack": "Ruby on Rails"` in the request `context` field, it overrides whatever `context_variables` resolved to for that key. This lets callers provide real-time overrides without touching the DB.

### What the Python team needs to build

The connection is a new function in `context_utils.py` (or a new module). Here is the interface:

```python
async def build_scoped_context(
    user_id: str,
    supabase: AsyncClient,
    caller_context: dict[str, Any] | None = None,
    scope_override: dict | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Resolves context variables from the hierarchy, splits by tier,
    and merges with caller-provided context.

    Returns:
        (inline_variables, deferred_context)

        inline_variables: dict of key→value for Tier 1 ({{key}} substitution)
        deferred_context: dict of key→value for Tier 2 (goes into context dict → manifest)
    """
```

This function:
1. Calls `resolve_active_context(user_id)` via Supabase RPC (or `resolve_context_variables` with explicit scope if `scope_override` is provided)
2. Iterates the returned `variables` dict
3. Splits into two dicts based on `inject_as`:
   - `direct` → goes into `inline_variables`
   - `tool_accessible` → goes into `deferred_context`
   - `searchable` → added to `deferred_context` with a marker for the manifest
   - `metadata` → dropped (not for the model)
4. Merges `caller_context` on top of `deferred_context` (caller wins on key conflicts)
5. Returns both dicts

The router then:
- Merges `inline_variables` into `variables` (existing pattern for `{{key}}` substitution)
- Passes `deferred_context` as the `context` arg to `apply_context_objects()` (existing function)

### System-derived variables

Some variables are not stored in `context_variables` — they're computed from the hierarchy tables at resolution time. The Python function should also fetch these and merge them into the inline dict:

| Key | Source query |
|-----|-------------|
| `org_name` | `SELECT name FROM organizations WHERE id = ?` |
| `workspace_name` | `SELECT name FROM workspaces WHERE id = ?` |
| `project_name` | `SELECT name FROM projects WHERE id = ?` |
| `project_description` | `SELECT description FROM projects WHERE id = ?` |
| `task_title` | `SELECT title FROM tasks WHERE id = ?` |
| `task_description` | `SELECT description FROM tasks WHERE id = ?` |
| `task_status` | `SELECT status FROM tasks WHERE id = ?` |
| `task_priority` | `SELECT priority FROM tasks WHERE id = ?` |
| `user_display_name` | `SELECT display_name FROM profiles WHERE id = ?` |

These are always `inject_as = 'direct'` and always present when the corresponding scope ID is set.

---

## 9. Python / AI Dream Integration Guide

### What already exists (don't touch)

- `apply_context_objects()` in `context_utils.py` — handles manifest building, ctx_get injection, inline thresholds
- `ctx_get` tool in `ai/tools/implementations/ctx.py` — handles full/page/summary retrieval
- `context_slots` on `prompts` and `prompt_builtins` — agent-defined slot definitions
- `ContextObjectType`, `ContextSlot`, `ContextObject`, `ContextManifest` in `context_objects.py`
- `IdeState` + `vsc_get_state` for IDE context
- All three routers (`agents.py`, `conversations.py`, `chat.py`) accept `context` field

### What to build

#### 1. `build_scoped_context()` function

See Section 8 above for the interface. This is a Supabase RPC call + dict splitting + merging.

#### 2. Router integration

In each of the three routers, after resolving the agent config, call `build_scoped_context()` and merge the results:

```python
# In agents.py (and similarly conversations.py, chat.py)

# Existing: resolve agent config
config, agent_context_slots = await AgentConfigResolver.from_id_with_slots(...)

# NEW: resolve scoped context
inline_vars, deferred_ctx = await build_scoped_context(
    user_id=user.id,
    supabase=supabase,
    caller_context=request.context,  # what the frontend sent
)

# Merge inline vars into the existing variables dict
merged_variables = {**(request.variables or {}), **inline_vars}

# Merge deferred context (caller wins on conflicts — already handled in build_scoped_context)
# deferred_ctx already has caller_context merged in

# Existing: apply context objects
apply_context_objects(config, app_ctx, deferred_ctx, agent_context_slots)
```

#### 3. Context-scoped tool implementations

Future tools that query scoped entities need access to the active scope. The scope is available in `app_ctx.metadata["context_objects"]` (via the manifest) but also consider storing the raw scope IDs:

```python
# In apply_context_objects or in the router, store the scope:
app_ctx.metadata["active_scope"] = {
    "organization_id": "...",
    "workspace_id": "...",
    "project_id": "...",
    "task_id": "...",
}
```

Then scope-aware tools like `search_notes` can read this:

```python
async def search_notes(query: str, scope: str = "project"):
    app_ctx = get_app_context()
    active_scope = app_ctx.metadata.get("active_scope", {})
    project_id = active_scope.get("project_id")
    # Query notes WHERE project_id = project_id AND content ILIKE ...
```

#### 4. New ContextObjectTypes

The existing `ContextObjectType` enum should be extended if needed. The current values (`text`, `file_url`, `json`, `db_ref`, `user`, `org`, `workspace`, `project`, `task`) already cover the hierarchy types. Consider adding:

- `note` — for note content passed as deferred context
- `knowledge` — for research/knowledge base content
- `transcript` — for transcript segment data
- `code` — for code file content (when code integration lands)

---

## 10. React / Next.js Integration Guide

### What to build

#### 1. Active Context Tracking (Critical)

Every page/layout that establishes a scope context needs to update `user_active_context`. This is the single most important frontend integration — without it, agents don't know where the user is.

```typescript
// hooks/useActiveContext.ts
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ActiveScope {
  organization_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  active_entity_type?: string | null;
  active_entity_id?: string | null;
  app_source?: 'web' | 'mobile' | 'desktop' | 'extension' | 'api';
}

export function useActiveContext(scope: ActiveScope) {
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    const update = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase
        .from('user_active_context')
        .upsert(
          {
            user_id: user.id,
            organization_id: scope.organization_id ?? null,
            workspace_id: scope.workspace_id ?? null,
            project_id: scope.project_id ?? null,
            task_id: scope.task_id ?? null,
            active_entity_type: scope.active_entity_type ?? null,
            active_entity_id: scope.active_entity_id ?? null,
            app_source: scope.app_source ?? 'web',
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
    };

    update();
    return () => { cancelled = true; };
  }, [
    scope.organization_id,
    scope.workspace_id,
    scope.project_id,
    scope.task_id,
    scope.active_entity_type,
    scope.active_entity_id,
  ]);
}
```

**Where to call it:**

| Page/Layout | Scope to set |
|-------------|-------------|
| Org dashboard | `{ organization_id }` |
| Workspace view | `{ organization_id, workspace_id }` |
| Project page | `{ organization_id, workspace_id, project_id }` |
| Task detail | `{ organization_id, workspace_id, project_id, task_id }` |
| Conversation view | `{ ..., active_entity_type: 'cx_conversation', active_entity_id }` |
| Note editor | `{ ..., active_entity_type: 'note', active_entity_id }` |

#### 2. Sending `context` in AI Requests

When calling AI endpoints, include scope-relevant data in the `context` field. The backend resolves `context_variables` automatically, but the frontend can also send ad-hoc values:

```typescript
const response = await fetch(`${API_BASE}/ai/conversations/${conversationId}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_input: message,
    stream: true,
    context: {
      // Ad-hoc context the backend doesn't already know about
      selected_text: selectionFromEditor,
      clipboard: clipboardContent,
      current_page_url: window.location.href,
    },
  }),
});
```

You generally **don't** need to send `org_name`, `tech_stack`, or `task_title` — the backend resolves those from `context_variables` + the hierarchy. Only send things the backend can't know: selected text, current scroll position, clipboard, UI state.

#### 3. Scope Columns When Creating Entities

When creating a new conversation, note, file, etc., set the scope columns based on where the user currently is:

```typescript
// Creating a conversation scoped to the current project
const { data } = await supabase.from('cx_conversation').insert({
  user_id: user.id,
  title: 'New conversation',
  organization_id: currentOrg.id,
  workspace_id: currentWorkspace?.id,
  project_id: currentProject?.id,
  task_id: currentTask?.id,
  // ...other fields
});
```

#### 4. Context Variable Management UI

Build UI for managing `context_variables` at each scope level. This could be:
- A "Settings → Variables" tab in org/workspace/project/task detail pages
- A form to create/edit variables with `key`, `value`, `value_type`, `inject_as`, `description`
- A visual indicator showing which scope a variable was inherited from vs. overridden at

```typescript
// Fetching variables for a project (includes inherited from org/workspace)
const { data } = await supabase.rpc('resolve_context_variables', {
  p_user_id: user.id,
  p_organization_id: project.organization_id,
  p_workspace_id: project.workspace_id,
  p_project_id: project.id,
});
// data.variables → resolved dict with source attribution
// data.sources → { key: "organization" | "workspace" | "project" | ... }
```

#### 5. Agent Editor: `context_slots` Field

The agent editing form needs a section for `context_slots` (the JSONB array on `prompts` / `prompt_builtins`). Each slot has:
- `key` (string) — what callers will use
- `type` (select from ContextObjectType values)
- `label` (string) — shown in the manifest
- `description` (string) — helps the model decide if it needs this context
- `max_inline_chars` (number or null)
- `summary_agent_id` (UUID or null)

Display as a list of editable slot cards.

#### 6. Workspace Members UI

The workspace members UI should mirror the existing organization members UI. Same patterns for invite flows, role management, and member listing.

---

## 11. Agent Author Guide

### What context your agent gets automatically

If the user is working within a scope (org/workspace/project/task), and `context_variables` are defined at those scopes, your agent receives:

**Always in the prompt (Tier 1):** Variables with `inject_as = 'direct'` — things like `tech_stack`, `coding_standards`, `task_title`, `task_description`, `response_style`. You don't need to do anything. They appear as `{{key}}` substitutions if you reference them in your prompt, or as an `<agent_context>` block appended to the user message.

**Available on demand (Tier 2):** Variables with `inject_as = 'tool_accessible'` — things like `db_schema`, `api_docs`, `large_design_doc`. These appear in the manifest (`## Available Context` table) appended to the user message. The model calls `ctx_get(key=...)` to read them.

### Adding context_slots to your agent

Define `context_slots` on your agent when you want to:
- Control the type, label, and description shown in the manifest for specific keys
- Set `max_inline_chars` so the beginning of content is inlined but the rest is deferred
- Configure a `summary_agent_id` for very large content

You do NOT need `context_slots` for:
- Hierarchy variables (resolved automatically from `context_variables`)
- Ad-hoc keys the caller sends (auto-typed and auto-labeled)

### Example: Code review agent

```json
{
  "context_slots": [
    {
      "key": "active_file",
      "type": "text",
      "label": "Active File",
      "description": "The file the user is currently editing, including all imports and function definitions",
      "max_inline_chars": 3000,
      "summary_agent_id": null
    },
    {
      "key": "git_diff",
      "type": "text",
      "label": "Git Diff",
      "description": "The staged or unstaged git diff for the current file or project",
      "max_inline_chars": 2000,
      "summary_agent_id": null
    }
  ]
}
```

The agent also receives `tech_stack`, `coding_standards`, `project_name`, `task_title`, etc. automatically from the hierarchy — no slots needed for those.

---

## 12. Variable Taxonomy and Examples

### System-Derived Variables (Auto-Computed, Always Tier 1)

| Key | Source | Scope |
|-----|--------|-------|
| `org_name` | `organizations.name` | org |
| `org_slug` | `organizations.slug` | org |
| `workspace_name` | `workspaces.name` | workspace |
| `project_name` | `projects.name` | project |
| `project_slug` | `projects.slug` | project |
| `project_description` | `projects.description` | project |
| `task_title` | `tasks.title` | task |
| `task_description` | `tasks.description` | task |
| `task_status` | `tasks.status` | task |
| `task_priority` | `tasks.priority` | task |
| `user_display_name` | `profiles.display_name` | user |

### User-Defined Variable Examples

**User level:**

| Key | inject_as | Example |
|-----|-----------|---------|
| `response_style` | direct | `"concise, code-first"` |
| `preferred_language` | direct | `"python"` |
| `timezone` | direct | `"America/Los_Angeles"` |

**Organization level:**

| Key | inject_as | Example |
|-----|-----------|---------|
| `tech_stack` | direct | `"Python, FastAPI, React, Supabase"` |
| `coding_standards` | direct | `"PEP 8, strict typing, comprehensive docstrings"` |
| `deployment_platform` | direct | `"AWS via Coolify"` |
| `org_api_key` | metadata (secret) | `"sk-..."` |

**Project level:**

| Key | inject_as | Example |
|-----|-----------|---------|
| `target_framework` | direct | `"FastAPI 0.115"` |
| `db_schema` | tool_accessible | `{large schema JSON}` |
| `api_docs_url` | tool_accessible | `"https://docs.example.com/api/v2"` |
| `design_doc` | searchable | `{40,000 char design document}` |

**Task level:**

| Key | inject_as | Example |
|-----|-----------|---------|
| `branch_name` | direct | `"feature/auth-migration"` |
| `pr_url` | direct | `"https://github.com/..."` |
| `acceptance_criteria` | tool_accessible | `{detailed criteria}` |

---

## 13. Design Rules

### From the Context Engine

1. **Scope columns are always nullable.** No entity is required to have a scope. User-level entities are valid.
2. **Cascading override is sacrosanct.** Task > Project > Workspace > Org > User. Always.
3. **`user_active_context` is the truth.** The frontend owns this table. The backend reads it. Never infer the user's context from other signals.
4. **Caller-provided context overrides resolved variables.** If the frontend sends `"tech_stack": "Ruby"` in the request `context` dict, it wins over the org-level `context_variable` for `tech_stack`.

### From the Deferred Context System

5. **NEVER modify `system_instruction`.** Context goes in the user message (manifest) or inline variables. The system prompt belongs to the agent author.
6. **`ctx_get` is auto-injected.** When `context` is non-empty, the tool appears. Don't configure it manually.
7. **Context objects are per-request.** No cross-request persistence. Caller sends `context` fresh each time.
8. **Agent slots extend, never restrict.** Unknown keys from callers become ad-hoc objects.

---

## 14. Real-World Hierarchy Examples

These examples demonstrate how the Org → Workspace → Project → Task hierarchy maps to completely different industries. Each one is stress-tested against the actual database constraints.

**Key insight from these examples:** The pattern is consistent across every industry. **Organization = who you are. Workspace = a domain of work (nestable). Project = a bounded effort with a goal. Task = an individual unit of work.**

---

### Example 1: Workers' Compensation Law Firm

```
Org: Smith & Associates Law
│
├── Workspace: Acme Corporation (client)
│   │
│   ├── Workspace: Johnson v. Acme Corp (case)
│   │   │
│   │   ├── Workspace: Depositions
│   │   │   ├── Project: Dr. Miller deposition
│   │   │   │   ├── Task: Prep cross-examination questions
│   │   │   │   ├── Task: Review medical records with AI
│   │   │   │   └── Task: Draft deposition summary
│   │   │   └── Project: Plaintiff deposition
│   │   │       ├── Task: Prepare witness timeline
│   │   │       └── Task: Identify inconsistencies in prior statements
│   │   │
│   │   └── Workspace: Settlement negotiations
│   │       └── Project: Settlement demand package
│   │           ├── Task: Calculate damages model
│   │           └── Task: Draft demand letter
│   │
│   └── Project: Liability research (case-level, not under a sub-workspace)
│       ├── Task: Research similar precedents
│       └── Task: Summarize OSHA violation history
│
└── Workspace: Internal operations
    └── Project: CLE compliance tracking
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `practice_area` | `"Workers' Compensation"` | direct |
| Org | `jurisdiction_default` | `"California"` | direct |
| Org | `legal_citation_style` | `"Bluebook"` | direct |
| Client WS | `client_name` | `"Acme Corporation"` | direct |
| Client WS | `client_industry` | `"Manufacturing"` | direct |
| Case WS | `case_number` | `"WCAB-2026-04281"` | direct |
| Case WS | `judge_name` | `"Hon. Patricia Chen"` | direct |
| Case WS | `opposing_counsel` | `"Davis & Partners LLP"` | direct |
| Case WS | `case_summary` | `{5,000 char summary}` | tool_accessible |
| Project | `deponent_name` | `"Dr. Robert Miller"` | direct |
| Project | `deposition_date` | `"2026-04-15"` | direct |
| Task | `focus_area` | `"Causation between workplace exposure and diagnosis"` | direct |

**Why this works:** The attorney's world is deeply nested — client → case → phase → specific effort. Workspace nesting handles this naturally. The case number, judge name, and opposing counsel cascade down to every project and task within that case without repetition.

---

### Example 2: Marketing Agency

```
Org: BrightSpark Marketing
│
├── Workspace: TechStartup Co (client)
│   ├── Project: Q2 content calendar
│   │   ├── Task: Write 5 LinkedIn posts
│   │   ├── Task: Design carousel graphics
│   │   └── Task: Schedule and publish
│   ├── Project: SEO overhaul
│   │   ├── Task: Audit all service pages
│   │   ├── Task: Rewrite product descriptions
│   │   └── Task: Submit sitemap to Google
│   └── Project: Email nurture sequence
│       ├── Task: Write 6-email onboarding series
│       └── Task: Set up A/B test variants
│
├── Workspace: FoodChain Inc (client)
│   ├── Project: Brand refresh
│   │   ├── Task: Design new logo concepts
│   │   └── Task: Update brand guidelines doc
│   └── Project: Social media management
│       └── Task: Create March content batch
│
├── Workspace: Internal operations
│   ├── Project: Agency website redesign
│   └── Project: Hire content writer
│
└── Workspace: Templates & resources
    └── Project: Content templates library
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `agency_tone` | `"Professional but approachable"` | direct |
| Org | `seo_tools` | `"Ahrefs, Screaming Frog, Surfer SEO"` | direct |
| Client WS | `brand_voice` | `"Bold, innovative, technical but accessible"` | direct |
| Client WS | `target_audience` | `"CTOs and VP Engineering at Series B+ startups"` | direct |
| Client WS | `brand_colors` | `"#1A73E8, #34A853, #FFFFFF"` | direct |
| Client WS | `brand_guidelines` | `{12,000 char guidelines doc}` | tool_accessible |
| Project | `campaign_goal` | `"Increase organic traffic 40% by Q3"` | direct |
| Project | `keyword_targets` | `{list of 50 keywords}` | tool_accessible |
| Task | `content_type` | `"LinkedIn carousel"` | direct |
| Task | `word_count_target` | `300` | direct |

**Why this works:** Each client is a workspace with its own brand voice, audience, and guidelines. These cascade into every project and task for that client. The agent writing LinkedIn posts for TechStartup Co automatically knows the brand voice, target audience, and colors without any manual configuration per task.

---

### Example 3: Software Development Studio

```
Org: AI Matrx
│
├── Workspace: Engineering
│   ├── Workspace: Backend
│   │   ├── Project: Auth system rewrite
│   │   │   ├── Task: Migrate sessions to JWT
│   │   │   ├── Task: Implement OAuth 2.1 server
│   │   │   └── Task: Write integration tests
│   │   └── Project: Streaming architecture v2
│   │       ├── Task: Design block type registry
│   │       └── Task: Implement SSE reconnection
│   ├── Workspace: Frontend
│   │   ├── Project: Dashboard v3
│   │   └── Project: Mobile app performance
│   └── Workspace: Infrastructure
│       ├── Project: Coolify migration
│       └── Project: S3 CDN setup
│
├── Workspace: Client work
│   └── Workspace: All Green Electronics
│       ├── Project: Recycling portal
│       └── Project: Compliance documentation
│
└── Workspace: Product
    ├── Project: AI Matrx landing page
    └── Project: Onboarding flow redesign
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `tech_stack` | `"Python, FastAPI, React, Supabase"` | direct |
| Org | `coding_standards` | `"PEP 8, strict typing, comprehensive docstrings"` | direct |
| Org | `git_workflow` | `"feature branches, squash merge, conventional commits"` | direct |
| Backend WS | `framework` | `"FastAPI 0.115"` | direct |
| Backend WS | `db_schema` | `{large schema document}` | tool_accessible |
| Frontend WS | `framework` | `"Next.js 15, React 19"` | direct |
| Frontend WS | `styling` | `"Tailwind only, no CSS modules"` | direct |
| Project | `project_description` | `"Full rewrite of session auth to JWT + OAuth 2.1"` | direct |
| Project | `design_doc` | `{RFC document, 8,000 chars}` | tool_accessible |
| Task | `branch_name` | `"feature/jwt-migration"` | direct |
| Task | `pr_url` | `"https://github.com/ai-matrx/ai-dream/pull/247"` | direct |

**Why this works:** The `tech_stack` cascading override is the showcase here. The org says "Python, FastAPI, React, Supabase." The Backend workspace says `framework = "FastAPI 0.115"`. The Frontend workspace says `framework = "Next.js 15, React 19"`. An agent working on a backend task gets FastAPI context; an agent on a frontend task gets Next.js context. Same key, different values, automatically resolved.

---

### Example 4: Medical Research Team

```
Org: City General Hospital — Oncology Department
│
├── Workspace: Clinical trials
│   ├── Project: BRCA2 immunotherapy trial (Phase II)
│   │   ├── Task: Analyze cohort 3 bloodwork results
│   │   ├── Task: Draft IRB amendment for dosage change
│   │   └── Task: Prepare interim data report
│   └── Project: CAR-T dosage optimization study
│       ├── Task: Run statistical analysis on response rates
│       └── Task: Review adverse event reports
│
├── Workspace: Literature review
│   └── Project: PD-L1 checkpoint inhibitors survey
│       ├── Task: Search PubMed for 2025-2026 publications
│       ├── Task: Summarize 15 key papers
│       └── Task: Draft systematic review outline
│
├── Workspace: Grant writing
│   └── Project: NIH R01 application 2026
│       ├── Task: Write specific aims page
│       ├── Task: Prepare budget justification
│       └── Task: Compile preliminary data figures
│
└── Workspace: Department administration
    └── Project: Annual performance reviews
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `institution` | `"City General Hospital"` | direct |
| Org | `department` | `"Oncology"` | direct |
| Org | `citation_style` | `"AMA 11th edition"` | direct |
| Org | `compliance_framework` | `"HIPAA, FDA 21 CFR Part 11"` | direct |
| Trials WS | `irb_committee` | `"Western IRB Protocol Board"` | direct |
| Project | `protocol_number` | `"CGH-ONC-2026-0042"` | direct |
| Project | `principal_investigator` | `"Dr. Sarah Kim, MD PhD"` | direct |
| Project | `trial_phase` | `"Phase II"` | direct |
| Project | `patient_cohort_summary` | `{anonymized cohort statistics}` | tool_accessible |
| Task | `statistical_method` | `"Kaplan-Meier survival analysis"` | direct |
| Task | `data_source` | `"REDCap export 2026-03-10"` | direct |

**Why this works:** Compliance variables at the org level (`HIPAA`, `FDA 21 CFR Part 11`) cascade to everything. The agent drafting an IRB amendment automatically knows the protocol number, PI name, and compliance requirements. The agent doing literature review automatically uses AMA citation style. No manual configuration per task.

---

### Example 5: Freelance Consultant (Solo User)

```
Org: Personal (auto-created for every user)
│
├── Workspace: Bloom Bakery (client)
│   ├── Project: Business plan
│   │   ├── Task: Financial projections spreadsheet
│   │   ├── Task: Market analysis research
│   │   └── Task: Executive summary draft
│   └── Project: Menu pricing analysis
│       └── Task: Competitor price comparison
│
├── Workspace: Urban Fitness (client)
│   └── Project: Membership growth strategy
│       ├── Task: Analyze churn data
│       └── Task: Draft retention email sequence
│
├── Workspace: Personal learning
│   ├── Project: SQL course
│   │   ├── Task: Practice joins exercises
│   │   └── Task: Build sample database
│   └── Project: AI certification prep
│       └── Task: Review transformer architecture
│
└── Workspace: Admin
    └── Project: Tax prep 2025
        └── Task: Categorize business expenses
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org (personal) | `response_style` | `"Clear, actionable, no jargon"` | direct |
| Org (personal) | `hourly_rate` | `150` | metadata |
| Org (personal) | `invoice_template` | `{template structure}` | tool_accessible |
| Client WS | `client_name` | `"Bloom Bakery"` | direct |
| Client WS | `client_industry` | `"Food service / retail bakery"` | direct |
| Client WS | `client_budget` | `"$5,000/month retainer"` | direct |
| Client WS | `client_goals` | `"Open second location by Q4 2026"` | direct |
| Project | `deliverable` | `"Full business plan document"` | direct |
| Project | `deadline` | `"2026-04-30"` | direct |
| Task | `focus` | `"5-year revenue projection with 3 scenarios"` | direct |

**Why this works:** Even a solo user benefits from the hierarchy. Each client is a workspace with its own context. The agent helping with Bloom Bakery's financial projections knows the client's industry, budget, and goals. The agent helping with SQL practice knows nothing about bakery clients — clean separation. The personal org `response_style` cascades everywhere.

---

### Example 6: University Professor

```
Org: State University — Computer Science Department
│
├── Workspace: CS 301 — Algorithms (Spring 2026)
│   ├── Project: Midterm exam
│   │   ├── Task: Write graph traversal question
│   │   ├── Task: Create dynamic programming problem
│   │   └── Task: Build answer key with rubric
│   ├── Project: Homework assignments
│   │   ├── Task: Grade HW4 with AI rubric
│   │   └── Task: Write HW5 — minimum spanning trees
│   └── Project: Lecture materials
│       ├── Task: Create slides for greedy algorithms
│       └── Task: Record walkthrough video for NP-completeness
│
├── Workspace: CS 101 — Intro to Programming (Spring 2026)
│   ├── Project: Final project
│   │   └── Task: Design project rubric
│   └── Project: Lab exercises
│       └── Task: Create Python debugging lab
│
├── Workspace: Research — Distributed systems
│   ├── Project: Consensus protocol paper
│   │   ├── Task: Run simulation batch 7
│   │   ├── Task: Generate comparison charts
│   │   └── Task: Write results section
│   └── Project: NSF grant proposal
│       └── Task: Draft project narrative
│
└── Workspace: Department administration
    ├── Project: Curriculum review 2026-2027
    │   └── Task: Propose new ML elective
    └── Project: Faculty hiring committee
        └── Task: Review candidate portfolios
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `institution` | `"State University"` | direct |
| Org | `department` | `"Computer Science"` | direct |
| Org | `academic_tone` | `"Formal, pedagogically clear"` | direct |
| CS 301 WS | `course_level` | `"Upper-division undergraduate"` | direct |
| CS 301 WS | `textbook` | `"CLRS — Introduction to Algorithms, 4th ed."` | direct |
| CS 301 WS | `prerequisite_knowledge` | `"Data structures, basic proof techniques"` | direct |
| CS 301 WS | `grading_rubric` | `{detailed rubric, 3,000 chars}` | tool_accessible |
| CS 101 WS | `course_level` | `"Introductory, no prior experience assumed"` | direct |
| CS 101 WS | `academic_tone` | `"Friendly, encouraging, lots of examples"` | direct |
| Research WS | `lab_cluster_url` | `"https://hpc.stateuniv.edu/dsl"` | direct |
| Research WS | `citation_style` | `"ACM"` | direct |
| Project | `paper_title` | `"Latency-Optimal Consensus Under Partial Synchrony"` | direct |
| Task | `simulation_params` | `{batch 7 parameters JSON}` | tool_accessible |

**Why this works:** The cascading override shines here. The org sets `academic_tone = "Formal"`. CS 301 inherits it. But CS 101 overrides with `"Friendly, encouraging, lots of examples"` — an intro class needs a completely different tone. The agent writing a CS 101 debugging lab uses beginner-friendly language; the agent writing a CS 301 exam uses formal algorithmic language. Same `academic_tone` key, different values per workspace, automatically resolved.

---

### Example 7: E-Commerce Business

```
Org: Coastal Living Co (DTC brand)
│
├── Workspace: Product development
│   ├── Project: Summer 2026 collection
│   │   ├── Task: Write product descriptions (12 items)
│   │   ├── Task: Generate lifestyle photography prompts
│   │   └── Task: Create size guide content
│   └── Project: Packaging redesign
│       └── Task: Draft sustainability messaging
│
├── Workspace: Marketing
│   ├── Project: Email marketing
│   │   ├── Task: Write welcome series (5 emails)
│   │   ├── Task: Create abandoned cart sequence
│   │   └── Task: Design VIP loyalty campaign
│   ├── Project: Social media
│   │   ├── Task: March Instagram content plan
│   │   └── Task: Write TikTok scripts (10 videos)
│   └── Project: SEO
│       └── Task: Optimize collection page metadata
│
├── Workspace: Operations
│   ├── Project: Customer service scripts
│   │   ├── Task: Write return/exchange templates
│   │   └── Task: Create shipping delay response library
│   └── Project: Supplier management
│       └── Task: Negotiate Q3 terms with fabric supplier
│
└── Workspace: Finance
    └── Project: Q1 2026 reporting
        ├── Task: Analyze channel profitability
        └── Task: Prepare board deck financials
```

**Context variables at each layer:**

| Layer | Key | Value | inject_as |
|-------|-----|-------|-----------|
| Org | `brand_name` | `"Coastal Living Co"` | direct |
| Org | `brand_voice` | `"Warm, aspirational, California-casual luxury"` | direct |
| Org | `target_customer` | `"Women 28-45, $80K+ household income, coastal lifestyle"` | direct |
| Org | `product_category` | `"Premium sustainable beachwear and home goods"` | direct |
| Marketing WS | `email_platform` | `"Klaviyo"` | direct |
| Marketing WS | `social_platforms` | `"Instagram, TikTok, Pinterest"` | direct |
| Project | `campaign_name` | `"Summer Horizons — Summer 2026 Launch"` | direct |
| Project | `launch_date` | `"2026-05-15"` | direct |
| Task | `product_name` | `"Driftwood Linen Maxi Dress"` | direct |
| Task | `product_details` | `{fabric, sizing, price, features}` | tool_accessible |

**Why this works:** Every piece of content this business produces needs to be on-brand. The `brand_voice` at the org level ensures that whether the agent is writing product descriptions, email campaigns, TikTok scripts, or customer service templates, it always sounds like Coastal Living Co. Department-specific context (email platform, social platforms) lives at the workspace level.

---

## 15. Hierarchy Design Principles (Learned from Examples)

### The universal pattern

Across all seven examples, the layers map consistently:

| Layer | What it represents | Nesting | Required parent |
|-------|--------------------|---------|-----------------|
| **Organization** | Who you are — your company, practice, department, or personal identity | No | None (top level) |
| **Workspace** | A domain of work — a client, a course, a department, a research area | Yes (unlimited depth) | Organization (required) |
| **Project** | A bounded effort — something with a goal, a deadline, a deliverable | No | Workspace or Organization (optional) |
| **Task** | A single unit of work — one action, one output | Yes (subtasks) | Project (optional) |

### Workspace nesting is what makes this work

Without nesting, the attorney would need to flatten "Client → Case → Depositions" into a single workspace. With nesting, each level maintains its own context variables and the hierarchy reads naturally. The recommended soft limit is 4 levels of nesting — deeper than that usually means a project or task is being disguised as a workspace.

### The most common workspace pattern: workspace = client

In scenarios 1, 2, 5, and parts of 3, the top-level workspace is a client. This is the dominant pattern for any service business (agencies, law firms, consulting, freelancers). The UI should make it easy to create a "client workspace" with pre-populated variable fields (client name, industry, contact info, brand guidelines).

### Context variables cascade naturally

The power of cascading override is visible in every example. A few highlights:

- **Professor:** Org says `academic_tone = "Formal"`. CS 101 workspace overrides to `"Friendly, encouraging"`. CS 301 inherits the org default. Same key, different values per workspace.
- **Dev studio:** Org says `tech_stack = "Python, FastAPI, React"`. Backend workspace says `framework = "FastAPI 0.115"`. Frontend workspace says `framework = "Next.js 15"`. The right framework appears automatically based on where the user is working.
- **Law firm:** Case-level variables (case number, judge, opposing counsel) cascade to every deposition project and task within that case. Set once, inherited everywhere.

### Not everything needs the full chain

Some entities naturally skip levels. A quick personal note doesn't need an org, workspace, or project — it's just user-scoped. A project can live directly under an org without a workspace. This is why all scope columns are nullable. The hierarchy is a tool, not a requirement.

---

## 16. Future Work

### Auto-population of standard context

A middleware or pre-request hook that automatically fetches the user's profile, current org, current project, and current task details and injects them as context — so the frontend doesn't need to send them explicitly.

### Default context on agents

Agents define `default_context` in their DB record — context that is always resolved even when the caller sends nothing. Useful for agents that always need the user's profile or org settings.

### Per-org context policies

Org admins define which context keys are always attached to any request made by their org's users. Enforced at the middleware layer.

### Scoped search tools

Tools like `search_notes(query, scope)`, `query_data(table_name, filter)`, `search_knowledge(query)` that use the active scope to constrain results. The infrastructure is ready (scope columns on all entities + `active_scope` in metadata).

### Variable versioning

Track changes to `context_variables` over time. Useful for audit trails and debugging why an agent behaved differently on two different runs.

### canvas_items.task_id migration

Convert the legacy `text` type `task_id` column to a proper `uuid` FK with data migration.

### Context variable templates

Pre-built sets of variables for common use cases. The real-world examples in Section 14 define the initial templates:

- **Law firm / client services** — `practice_area`, `jurisdiction_default`, `client_name`, `client_industry`, `case_number`, `opposing_counsel`
- **Marketing agency** — `brand_voice`, `target_audience`, `brand_colors`, `seo_tools`, `content_style`
- **Software engineering** — `tech_stack`, `coding_standards`, `git_workflow`, `framework`, `deployment_platform`
- **Academic / research** — `institution`, `department`, `citation_style`, `course_level`, `textbook`, `academic_tone`
- **Medical / clinical** — `institution`, `compliance_framework`, `irb_committee`, `protocol_number`, `principal_investigator`
- **E-commerce / DTC** — `brand_name`, `brand_voice`, `target_customer`, `product_category`, `email_platform`
- **Freelance / solo** — `response_style`, `hourly_rate`, `client_name`, `client_industry`, `client_budget`

These could be JSON objects stored in a `context_variable_templates` table or simply hardcoded as starter packs in the onboarding UI. When a user creates a new workspace for a client, they could select "Marketing Agency — Client" template and get the standard variable keys pre-populated with empty values to fill in.