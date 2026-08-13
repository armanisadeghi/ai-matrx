# AI Matrx — Agents Migration Status

> Living document tracking the migration from `prompts` + `prompt_builtins` → unified `agents` system.
> Database: `txzxabzwovsujtloxrus`

---

## 1. New Tables — Final Structure

### 1.1 `agents` — 29 columns

| Group | Columns |
|---|---|
| **Identity** | `id` uuid PK, `agent_type` text NOT NULL ('user'/'builtin'), `name` text NOT NULL, `description` text |
| **Prompt** | `messages` jsonb NOT NULL default [], `variable_definitions` jsonb |
| **Model** | `model_id` uuid FK→ai_model, `model_tiers` jsonb |
| **Settings** | `settings` jsonb NOT NULL default {}, `output_schema` jsonb |
| **Tools** | `tools` uuid[] NOT NULL default {}, `custom_tools` jsonb NOT NULL default [] |
| **Context** | `context_slots` jsonb NOT NULL default [] |
| **Organization** | `category` text, `tags` text[] NOT NULL default {} |
| **Status** | `is_active` bool, `is_archived` bool, `is_favorite` bool (`is_public` DROPPED 2026-08-12 — viewer-level access via `iam.has_access_for` replaces it) |
| **Ownership** | `created_by` uuid (`user_id` DROPPED 2026-08-12), `organization_id` FK, `task_id` FK |
| **Lineage** | `source_agent_id` uuid FK→agents (self-ref), `source_snapshot_at` timestamptz |
| **Versioning** | `version` int, `created_at`, `updated_at` |

### 1.2 `agent_versions` — 20 columns

Full-row snapshot: `id` PK, `agent_id` FK→agents CASCADE, `version_number`, snapshot of all versioned columns, `changed_at`, `change_note`. UNIQUE(agent_id, version_number).

### 1.3 `agent_shortcuts` — 24 columns

| Group | Columns |
|---|---|
| **Identity** | `id` uuid PK, `category_id` uuid FK→shortcut_categories CASCADE, `label` text NOT NULL, `description` text, `icon_name` text, `keyboard_shortcut` text, `sort_order` int default 0 |
| **Agent** | `agent_id` uuid FK→agents CASCADE |
| **Context & Scope** | `enabled_contexts` jsonb default ["general"], `scope_mappings` jsonb |
| **Execution** | `result_display` text default 'modal-full', `allow_chat` bool default true, `auto_run` bool default true, `apply_variables` bool default true, `show_variables` bool default false, `use_pre_execution_input` bool default false |
| **Status** | `is_active` bool NOT NULL default true |
| **Hierarchy** | `user_id` uuid, `organization_id` FK, `workspace_id` FK, `project_id` FK, `task_id` FK |
| **Timestamps** | `created_at`, `updated_at` |

**Visibility rules:**
- `user_id IS NULL AND organization_id IS NULL` → **System shortcut** (visible to everyone)
- `user_id = X` → **Personal shortcut** (visible to owner)
- `organization_id = X` → **Org shortcut** (visible to org members)
- `workspace_id / project_id / task_id` → **Scoped shortcut** (visible when that context is active)
- Sharing via `permissions` table → visible to granted users/orgs

**No auto_fill_hierarchy trigger.** Hierarchy columns are independently set — scoping to a task doesn't auto-fill project/workspace/org. Each level is explicit.

---

## 2. Triggers

### On `agents`
| Trigger | Timing | Events | Purpose |
|---|---|---|---|
| `trg_agents_set_initial_version` | BEFORE | INSERT | Sets version = 1 |
| `trg_agents_create_v1_snapshot` | AFTER | INSERT | Creates v1 in agent_versions |
| `trg_agents_snapshot_version` | BEFORE | UPDATE | Snapshots OLD, increments version |
| `trg_auto_fill_hierarchy_agents` | BEFORE | INSERT/UPDATE | Auto-fills org/workspace from project |
| `set_agents_updated_at` | BEFORE | UPDATE | Auto-updates updated_at |

### On `agent_shortcuts`
| Trigger | Timing | Events | Purpose |
|---|---|---|---|
| `set_agent_shortcuts_updated_at` | BEFORE | UPDATE | Auto-updates updated_at |

---

## 3. RLS Policies

