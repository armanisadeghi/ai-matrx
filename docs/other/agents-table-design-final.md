# AI Matrx — `agents` Table Design (Final)

> **Historical design narrative.** Its SQL predates the June 2026 schema split;
> retired tool-table names below are preserved only to document that proposal.
> Live tool contracts are in `tool.definition`.

> This document defines the ideal unified `agents` table that replaces
> `prompts` and `prompt_builtins`, along with the supporting `agent_tools`
> junction table and unified `agent_versions` table.

---

## 1. The `agents` Table

```sql
CREATE TABLE public.agents (
  -- ═══════════════════════════════════════════════════════════════════════
  -- IDENTITY
  -- ═══════════════════════════════════════════════════════════════════════
  id                    uuid            NOT NULL DEFAULT gen_random_uuid(),
  agent_type            text            NOT NULL DEFAULT 'user',
  name                  text            NOT NULL,
  description           text,

  -- ═══════════════════════════════════════════════════════════════════════
  -- THE PROMPT
  -- ═══════════════════════════════════════════════════════════════════════
  messages              jsonb           NOT NULL DEFAULT '[]'::jsonb,
  variable_definitions  jsonb,

  -- ═══════════════════════════════════════════════════════════════════════
  -- MODEL
  -- ═══════════════════════════════════════════════════════════════════════
  model_id              uuid,
  model_overrides       jsonb           NOT NULL DEFAULT '{}'::jsonb,
  model_tiers           jsonb,

  -- ═══════════════════════════════════════════════════════════════════════
  -- OUTPUT
  -- ═══════════════════════════════════════════════════════════════════════
  output_format         text,
  output_schema         jsonb,

  -- ═══════════════════════════════════════════════════════════════════════
  -- CONTEXT
  -- ═══════════════════════════════════════════════════════════════════════
  context_slots         jsonb           NOT NULL DEFAULT '[]'::jsonb,

  -- ═══════════════════════════════════════════════════════════════════════
  -- ORGANIZATION
  -- ═══════════════════════════════════════════════════════════════════════
  category              text,
  tags                  text[]          NOT NULL DEFAULT '{}'::text[],

  -- ═══════════════════════════════════════════════════════════════════════
  -- VISIBILITY & STATUS
  -- ═══════════════════════════════════════════════════════════════════════
  is_active             boolean         NOT NULL DEFAULT true,
  is_public             boolean         NOT NULL DEFAULT false,
  is_archived           boolean         NOT NULL DEFAULT false,
  is_favorite           boolean         NOT NULL DEFAULT false,

  -- ═══════════════════════════════════════════════════════════════════════
  -- OWNERSHIP & HIERARCHY
  -- ═══════════════════════════════════════════════════════════════════════
  user_id               uuid,
  organization_id       uuid,
  workspace_id          uuid,
  project_id            uuid,
  task_id               uuid,

  -- ═══════════════════════════════════════════════════════════════════════
  -- LINEAGE
  -- ═══════════════════════════════════════════════════════════════════════
  source_agent_id       uuid,
  source_snapshot_at    timestamptz,

  -- ═══════════════════════════════════════════════════════════════════════
  -- VERSIONING & TIMESTAMPS
  -- ═══════════════════════════════════════════════════════════════════════
  version               integer         NOT NULL DEFAULT 1,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),

  -- ═══════════════════════════════════════════════════════════════════════
  -- CONSTRAINTS
  -- ═══════════════════════════════════════════════════════════════════════
  CONSTRAINT agents_pkey PRIMARY KEY (id),
  CONSTRAINT agents_type_check CHECK (agent_type IN ('user', 'builtin')),
  CONSTRAINT agents_model_fk FOREIGN KEY (model_id)
    REFERENCES public.ai_model(id) ON DELETE SET NULL,
  CONSTRAINT agents_source_fk FOREIGN KEY (source_agent_id)
    REFERENCES public.agents(id) ON DELETE SET NULL,
  CONSTRAINT agents_org_fk FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT agents_workspace_fk FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id) ON DELETE SET NULL,
  CONSTRAINT agents_project_fk FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE SET NULL,
  CONSTRAINT agents_task_fk FOREIGN KEY (task_id)
    REFERENCES public.tasks(id) ON DELETE SET NULL
);
```

