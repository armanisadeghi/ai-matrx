# AI Matrx — Category Systems Audit

> Generated: April 14, 2026
> Database: `brsgrqvjdzwihsvnfqkf` (automation-matrx)
> Tables deleted this session: `category_configs`, `subcategory_configs`, `category_migration_map`, `system_prompt_categories`, `system_prompt_functionality_configs`

---

## Summary

After cleanup, the database has **6 dedicated category tables** and **~15 tables with inline string/enum category columns**. These break into three tiers:

1. **Dedicated tables with FKs** — structured, constrained, display-ready
2. **Dedicated tables without FKs** — define options but don't enforce them
3. **Inline string columns** — unconstrained, prone to drift and casing inconsistencies

---

## Tier 1: Dedicated Category Tables With FK Enforcement

### `shortcut_categories` — 39 rows

The most feature-rich category table in the system. Self-referencing hierarchy, multiple placement types, and full display metadata.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `placement_type` | text NOT NULL | Scoping field: `content-block`, `ai-action`, `button`, `card`, `quick-action` |
| `parent_category_id` | uuid FK → self | Self-referencing hierarchy |
| `label` | text NOT NULL | Display name |
| `description` | text | |
| `icon_name` | text NOT NULL | Default: `SquareMenu` |
| `color` | text | Default: `zinc` |
| `sort_order` | integer | Default: `999` |
| `is_active` | boolean | Default: `true` |
| `metadata` | jsonb | Default: `{}` |
| `enabled_contexts` | jsonb | Default: `["general"]` |

**Referenced by (FK):**

| Table | Column | Rows | Notes |
|-------|--------|------|-------|
| `prompt_shortcuts` | `category_id` | 29 | Shortcuts linking categories → prompt builtins |
| `content_blocks` | `category_id` | 55 | Reusable content block definitions |
| `agx_shortcut` | `category_id` | 29 | Agent shortcut triggers |
| `system_prompts_new` | `category_id` | 24 | New system prompts (replaces old `system_prompts`) |
| `shortcut_categories` | `parent_category_id` | (self) | Hierarchy |

**Current categories by placement_type:**

- **content-block (22):** AI Prompts, Agent Skills, Audio, Audio Transcription, Block Components, Business ×2, Code, Education ×2, Flowchart, Formatting, Fun, Interaction, Productivity, Research, Special, Structure, Task List, Thinking, Timeline
- **ai-action (14):** Code Operations, Content Generation, Educational, Formatting, Matrx Create, My Organizations, My Personal, Prompt Enhancers, Text Operations, Text Tools, Uncategorized, Utilities, Write Code, standalone, translation
- **button (1):** Prompt Enhancers
- **card (1):** Content Cards
- **quick-action (1):** quick-actions

**Note:** There are duplicate labels across placement types (e.g., "Business" appears twice under content-block, "Prompt Enhancers" appears under both button and ai-action, "Formatting" and "Education" each appear twice under content-block). These may be intentional (parent/child) or cleanup candidates.

---

### `category` + `subcategory` — 12 + 79 rows (Applet System)

Two-level fixed hierarchy for the applet store.

**`category` columns:** id (uuid PK), name (varchar UNIQUE), description, slug, icon, created_at

**`subcategory` columns:** id (uuid PK), category_id (uuid FK → category), name, description, slug, icon, features (text[]), created_at

**Referenced by (FK):**

| Table | Column | Rows |
|-------|--------|------|
| `applet` | `subcategory_id` | 6 |
| `custom_applet_configs` | `subcategory_id` | 130 |

**Current categories:**

Business & Enterprise, Commerce & Marketing, Communication & Collaboration, Data & Analytics, Developer Tools & Utilities, Education & Learning, Health & Wellness, Media & Entertainment, Other Miscellaneous, Personal Tools & Productivity, Social & Community, Travel & Lifestyle

**Status:** Keeping — tied to the applet system.

---

### `node_category` — 26 rows

