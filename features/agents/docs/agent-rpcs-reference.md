# AI Matrx — Agent Version & RPC Reference

---

## 1. Version Architecture

### The Two Tables

`**agents**` — The live table. One row per agent. Always holds the current active version's data. 99% of the app reads from here.

`**agent_versions**` — The complete history. Every save creates a version row. Each row is a full snapshot — independently addressable and executable.

### How Versions Work

```
User creates agent    → agents row (version=1) + agent_versions row (version_number=1)
User edits agent      → agents row updated + NEW state → agent_versions as version N
                        agents.version = N
Promote version 3     → version 3's data copied onto agents row, agents.version = 3
                        NO new version row (trigger skipped via session flag)
```

`agents.version` always equals the `version_number` of the matching row in `agent_versions`.

### Version Trigger Behavior

- **AFTER INSERT**: Snapshots NEW row to agent_versions as version 1
- **BEFORE UPDATE**: Snapshots the **NEW** state (post-edit) to agent_versions, sets `agents.version` = new version_number
- **Skip flag**: `SET LOCAL app.skip_version_snapshot = 'true'` bypasses the trigger (used by `promote_agent_version`)
- **Change note**: `SET LOCAL app.change_note = 'description'` attaches a note to the version

---

## 2. The Universal Version Reference Pattern

When Thing A references a versioned agent, it uses 3 columns:

```
agent_id           uuid FK → agents           -- stable identity (display, drift detection)
agent_version_id   uuid FK → agent_versions   -- the specific version snapshot (for pinned execution)
use_latest         boolean DEFAULT false       -- true = always resolve to live agent
```

No `pinned_version` integer column. The version number is derived from `agent_versions.version_number` via the `agent_version_id` join when needed (e.g., drift detection). This eliminates sync risk between redundant columns.

### Resolution Logic (handled inside RPCs)

```
1. use_latest = true                                    → return agent_id,         is_version = false
2. agent_versions.version_number >= agents.version      → return agent_id,         is_version = false
3. agent_versions.version_number < agents.version       → return agent_version_id, is_version = true
```

**The UI receives:** `resolved_id` (one UUID) + `is_version` (one boolean) + `is_behind` (one boolean).
**The backend receives:** `resolved_id` + `is_version` → one `if` to pick the table.

### Drift Detection

```
use_latest = true:   Never behind. No notification.
use_latest = false:  agents.version > agent_versions.version_number → is_behind = true
```

---

## 3. All RPCs — Quick Reference


| #   | RPC                               | Args                          | Returns                 | Purpose                       |
| --- | --------------------------------- | ----------------------------- | ----------------------- | ----------------------------- |
| 1   | `get_agents_list`                 | —                             | TABLE (18 cols)         | Page display                  |
| 2   | `get_agent_execution_minimal`     | `agent_id`                    | TABLE (3 cols)          | Execute without overrides     |
| 3   | `get_agent_execution_full`        | `agent_id`                    | TABLE (7 cols)          | Execute with customization    |
| 4   | `duplicate_agent`                 | `agent_id`                    | uuid                    | Copy an agent                 |
| 5   | `promote_agent_version`           | `agent_id, version_number`    | jsonb                   | Make past version live        |
| 6   | `get_agent_shortcuts_initial`     | —                             | TABLE (27 cols)         | Session load with resolution  |
| 7   | `get_agent_shortcuts_for_context` | `workspace?, project?, task?` | TABLE (30 cols)         | Context fetch with resolution |
| 8   | `build_agent_shortcut_menu`       | `placement_types[]`           | TABLE (2: type + jsonb) | Full nested menu              |
| 9   | `check_agent_drift`               | `agent_id?`                   | TABLE (8 cols)          | What's behind?                |
| 10  | `check_agent_references`          | `agent_id`                    | TABLE (5 cols)          | What uses this agent?         |
| 11  | `accept_agent_version`            | `type, ref_id`                | jsonb                   | Accept latest version         |
| 12  | `update_agent_from_source`        | `agent_id`                    | jsonb                   | Reset to source agent         |


---

## 4. TypeScript Types

### Resolved Shortcut (from `get_agent_shortcuts_initial`)