---

## 2. Column-by-Column Rationale

### Identity

| Column | Type | Why |
|---|---|---|
| `id` | uuid PK | Same UUIDs from old tables — zero collisions confirmed |
| `agent_type` | text, CHECK `('user','builtin')` | Text not boolean for extensibility. Indexed for filtered queries. Could add `'template'`, `'system'` later |
| `name` | text NOT NULL | Upgraded from varchar. Builtins required NOT NULL; promoting to all agents |
| `description` | text | Optional for both types |

### The Prompt

| Column | Type | Why |
|---|---|---|
| `messages` | jsonb NOT NULL DEFAULT '[]' | The prompt message array. Always present, can be empty |
| `variable_definitions` | jsonb | **Renamed from `variable_defaults`**. Array of `{name, defaultValue, helpText, required, customComponent}`. These are definitions of what the variables are, not just their defaults |

### Model

| Column | Type | Why |
|---|---|---|
| `model_id` | uuid FK→ai_model | **THE model reference. First-class FK, not buried in JSON.** Bi-directional sync trigger keeps it aligned with `model_overrides.model_id` for backward compat during transition |
| `model_overrides` | jsonb DEFAULT '{}' | **All settings that get passed to the model API or influence execution.** This is the unified blob: `temperature`, `reasoning_effort`, `stream`, `file_urls`, `include_thoughts`, `verbosity` — everything. Validated against `ai_model.controls` at execution time. No artificial split between "model params" and "behavior" because the backend consumes them identically |
| `model_tiers` | jsonb | **Replaces `dynamic_model` boolean.** See §3 |

### Output

| Column | Type | Why |
|---|---|---|
| `output_format` | text | `'text'`, `'json_object'`, `'json_schema'`. Direct column, no sync trigger needed — UI reads/writes it directly |
| `output_schema` | jsonb | JSON Schema definition when `output_format = 'json_schema'` |

### Context

| Column | Type | Why |
|---|---|---|
| `context_slots` | jsonb DEFAULT '[]' | Array of `ContextSlot` objects (see §4). Pre-defined named context items with types, labels, truncation rules, and summary agent references. Distinct from `variable_definitions`: variables are string-substituted into messages at build time, context slots are live runtime data the agent accesses via tools during execution |

### Organization

| Column | Type | Why |
|---|---|---|
| `category` | text | Free-text category. Could become FK to a categories table later |
| `tags` | text[] DEFAULT '{}' | GIN-indexed for search |

### Visibility & Status

| Column | Type | Why |
|---|---|---|
| `is_active` | boolean DEFAULT true | Soft-disable without archiving. Applies to all types (was builtins-only) |
| `is_public` | boolean DEFAULT false | Publicly visible/shareable. Applies to all types (was prompts-only) |
| `is_archived` | boolean DEFAULT false | User hides from active views |
| `is_favorite` | boolean DEFAULT false | User pins to favorites |

### Ownership & Hierarchy

| Column | Type | Why |
|---|---|---|
| `user_id` | uuid | Creator/owner for ALL agent types. Unifies `user_id` (prompts) and `created_by_user_id` (builtins) |
| `organization_id` | uuid FK | Standard hierarchy |
| `workspace_id` | uuid FK | Standard hierarchy |
| `project_id` | uuid FK | Standard hierarchy |
| `task_id` | uuid FK | Standard hierarchy |

### Lineage

| Column | Type | Why |
|---|---|---|
| `source_agent_id` | uuid FK→agents (self-ref) | **Universal lineage tracking.** Covers all scenarios: builtin cloned from user prompt, user duplicated their own prompt, someone shared a prompt and recipient forked it, template instantiation. ON DELETE SET NULL so deleting the source doesn't cascade |
| `source_snapshot_at` | timestamptz | When the snapshot was taken from the source. Used by drift detection RPCs |