Flat category list for workflow nodes. Uses custom Postgres enums for `icon` and `color`.

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `name` | varchar |
| `label` | varchar |
| `icon` | enum (custom) |
| `color` | enum (custom, default: `blue`) |
| `description` | text |

**Referenced by:** `registered_node.category` (50 rows, FK)

**Current values:** API, Action, Agents, Commands, Database, Default, Documents, Executors, Extractors, Files, Integrations, Loop, Media, Other, Processors, Prompts, Recipes, Trigger, Web, Webhook, broker_relay, condition, function_node, user_data_source, user_input, workflow_node

---

### `feedback_categories` — 13 rows

User feedback categories with full display metadata.

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `name` | text UNIQUE |
| `slug` | text UNIQUE |
| `description` | text |
| `color` | text (default: `gray`) |
| `sort_order` | integer |
| `is_active` | boolean |

**Referenced by:** `user_feedback.category_id` (169 rows, FK)

**Current values:** AI & Prompts, Admin Dashboard, Arman Only, Authentication, Feedback System, Messaging, Notes, Other, Performance, Prompt Apps, Python Task, Sandbox, UI/UX

---

## Tier 2: Dedicated Table Without FK Enforcement

### `prompt_app_categories` — 12 rows

Defines the canonical category list for prompt apps, but `prompt_apps.category` is a plain text column with **no foreign key**. Values have drifted significantly.

| Column | Type |
|--------|------|
| `id` | text PK (not UUID!) |
| `name` | text |
| `description` | text |
| `icon` | text |
| `sort_order` | integer |

**Defined values:** business, creative, data, developer, education, entertainment, games, health, marketing, other, productivity, writing

**Actual values in `prompt_apps.category`:** education (8), business (6), research (5), Education (5), plus ~15 one-off AI-generated values like "B2B Content & Strategy", "Marketing/Sales", "Legal & Compliance", etc. — clear evidence of unconstrained drift.

---

## Tier 3: Inline String/Enum Category Columns

These tables store category as a plain text (or enum) column with no FK to any dedicated table.

### Shared taxonomy: prompts + agx_agent + prompt_builtins

These three tables use **the same category vocabulary** (Title Case, human-readable):

| Category Value | prompts | agx_agent | prompt_builtins |
|---------------|---------|-----------|-----------------|
| Business & Productivity | 90 | 93 | 3 |
| Content Creation | 57 | 57 | — |
| Analysis & Research | 37 | 50 | 13 |
| Education & Learning | 32 | 34 | 3 |
| Writing & Editing | 16 | 25 | 9 |
| Coding & Development | 15 | 20 | 5 |
| Data Processing | 10 | 12 | 2 |
| Creative Tasks | 7 | 10 | 3 |
| Travel & Lifestyle | 8 | 8 | — |
| Prompt Engineering | 3 | 9 | 6 |
| General Assistance | 4 | — | 1 |
| Health & Fitness | 2 | — | — |
| Marketing & SEO | 2 | — | — |
| Translation & Localization | — | — | 1 |
| + others | small counts | small counts | — |

**Note:** `agx_agent` and `prompts` are almost perfectly aligned — agents are likely created from prompts. `prompt_builtins` uses the same values but a smaller subset.

### tools.category — 169 rows

Different taxonomy — **lowercase, technical labels**. Not related to the prompts/agents taxonomy.

| Value | Count |
|-------|-------|
| data | 11 |
| local_system | 11 |
| productivity | 11 |
| internal | 10 |
| user_tables | 10 |
| local_network | 9 |
| browser | 9 |
| code | 7 |
| local_browser | 7 |
| travel | 6 |
| + more | ... |

### mcp_servers.category — 38 rows

Uses a **Postgres enum** (`mcp_server_category`), so values are DB-enforced but require a migration to change.

Values: productivity (7), developer (5), design (4), analytics (3), payments (3), communication (3), crm (3), search (3), database (3), storage (2), automation (2)