### On `agents`
| Policy | Cmd | Rule |
|---|---|---|
| `agents_public_read` | SELECT | RETIRED — canonical `iam` policies own reads (`is_public` dropped 2026-08-12) |
| `agents_select` | SELECT | `check_resource_access('agents', ...)` |
| `agents_insert` | INSERT | `created_by = auth.uid()` (canonical std_* policies) |
| `agents_update` | UPDATE | `check_resource_access('agents', ..., 'editor')` |
| `agents_delete` | DELETE | Owner OR `check_resource_access('agents', ..., 'admin')` |

### On `agent_shortcuts`
| Policy | Cmd | Rule |
|---|---|---|
| `agent_shortcuts_system_read` | SELECT | `is_active AND user_id IS NULL AND org IS NULL` (anon + auth) |
| `agent_shortcuts_scoped_read` | SELECT | `is_active AND check_resource_access(...)` |
| `agent_shortcuts_insert` | INSERT | `user_id = auth.uid()` |
| `agent_shortcuts_system_insert` | INSERT | `user_id IS NULL AND is_admin()` |
| `agent_shortcuts_update` | UPDATE | `check_resource_access(..., 'editor')` |
| `agent_shortcuts_system_update` | UPDATE | System + `is_admin()` |
| `agent_shortcuts_delete` | DELETE | `check_resource_access(..., 'admin')` |
| `agent_shortcuts_system_delete` | DELETE | System + `is_admin()` |

---

## 4. RPCs — Implemented

### `get_agents_list()` — No params

**Agent list page fetch.** SECURITY INVOKER — RLS filters automatically, user sees only what they're allowed to. Returns lightweight rows ordered by `updated_at DESC`. All filtering (active, archived, category, tags, agent_type) is done client-side or via PostgREST query params.

**Returns:** `id`, `name`, `description`, `category`, `tags`, `agent_type`, `model_id`, `is_active`, `is_archived`, `is_favorite`, `source_agent_id`, `created_by`, `organization_id`, `created_at`, `updated_at`

---

### `duplicate_agent(agent_id uuid)` → `uuid`