### Versioning & Timestamps

| Column | Type | Why |
|---|---|---|
| `version` | integer DEFAULT 1 | Current version counter. Incremented by snapshot trigger |
| `created_at` | timestamptz DEFAULT now() | |
| `updated_at` | timestamptz DEFAULT now() | Auto-updated by trigger |

---

## 3. Model Tiers (replaces `dynamic_model`)

Instead of a boolean "can the user change the model?", the creator specifies
recommended models by tier. The UI shows these as suggestions. The user can
always override to any model, but the tier badges signal intent.

```jsonc
// model_tiers — nullable. When null, the agent has a single fixed model.
// When present, offers tiered recommendations:
{
  "default": "fast",          // which tier is pre-selected
  "tiers": {
    "fast": {
      "model_id": "548126f2-...",   // GPT-4.1 Mini
      "label": "Fast & cheap"       // optional display label
    },
    "balanced": {
      "model_id": "5970727c-...",   // Claude Sonnet 4.6
      "label": "Best balance"
    },
    "premium": {
      "model_id": "c6539f9a-...",   // Claude Opus 4.6
      "label": "Maximum quality"
    }
  }
}

// Minimal version — just signal "any model is fine":
{
  "default": "any",
  "flexible": true
}
```

**Rules:**
- `model_tiers = NULL` → single model, `model_id` is the one to use
- `model_tiers` present → UI shows tier selector, `model_id` holds the currently active selection
- `model_tiers.tiers[tier].model_id` values are ai_model references (not FKs — these are recommendations, not constraints)
- The `model_id` column is always the *resolved* model that will actually be used at execution time

---

## 4. Context Slots (for reference)

Stored in `context_slots` jsonb column. Each slot:

```jsonc
{
  "key": "document",                     // unique within agent
  "type": "text",                        // text | file_url | json | image_url
  "label": "Source Document",            // display label
  "description": "The document to analyze",
  "max_inline_chars": 4000,             // truncate in system message, agent uses ctx_get for full
  "summary_agent_id": "uuid-of-summarizer" // enables ctx_get(mode="summary")
}
```

**Slot vs Variable:**
- **Variable** (`variable_definitions`): Static string substitution at prompt build time. User fills in a form field, value is injected into `{{variable_name}}` in messages. Done before the API call.
- **Context slot** (`context_slots`): Live runtime data. Listed in system message as available context. Agent accesses via `ctx_get` tool during execution. Stays fresh across conversation turns. Supports pagination and summarization.

---

## 5. The `agent_tools` Junction Table

```sql
CREATE TABLE public.agent_tools (
  agent_id    uuid        NOT NULL,
  tool_id     uuid        NOT NULL,
  sort_order  smallint    NOT NULL DEFAULT 0,
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT agent_tools_pkey PRIMARY KEY (agent_id, tool_id),
  CONSTRAINT agent_tools_agent_fk FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_tools_tool_fk FOREIGN KEY (tool_id)
    REFERENCES public.tools(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_tools_tool ON public.agent_tools(tool_id);
```

| Column | Why |
|---|---|
| `agent_id` + `tool_id` | Composite PK. An agent has many tools, a tool can be on many agents |
| `sort_order` | Controls tool presentation order in UI and tool list sent to model |
| `config` | Per-agent tool configuration overrides (e.g., custom parameters, scoping) |

**Migration**: `settings.tools` string array gets resolved to `agent_tools` rows by matching `tools.name`. The 3 legacy rows with top-level `tools` column data also get migrated here.

**Query patterns:**
- "Get all tools for agent X": `SELECT t.* FROM tools t JOIN agent_tools at ON at.tool_id = t.id WHERE at.agent_id = X ORDER BY at.sort_order`
- "Which agents use tool Y?": `SELECT a.* FROM agents a JOIN agent_tools at ON at.agent_id = a.id WHERE at.tool_id = Y`

---

## 6. The `agent_versions` Table