### Other inline columns (lower priority)

| Table | Column | Type | Rows | Notes |
|-------|--------|------|------|-------|
| `workflow.category` | category | varchar | 52 | Workflow categories |
| `workflow_data.category` | category | varchar | 5 | |
| `system_prompts.category` | category | text | 24 | **Old table** — `system_prompts_new` uses `shortcut_categories` via FK |
| `system_prompts.subcategory` | subcategory | text | 24 | Same — old table |
| `broker_value.category` | category | varchar | 659 | Broker value grouping |
| `broker_value.sub_category` | sub_category | varchar | 659 | |
| `ctx_context_items.category` | category | text | 0 | Empty |
| `ctx_context_templates.industry_category` | industry_category | text | 108 | Template industry tags |
| `quiz_sessions.category` | category | varchar | 60 | Quiz topic |
| `ops_issue_class.category` | category | text | 18 | Issue classification |
| `shared_canvas_items.categories` | categories | text[] | 15 | Array of tags |
| `registered_function.category` | category | enum (`reg_func_category`) | 51 | Postgres enum |
| `sms_notifications.category` | category | text | 0 | Empty |
| `scrape_failure_log.failure_category` | failure_category | text | 0 | Empty |
| `prompt_templates.category` | category | varchar | 9 | |

### Version tables (snapshot columns — read-only)

These store a text snapshot of the category at the time of versioning. They're append-only and should **not** be migrated to FKs.

| Table | Rows |
|-------|------|
| `agx_version.category` | 1,245 |
| `prompt_versions.category` | 626 |
| `prompt_app_versions.category` | 61 |
| `prompt_builtin_versions.category` | 70 |
| `tool_versions.category` | 169 |

---

## Views Referencing Category Data

These are database views (not tables) that include category columns. They'll need updating if underlying tables change.

| View | Category Columns |
|------|-----------------|
| `category_items_view` | `category_id` |
| `context_menu_unified_view` | `categories_flat` (json) |
| `shortcuts_by_placement_view` | `category_id`, `parent_category_id`, `category_label`, `category_description`, `category_icon`, `category_color`, `category_sort_order`, `category_is_active`, `category_metadata` |
| `prompt_builtins_with_source_view` | `category` |

---

## Relationship to `ctx_scope_types` / `ctx_scopes`

The `ctx_scope_types` → `ctx_scopes` → `ctx_scope_assignments` system is a tagging/scoping architecture, but it operates at a **different level** than app-wide categories:

- **ctx_scope_types** define organizational categories that a specific org or user creates (e.g., "Client", "Department", "Study Phase")
- **ctx_scopes** are the actual values within those types (e.g., "Anthropic", "SEO Team", "Phase 2")
- **ctx_scope_assignments** link any entity to any combination of scopes

This is a **per-org/per-user** system for filtering and context — not a global app-wide taxonomy. It answers "which client/department/project does this belong to?" rather than "what type of thing is this?"

A unified category table would answer the second question. The two systems are complementary, not overlapping.

---

## Unification Analysis

### What a unified table could look like

`shortcut_categories` already has ~80% of the needed schema. A unified version might look like:

```
categories
├── id              uuid PK
├── domain          text NOT NULL        -- 'shortcut', 'feedback', 'workflow_node', 'prompt_app', 'tool', 'applet', etc.
├── parent_id       uuid FK → self       -- hierarchy within a domain
├── name            text NOT NULL        -- canonical name
├── label           text                 -- display label (if different from name)
├── slug            text                 -- URL-safe key
├── description     text
├── icon_name       text
├── color           text
├── sort_order      integer DEFAULT 999
├── is_active       boolean DEFAULT true
├── metadata        jsonb DEFAULT '{}'
├── placement_type  text                 -- for shortcut-domain categories
├── enabled_contexts jsonb               -- for shortcut-domain categories
├── created_at      timestamptz
├── updated_at      timestamptz
└── UNIQUE(domain, name)
```