```typescript
interface AgentShortcutInitial {
  shortcut_id: string;
  category_id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;

  // ── Resolved reference ──
  resolved_id: string | null;       // ONE id for execution
  is_version: boolean;              // false = agents table, true = agent_versions table
  is_behind: boolean;               // true = newer version exists

  // ── Raw reference data (for drift UI) ──
  agent_id: string | null;
  agent_version_id: string | null;
  current_version: number | null;
  use_latest: boolean;

  // ── Shortcut config ──
  enabled_contexts: string[];
  scope_mappings: Record<string, string> | null;
  result_display: string;
  allow_chat: boolean;
  auto_run: boolean;
  apply_variables: boolean;
  show_variables: boolean;
  use_pre_execution_input: boolean;

  // ── Ownership ──
  shortcut_user_id: string | null;
  shortcut_org_id: string | null;

  // ── Agent data (FROM THE RESOLVED VERSION) ──
  agent_name: string | null;
  agent_variable_definitions: VariableDefinition[] | null;
  agent_context_slots: ContextSlot[] | null;
}
```

### Context Shortcut (extends initial)

```typescript
interface AgentShortcutContext extends AgentShortcutInitial {
  shortcut_workspace_id: string | null;
  shortcut_project_id: string | null;
  shortcut_task_id: string | null;
}
```

### Menu Structure (from `build_agent_shortcut_menu`)

```typescript
interface AgentShortcutMenuResult {
  placement_type: string;
  menu_data: AgentShortcutCategory[];
}

interface AgentShortcutCategory {
  category: {
    id: string;
    label: string;
    description: string | null;
    icon_name: string | null;
    color: string | null;
    sort_order: number;
    parent_category_id: string | null;
    enabled_contexts: string[] | null;
  };
  shortcuts: AgentShortcutMenuItem[];
}

interface AgentShortcutMenuItem {
  id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;
  resolved_id: string | null;
  is_version: boolean;
  is_behind: boolean;
  agent_id: string | null;
  use_latest: boolean;
  scope_mappings: Record<string, string> | null;
  enabled_contexts: string[];
  result_display: string;
  auto_run: boolean;
  allow_chat: boolean;
  show_variables: boolean;
  apply_variables: boolean;
  use_pre_execution_input: boolean;
  agent: {
    name: string;
    variable_definitions: VariableDefinition[] | null;
    context_slots: ContextSlot[] | null;
  } | null;
}
```

### Drift & References

```typescript
interface AgentDriftItem {
  reference_type: 'shortcut' | 'app' | 'derived_agent';
  reference_id: string;
  reference_name: string;
  agent_id: string;
  agent_name: string;
  version_pinned_to: number;
  current_version: number;
  versions_behind: number;
}

interface AgentReference {
  reference_type: 'shortcut' | 'app' | 'derived_agent';
  reference_id: string;
  reference_name: string;
  use_latest: boolean;
  is_behind: boolean;
}
```

### Agent Core

```typescript
interface AgentListItem {
  id: string;
  agent_type: 'user' | 'builtin';
  name: string;
  description: string | null;
  model_id: string | null;
  category: string | null;
  tags: string[];
  is_active: boolean;
  is_archived: boolean;
  is_favorite: boolean;
  user_id: string | null;
  organization_id: string | null;
  workspace_id: string | null;
  project_id: string | null;
  task_id: string | null;
  source_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentExecutionMinimal {
  id: string;
  variable_definitions: VariableDefinition[] | null;
  context_slots: ContextSlot[] | null;
}

interface AgentExecutionFull {
  id: string;
  variable_definitions: VariableDefinition[] | null;
  model_id: string | null;
  settings: Record<string, any>;
  tools: string[];
  custom_tools: CustomTool[];
  context_slots: ContextSlot[] | null;
}

interface PromoteVersionResult {
  success: boolean;
  error?: string;
  promoted_version?: number;
  agent_id?: string;
}

interface UpdateFromSourceResult {
  success: boolean;
  error?: string;
  source_version?: number;
  agent_name?: string;
}

interface AcceptVersionResult {
  success: boolean;
  error?: string;
  reference_type?: string;
  reference_id?: string;
  accepted_version?: number;
}
```

### Shared Types

```typescript
interface VariableDefinition {
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

interface ContextSlot {
  key: string;
  type: 'text' | 'file_url' | 'json' | 'image_url';
  label?: string;
  description?: string;
  max_inline_chars?: number;
  summary_agent_id?: string;
}

interface CustomTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  output_schema?: Record<string, any>;
  function_path?: string;
}
```

---

## 5. Backend Resolution

```python
def load_agent_for_execution(resolved_id: str, is_version: bool = False):
    if is_version:
        return db.query("SELECT * FROM agent_versions WHERE id = %s", resolved_id)
    return db.query("SELECT * FROM agents WHERE id = %s", resolved_id)
```