```sql
CREATE TABLE public.agent_versions (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid(),
  agent_id              uuid            NOT NULL,
  version_number        integer         NOT NULL,

  -- Full snapshot of versioned columns
  agent_type            text,
  name                  text,
  description           text,
  messages              jsonb,
  variable_definitions  jsonb,
  model_id              uuid,
  model_overrides       jsonb,
  model_tiers           jsonb,
  output_format         text,
  output_schema         jsonb,
  context_slots         jsonb,
  category              text,
  tags                  text[],
  is_active             boolean,

  -- Snapshot of tools at this version (denormalized from agent_tools)
  tools_snapshot        jsonb,
  -- Format: [{"tool_id": "uuid", "tool_name": "web_search", "sort_order": 0, "config": {}}]

  -- Version metadata
  changed_at            timestamptz     NOT NULL DEFAULT now(),
  change_note           text,

  CONSTRAINT agent_versions_pkey PRIMARY KEY (id),
  CONSTRAINT agent_versions_agent_fk FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_versions_unique UNIQUE (agent_id, version_number)
);

CREATE INDEX idx_agent_versions_agent ON public.agent_versions(agent_id, version_number DESC);
```

**Key design note**: `tools_snapshot` is a denormalized JSONB array capturing the tool assignments at version time. Since `agent_tools` is a junction table, we can't FK-snapshot it — we serialize it. This means version history always knows exactly which tools were assigned, even if tools are later renamed or deleted.

---

## 7. What Was Removed

| Old Column/Concept | Disposition |
|---|---|
| `prompts.tools` (jsonb) | **Dropped.** Dead column. 3 rows migrated to `agent_tools` |
| `prompt_builtins.tools` (jsonb) | **Dropped.** Completely unused |
| `settings.model_id` | **Promoted** to `model_id` column. No longer in JSON |
| `settings.tools` | **Promoted** to `agent_tools` junction. No longer in JSON |
| `settings.output_format` | **Promoted** to `output_format` column. No longer in JSON |
| `settings.*` (all other keys) | **Moved** to `model_overrides` |
| `dynamic_model` | **Replaced** by `model_tiers` |
| `created_by_user_id` | **Merged** into `user_id` |
| `source_prompt_id` | **Renamed** to `source_agent_id` (self-ref) |
| `prompt_versions` table | **Replaced** by `agent_versions` |
| `prompt_builtin_versions` table | **Replaced** by `agent_versions` |

---

## 8. What `model_overrides` Contains

Everything that was in `settings` minus the things that got their own columns:

```jsonc
// model_overrides — what gets passed to/validated against the model API
{
  // Common chat params
  "temperature": 0.7,
  "top_p": 1,
  "max_output_tokens": 8000,
  "stream": true,
  "store": true,

  // Reasoning
  "reasoning_effort": "high",
  "reasoning_summary": "always",
  "thinking_budget": 10000,
  "include_thoughts": true,

  // Google features
  "file_urls": true,
  "image_urls": true,
  "youtube_videos": true,
  "internal_web_search": true,
  "internal_url_context": true,

  // OpenAI features
  "parallel_tool_calls": true,

  // TTS
  "tts_voice": "kore",
  "audio_format": "wav",
  "multi_speaker": true,

  // Platform behavior
  "verbosity": "medium"
}
```

**NOT in model_overrides** (they have their own columns now):
- `model_id` → `agents.model_id`
- `tools` → `agent_tools` junction
- `output_format` → `agents.output_format`

---

## 9. Indexes