**Duplicate an agent.** SECURITY DEFINER — verifies read access explicitly via `check_resource_access` (user may be duplicating a shared agent they don't own). Creates a copy with: name suffixed with `(Copy)`, `created_by` = current user (stamped by `_stamp_actor`), `agent_type` = `'user'` always, `source_agent_id` = original id, `source_snapshot_at` = now(), hierarchy cleared (user organizes later), `is_archived/is_favorite` reset to false. Access gate: viewer-level `iam.has_access_for` (2026-08-12). All other fields copied verbatim (tools, custom_tools, settings, messages, variable_definitions, context_slots, model_id, model_tiers, output_schema).

**Params:** `agent_id uuid`
**Returns:** new agent `uuid`

---

### `get_agent_execution_minimal(agent_id uuid)`

**Minimal execution payload.** For pages that don't allow configuration overrides before running. SECURITY INVOKER — RLS handles access.

**Params:** `agent_id uuid`
**Returns:** `id`, `variable_definitions`, `context_slots`

---

### `get_agent_execution_full(agent_id uuid)`

**Full execution payload.** For pages where the user can customize settings before running. Messages intentionally excluded — fetched separately at actual execution time (can be heavy). SECURITY INVOKER.

**Params:** `agent_id uuid`
**Returns:** `id`, `variable_definitions`, `model_id`, `settings`, `tools`, `custom_tools`, `context_slots`

---

### `get_agent_shortcuts_initial()`

**Phase 1 fetch.** Called once per session. Returns all system shortcuts + user's own + user's orgs' shortcuts. No parameters needed — uses `auth.uid()` internally.

Includes the 3 agent fields needed for execution inline via JOIN: `agent_id`, `variable_definitions`, `context_slots`.

System shortcuts hit a **covering index** — index-only scan, no heap access.

### `get_agent_shortcuts_for_context(workspace_id?, project_id?, task_id?)`

**Phase 2 fetch.** Called when user enters a workspace, project, or task. Also picks up shortcuts shared via the `permissions` table. Returns same fields plus the full hierarchy IDs.

### TypeScript Types

```typescript
/** Returned by get_agent_shortcuts_initial() */
export interface AgentShortcutInitial {
  // ── Shortcut identity ──
  shortcut_id: string;
  category_id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;

  // ── Agent reference ──
  agent_id: string | null;

  // ── Context & scope ──
  enabled_contexts: string[];        // e.g. ["general", "code-editor"]
  scope_mappings: Record<string, string> | null;
    // keys = scope keys (what the UI provides)
    // values = variable/context_slot names on the agent
    // e.g. { "selection": "news_content", "active_doc": "document" }

  // ── Execution behavior ──
  result_display: string;            // 'modal-full' | 'compact-modal' | 'flexible-panel' | 'inline' | etc.
  allow_chat: boolean;
  auto_run: boolean;
  apply_variables: boolean;
  show_variables: boolean;
  use_pre_execution_input: boolean;

  // ── Ownership (for UI grouping: "System" vs "Mine" vs "Org: X") ──
  shortcut_user_id: string | null;   // null = system shortcut
  shortcut_org_id: string | null;    // null = not org-scoped

  // ── Agent execution data (the 3 things needed to execute) ──
  agent_variable_definitions: VariableDefinition[] | null;
  agent_context_slots: ContextSlot[] | null;
}

/** Returned by get_agent_shortcuts_for_context() — extends initial with hierarchy */
export interface AgentShortcutContext extends AgentShortcutInitial {
  shortcut_workspace_id: string | null;
  shortcut_project_id: string | null;
  shortcut_task_id: string | null;
}

/** Variable definition on an agent (stored in agents.variable_definitions) */
export interface VariableDefinition {
  name: string;
  defaultValue: string;
  helpText?: string;
  required?: boolean;
  customComponent?: {
    type: 'textarea' | 'radio' | 'select' | 'checkbox' | 'toggle' | 'number' | 'text';
    options?: string[];
    allowOther?: boolean;
    toggleValues?: [string, string];
    min?: number;
    max?: number;
    step?: number;
  };
}

/** Context slot on an agent (stored in agents.context_slots) */
export interface ContextSlot {
  key: string;
  type: 'text' | 'file_url' | 'json' | 'image_url';
  label?: string;
  description?: string;
  max_inline_chars?: number;
  summary_agent_id?: string;
}
```

---

## 5. What's Done ✅

### Tables
- [x] `agents` — created, 384 rows migrated (335 user + 49 builtin)
- [x] `agent_versions` — created, empty (new versions will accumulate going forward)
- [x] `agent_shortcuts` — created, 29 system shortcuts migrated from prompt_shortcuts

### Data Integrity Verified
- [x] 0 model_id mismatches between old and new tables
- [x] `settings` cleaned — no `model_id` or `tools` keys remaining
- [x] `tools` uuid[] resolved from old string names — 24 agents have tool arrays
- [x] 48 builtins have `source_agent_id` lineage tracked
- [x] 26 shortcuts have valid agent references, 3 are agent-less (by design)

### Infrastructure
- [x] Triggers: versioning, updated_at, auto_fill_hierarchy (agents only)
- [x] RLS: full resource access policies on all 3 tables
- [x] Indexes: optimized for all query patterns, covering index for system shortcuts
- [x] RPCs: `get_agent_shortcuts_initial()` + `get_agent_shortcuts_for_context()`

---

## 6. What's Pending ⏳

### 6.1 Dependent Tables Needing FK Rewiring

| Table | Current FK(s) | Rows | Strategy |
|---|---|---|---|
| **`prompt_apps`** | `prompt_id` → prompts | 61 | Add `agent_id` FK→agents, rewire version refs to `agent_versions` |
| **`prompt_actions`** | `prompt_id` → prompts, `prompt_builtin_id` → builtins | 0 | Empty. Drop or recreate with single `agent_id` FK |
| **`prompt_versions`** | `prompt_id` → prompts | 610 | Archive. Keep during transition, drop after full cutover |
| **`prompt_builtin_versions`** | `builtin_id` → builtins | 70 | Archive. Same as above |
| **`system_prompts`** | `source_prompt_id` → prompts | 24 | Likely deprecated. Repoint or drop FK |
| **`system_prompts_new`** | `source_prompt_id` → prompts | 24 | Same as above |

### 6.2 RPCs Needing Agents-Table Versions

#### Simplification candidates (UNION queries → single table)

| Old Function | Purpose | New Behavior |
|---|---|---|
| `get_agent_core_batch(uuid[], text[])` | Batch fetch from both tables by ID + source type | Single query: `SELECT FROM agents WHERE id = ANY(ids)` |
| `get_agent_operational(uuid, text)` | Returns variable_defaults, dynamic_model, settings | Single row: `SELECT variable_definitions, model_tiers, settings FROM agents` |
| `get_agents_for_chat(int, uuid?)` | Minimal agent list for chat UI | Single query with cursor pagination on agents |

#### Lineage/drift management

| Old Function | Purpose | New Behavior |
|---|---|---|
| `convert_prompt_to_builtin(uuid, uuid?)` | Copy prompt → builtin with source tracking | `INSERT INTO agents SELECT ... WHERE id = X` with `agent_type = 'builtin'`, `source_agent_id = X` |
| `update_builtin_from_source(uuid)` | Re-sync builtin from source prompt | Self-join: `UPDATE agents SET ... FROM agents source WHERE source.id = agents.source_agent_id` |
| `update_builtins_from_prompt(uuid)` | Update all builtins linked to a prompt | Same pattern, `WHERE source_agent_id = p_agent_id` |
| `check_builtin_drift(uuid?)` | Compare builtin to source timestamps | Self-join: `WHERE source_agent_id IS NOT NULL AND source.updated_at > a.source_snapshot_at` |

#### Prompt apps

| Old Function | Purpose | New Behavior |
|---|---|---|
| `get_prompt_app_execution_payload(uuid)` | Build execution payload for apps | Look up agent from `agents`, version from `agent_versions` |
| `check_prompt_app_drift(uuid?)` | Check if apps are behind source version | Compare against `agents.version` |
| `pin_prompt_app_to_version(uuid, uuid)` | Pin app to specific version | Look up in `agent_versions` |
| `promote_version(text, uuid, int)` | Restore previous version | Single path: read `agent_versions`, write `agents` |
| `get_published_app_with_prompt(text?, uuid?)` | App + full prompt data | Join to `agents` instead of prompts |

#### Shortcuts/context menu

| Old Function | Purpose | New Behavior |
|---|---|---|
| `get_prompt_execution_data(uuid)` | Shortcut + builtin data for execution | **Replaced by `get_agent_shortcuts_initial()`** — already includes agent execution data |
| `build_category_hierarchy(text[])` | Nested category menu with builtins | Read from `agent_shortcuts` + `agents WHERE agent_type = 'builtin'` |

#### Sharing/access

| Old Function | Purpose | New Behavior |
|---|---|---|
| `get_prompt_access_level(uuid)` | User's access level for a prompt | Read from `agents` + check_resource_access |
| `get_prompts_shared_with_me()` | All prompts shared with current user | Query `agents` via permissions table |

### 6.3 Views Needing Rebuild

| View | References | Strategy |
|---|---|---|
| `prompt_builtins_with_source_view` | builtins + prompts | Rebuild as self-join on `agents` via `source_agent_id` |
| `context_menu_unified_view` | builtins + shortcuts | Rebuild to read `agent_shortcuts` + `agents` |
| `shortcuts_by_placement_view` | builtins + shortcuts | Rebuild to read `agent_shortcuts` + `agents` |

---

## 7. Key Design Decisions (Reference)

**`settings`** contains all execution config (temperature, reasoning_effort, stream, output_format, etc.). Validated against `ai_model.controls` at runtime. Runtime overrides temporarily replace individual keys for a single execution.

**`model_id`** is a proper FK column, NOT inside settings. No sync trigger needed.

**`tools`** is `uuid[]` referencing `tools.id`. No junction table. Array position = order. `custom_tools` jsonb holds inline definitions.

**`model_tiers`** replaces `dynamic_model` boolean. null = fixed model. JSON = tiered recommendations with default tier.

**`variable_definitions`** (renamed from `variable_defaults`) = static string substitution at build time.

**`context_slots`** = live runtime data accessed via `ctx_get` tools during execution.

**`scope_mappings`** keys serve double duty as the list of available scopes (old `available_scopes` column was dropped as redundant). Variable names and context slot keys must not collide within an agent.

**`agent_shortcuts` hierarchy** is independently set per column — no auto_fill. A shortcut scoped to a task is ONLY for that task. Duplicate shortcuts (pointing to the same agent) for multi-context availability.

**Sharing** uses the existing `permissions` table with `resource_type = 'agent_shortcuts'` or `'agents'`. No custom visibility system.