---

## 6. `agent_shortcuts` Final Column List (26 columns)

```
id, category_id, label, description, icon_name, keyboard_shortcut, sort_order,
agent_id, agent_version_id, use_latest,
enabled_contexts, scope_mappings,
result_display, allow_chat, auto_run, apply_variables, show_variables, use_pre_execution_input,
is_active,
user_id, organization_id, workspace_id, project_id, task_id,
created_at, updated_at
```

```sql
create table public.agents (
  id uuid not null default gen_random_uuid (),
  agent_type text not null default 'user'::text,
  name text not null,
  description text null,
  messages jsonb not null default '[]'::jsonb,
  variable_definitions jsonb null,
  model_id uuid null,
  model_tiers jsonb null,
  settings jsonb not null default '{}'::jsonb,
  output_schema jsonb null,
  tools uuid[] not null default '{}'::uuid[],
  custom_tools jsonb not null default '[]'::jsonb,
  context_slots jsonb not null default '[]'::jsonb,
  category text null,
  tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  is_archived boolean not null default false,
  is_favorite boolean not null default false,
  user_id uuid null,
  organization_id uuid null,
  workspace_id uuid null,
  project_id uuid null,
  task_id uuid null,
  source_agent_id uuid null,
  source_snapshot_at timestamp with time zone null,
  version integer not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint agents_pkey primary key (id),
  constraint agents_org_fk foreign KEY (organization_id) references organizations (id) on delete set null,
  constraint agents_project_fk foreign KEY (project_id) references projects (id) on delete set null,
  constraint agents_source_fk foreign KEY (source_agent_id) references agents (id) on delete set null,
  constraint agents_task_fk foreign KEY (task_id) references tasks (id) on delete set null,
  constraint agents_workspace_fk foreign KEY (workspace_id) references workspaces (id) on delete set null,
  constraint agents_model_fk foreign KEY (model_id) references ai_model (id) on delete set null,
  constraint agents_type_check check (
    (
      agent_type = any (array['user'::text, 'builtin'::text])
    )
  )
) TABLESPACE pg_default;

create table public.agent_versions (
  id uuid not null default gen_random_uuid (),
  agent_id uuid not null,
  version_number integer not null,
  agent_type text null,
  name text null,
  description text null,
  messages jsonb null,
  variable_definitions jsonb null,
  model_id uuid null,
  model_tiers jsonb null,
  settings jsonb null,
  output_schema jsonb null,
  tools uuid[] null,
  custom_tools jsonb null,
  context_slots jsonb null,
  category text null,
  tags text[] null,
  is_active boolean null,
  changed_at timestamp with time zone not null default now(),
  change_note text null,
  constraint agent_versions_pkey primary key (id),
  constraint agent_versions_unique unique (agent_id, version_number),
  constraint agent_versions_agent_fk foreign KEY (agent_id) references agents (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.agent_shortcuts (
  id uuid not null default gen_random_uuid (),
  category_id uuid not null,
  label text not null,
  description text null,
  icon_name text null,
  keyboard_shortcut text null,
  sort_order integer not null default 0,
  agent_id uuid null,
  enabled_contexts jsonb null default '["general"]'::jsonb,
  scope_mappings jsonb null,
  result_display text null default 'modal-full'::text,
  allow_chat boolean null default true,
  auto_run boolean null default true,
  apply_variables boolean null default true,
  show_variables boolean null default false,
  use_pre_execution_input boolean null default false,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid null,
  organization_id uuid null,
  workspace_id uuid null,
  project_id uuid null,
  task_id uuid null,
  agent_version_id uuid null,
  use_latest boolean not null default false,
  constraint agent_shortcuts_pkey primary key (id),
  constraint agent_shortcuts_category_fk foreign KEY (category_id) references shortcut_categories (id) on delete CASCADE,
  constraint agent_shortcuts_org_fk foreign KEY (organization_id) references organizations (id) on delete set null,
  constraint agent_shortcuts_project_fk foreign KEY (project_id) references projects (id) on delete set null,
  constraint agent_shortcuts_task_fk foreign KEY (task_id) references tasks (id) on delete set null,
  constraint agent_shortcuts_version_fk foreign KEY (agent_version_id) references agent_versions (id) on delete set null,
  constraint agent_shortcuts_agent_fk foreign KEY (agent_id) references agents (id) on delete CASCADE,
  constraint agent_shortcuts_workspace_fk foreign KEY (workspace_id) references workspaces (id) on delete set null
) TABLESPACE pg_default;
```