```sql
-- Type filtering (most common query pattern)
CREATE INDEX idx_agents_type ON public.agents(agent_type);

-- User's agents
CREATE INDEX idx_agents_user ON public.agents(user_id) WHERE user_id IS NOT NULL;

-- Builtin listing (active, sorted by creation)
CREATE INDEX idx_agents_builtin_active ON public.agents(is_active, created_at DESC)
  WHERE agent_type = 'builtin';

-- Hierarchy
CREATE INDEX idx_agents_org ON public.agents(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_agents_workspace ON public.agents(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_agents_project ON public.agents(project_id) WHERE project_id IS NOT NULL;

-- Search & filtering
CREATE INDEX idx_agents_category ON public.agents(category) WHERE category IS NOT NULL;
CREATE INDEX idx_agents_tags ON public.agents USING gin(tags);
CREATE INDEX idx_agents_model ON public.agents(model_id) WHERE model_id IS NOT NULL;

-- Status flags (partial indexes for common filters)
CREATE INDEX idx_agents_public ON public.agents(is_public) WHERE is_public = true;
CREATE INDEX idx_agents_archived ON public.agents(is_archived) WHERE is_archived = true;
CREATE INDEX idx_agents_favorite ON public.agents(is_favorite) WHERE is_favorite = true;

-- Lineage
CREATE INDEX idx_agents_source ON public.agents(source_agent_id)
  WHERE source_agent_id IS NOT NULL;

-- Model overrides (for querying by specific settings)
CREATE INDEX idx_agents_overrides ON public.agents USING gin(model_overrides);
```

---

## 10. Triggers

```
BEFORE INSERT:
  trg_agents_set_initial_version    → NEW.version := 1

BEFORE INSERT OR UPDATE:
  trg_agents_sync_model_id          → bi-directional model_id ↔ model_overrides.model_id
  trg_auto_fill_hierarchy           → standard hierarchy auto-fill

BEFORE UPDATE:
  trg_agents_snapshot_version       → snapshot OLD to agent_versions, increment version
  trg_agents_updated_at             → NEW.updated_at := now()

AFTER INSERT:
  trg_agents_create_v1_snapshot     → insert version 1 into agent_versions
```

The `sync_model_id` trigger can be simplified since we're starting fresh:
- On INSERT: if `model_id` is set, ensure `model_overrides` doesn't contradict
- On UPDATE: if `model_id` changed, done (it's the source of truth now)
- Backward compat: if something writes `model_overrides.model_id`, sync to column

---

## 11. RLS Policies

```sql
-- Builtins: anyone can read, only admins can write
CREATE POLICY agents_builtin_select ON agents FOR SELECT
  USING (agent_type = 'builtin');

CREATE POLICY agents_builtin_insert ON agents FOR INSERT
  WITH CHECK (agent_type = 'builtin' AND is_admin());

CREATE POLICY agents_builtin_update ON agents FOR UPDATE
  USING (agent_type = 'builtin' AND is_admin())
  WITH CHECK (is_admin());

CREATE POLICY agents_builtin_delete ON agents FOR DELETE
  USING (agent_type = 'builtin' AND is_admin());

-- User agents: standard owner/permission model
CREATE POLICY agents_user_select ON agents FOR SELECT
  USING (
    agent_type = 'user' AND (
      user_id = auth.uid()
      OR has_permission('agent', id, 'viewer')
    )
  );

CREATE POLICY agents_user_insert ON agents FOR INSERT
  WITH CHECK (agent_type = 'user' AND user_id = auth.uid());

CREATE POLICY agents_user_update ON agents FOR UPDATE
  USING (
    agent_type = 'user' AND (
      user_id = auth.uid()
      OR has_permission('agent', id, 'editor')
    )
  );

CREATE POLICY agents_user_delete ON agents FOR DELETE
  USING (
    agent_type = 'user' AND (
      user_id = auth.uid()
      OR has_permission('agent', id, 'admin')
    )
  );
```

---

## 12. Migration Summary

```
OLD                          →  NEW
─────────────────────────────────────────────────
prompts                      →  agents (agent_type = 'user')
prompt_builtins              →  agents (agent_type = 'builtin')
prompt_versions              →  agent_versions
prompt_builtin_versions      →  agent_versions
settings.model_id            →  agents.model_id
settings.tools               →  agent_tools junction
settings.output_format       →  agents.output_format
settings.* (remainder)       →  agents.model_overrides
variable_defaults            →  variable_definitions (rename only)
dynamic_model                →  model_tiers (null = fixed model)
user_id / created_by_user_id →  user_id
source_prompt_id             →  source_agent_id
tools (jsonb column)         →  DROPPED (dead)
```