### Migration complexity by table group

**Easy (already FK-based — just repoint):**
- `feedback_categories` → move 13 rows into unified table with `domain = 'feedback'`, update `user_feedback.category_id` FK
- `node_category` → move 26 rows with `domain = 'workflow_node'`, update `registered_node.category` FK
- `prompt_app_categories` → move 12 rows with `domain = 'prompt_app'`... but `prompt_apps.category` is text, so also needs the string→FK migration below

**Medium (string → FK migration):**
- `prompts.category` + `agx_agent.category` + `prompt_builtins.category` — these share a taxonomy (~15 distinct values). Add rows to unified table with `domain = 'prompt'`, then `ALTER TABLE prompts ADD COLUMN category_id uuid REFERENCES categories(id)`, backfill, drop old column.
- `tools.category` — different taxonomy (~15 values), same process with `domain = 'tool'`
- `prompt_apps.category` — clean up the 30+ drifted values down to the 12 canonical ones, then FK

**Leave alone:**
- `mcp_servers.category` (enum — small, stable, DB-enforced, works fine)
- `registered_function.category` (enum — same reasoning)
- `broker_value.category` / `broker_value.sub_category` (659 rows, internal system, low ROI)
- `ctx_context_templates.industry_category` (template data, different concern)
- `shared_canvas_items.categories` (text array — tagging, not single-category)
- `quiz_sessions.category`, `ops_issue_class.category` (operational/analytical, low ROI)
- All `*_versions` tables (append-only snapshots, must stay as text)
- `system_prompts.category` (old table, likely deprecated in favor of `system_prompts_new`)
- Empty tables: `sms_notifications`, `scrape_failure_log`, `ctx_context_items`

**Special case — applet system:**
- `category` + `subcategory` has a different shape (two-table parent/child with features[]). Could be modeled in the unified table using `domain = 'applet'` with hierarchy, but the `features[]` array on subcategory would need to go in `metadata`. Decision depends on whether the applet system is evolving or stable.

### Potential issues with full unification

1. **Query complexity** — every query needs `WHERE domain = '...'`. Not hard, but it's an extra filter on every call. An index on `(domain, is_active, sort_order)` handles this.

2. **Schema divergence** — different domains need different columns (e.g., `placement_type` and `enabled_contexts` only matter for shortcuts, `features[]` only matters for applets). You end up with nullable columns that only apply to certain domains, or you push everything into `metadata` jsonb. This is manageable at your current scale but gets noisy if more domains are added over time.

3. **RLS policies** — currently each table has its own RLS. A unified table needs domain-aware policies or a simpler "authenticated can read, admin can write" approach.

4. **Migration risk** — the string→FK migrations touch high-row-count tables (`prompts` 342, `agx_agent` 394, `tools` 169). Each needs careful backfill + frontend coordination.

5. **Version tables** — the `*_versions` tables must keep text snapshots. If you unify, the live tables point to UUIDs but the version tables still store the old text values. This is fine (it's what version tables should do) but means you can't JOIN versions to the unified table by category.

### Recommendation

A phased approach works best:

- **Phase 1:** Clean up `prompt_apps.category` drift and add an actual FK to `prompt_app_categories`. Quick win, no new table needed.
- **Phase 2:** Decide if a unified table is worth it based on how many new category-driven features you're building. If you're frequently adding new categorized entities, unification pays off. If the current set is stable, the overhead isn't justified.
- **Phase 3 (if unifying):** Start with the shared prompts/agents/builtins taxonomy (biggest impact, same values already). Then fold in feedback and workflow nodes. Leave applets, enums, and low-ROI string columns alone.

---

## Quick Reference: What to Search in Codebase

If migrating any table, search for these patterns:

```
# Supabase client calls
.from('category_name')
.from('table_name').select('...category...')

# Type definitions
category: string
category_id: string

# API routes
/api/categories
/api/category

# Redux slices / stores
categorySlice
categoryAdapter
```
