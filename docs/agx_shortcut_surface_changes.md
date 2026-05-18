# Agent Shortcut + Surface Schema Update — FE Handoff

**Date:** 2026-05-15
**Migration target:** `agx_shortcut`, `agx_context_menu_view`, `agent_context_menu_view`, plus a new RPC.
**Breaking changes:** None. All additions are backward-compatible.

---

## Why

Previously, the wiring between an agent and a UI surface was implicit. A shortcut's `scope_mappings` jsonb encoded surface-value names as keys (e.g. `selection`, `file_name`) but the shortcut had no FK telling us *which* surface it belonged to. With `agx_agent_surface` added recently, we needed a way to make that relationship explicit at the shortcut level so we can:

1. Query shortcuts by surface (`WHERE surface_name = '...'`).
2. Carry the richer value-mapping DSL already used by `agx_agent_surface` into shortcuts.
3. Seed new shortcuts from an existing `agx_agent_surface` row, so the user doesn't restart variable mapping from scratch.

`agx_agent_surface` stays as the agent's *catalog declaration* ("this agent is available on this surface, with these default mappings"). `agx_shortcut` is the *instance* — a specific invocation with version pinning, presentation overrides, and possibly tweaked mappings. Many shortcuts can exist per (agent, surface) pair.

---

## 1. New columns on `agx_shortcut`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `surface_name` | `text` | yes | FK → `ui_surface.name`, `ON UPDATE CASCADE`, `ON DELETE SET NULL`. Indexed (`agx_shortcut_surface_name_idx`) for `surface_name IS NOT NULL`. |
| `value_mappings` | `jsonb` | yes | Rich mapping DSL — same shape as `agx_agent_surface.value_mappings`. See DSL spec below. |

The legacy `scope_mappings` column is **untouched** and still populated on existing rows. Both columns coexist during the migration. Readers should prefer `value_mappings` when present and fall back to `scope_mappings` otherwise.

### `value_mappings` DSL

Keys are surface-value names (declared in `ui_surface_value`). Values describe how that surface value resolves to an agent variable at run time.

```jsonc
{
  "page_content": {
    "mapType": "surface_value",   // pull from the surface's live value
    "target":  "current_page_text",
    "required": true
  },
  "document_name": {
    "mapType": "direct_value",    // hard-coded literal injected at run time
    "target":  "my-document-name"
  },
  "current_page_content": {
    "mapType": "prompt_user",     // ask the user at execution time
    "prompt":  "Hi. We're prompting you to get some info",
    "defaultValue": "fallback text",
    "required": true
  },
  "open_tabs": {
    "mapType": "unmapped"         // explicit no-op; surface value is ignored
  }
}
```

Supported `mapType` values: `surface_value`, `direct_value`, `prompt_user`, `unmapped`.

---

## 2. Updated views

Both `agx_context_menu_view` and `agent_context_menu_view` now emit `surface_name` and `value_mappings` on each `agent_shortcut` item, alongside the existing `scope_mappings`. No other shape changes. If you read either view, just add the two new keys to your TypeScript type.

---

## 3. New RPC: `create_shortcut_from_agent_surface`

Seeds a new `agx_shortcut` from an existing `agx_agent_surface` row, so the user starts with the agent's declared value mappings instead of an empty form.

### Signature

```sql
create_shortcut_from_agent_surface(
  p_agent_surface_id  uuid,                          -- required: the agx_agent_surface row
  p_category_id       uuid,                          -- required: shortcut_categories.id
  p_user_id           uuid    DEFAULT NULL,          -- optional scope
  p_organization_id   uuid    DEFAULT NULL,
  p_project_id        uuid    DEFAULT NULL,
  p_task_id           uuid    DEFAULT NULL,
  p_overrides         jsonb   DEFAULT '{}'::jsonb    -- optional column overrides
) RETURNS uuid                                       -- new shortcut id
```

### Default behavior (no overrides)

- `agent_id`, `surface_name`, `value_mappings` ← copied from `agx_agent_surface`.
- `label` ← `agent.name || ' Shortcut'`. (Most users won't rename; the `" Shortcut"` suffix prevents collision with the agent's own name.)
- `description` ← `agent.description`.
- All other shortcut columns get table defaults (`display_mode='modal-full'`, `allow_chat=true`, `auto_run=true`, `use_latest=true`, etc.).

### Override any column at creation

Pass any `agx_shortcut` column name as a key in `p_overrides`. Supported keys: `label`, `description`, `icon_name`, `value_mappings`, `keyboard_shortcut`, `display_mode`, `allow_chat`, `auto_run`, `show_variable_panel`, `variables_panel_style`, `show_definition_messages`, `show_definition_message_content`, `hide_reasoning`, `hide_tool_results`, `show_pre_execution_gate`, `pre_execution_message`, `bypass_gate_seconds`, `default_user_input`, `default_variables`, `context_overrides`, `llm_overrides`, `response_density`, `json_extraction`, `enabled_features`, `use_latest`, `agent_version_id`.

### Example — Supabase JS client

```ts
// Minimal: just seed from agent-surface, defaults everything else.
const { data: shortcutId, error } = await supabase.rpc(
  'create_shortcut_from_agent_surface',
  {
    p_agent_surface_id: agentSurfaceId,
    p_category_id:      categoryId,
    p_user_id:          currentUserId,
  }
);

// Override label, display mode, and pin to a specific agent version.
const { data: shortcutId } = await supabase.rpc(
  'create_shortcut_from_agent_surface',
  {
    p_agent_surface_id: agentSurfaceId,
    p_category_id:      categoryId,
    p_user_id:          currentUserId,
    p_overrides: {
      label:            'Translate to Spanish',
      display_mode:     'popover',
      hide_reasoning:   true,
      hide_tool_results: true,
      use_latest:        false,
      agent_version_id:  'a1b2c3...',
    },
  }
);
```

Errors raised: `agx_agent_surface row <uuid> not found`, `agx_agent row <uuid> not found`.

Permissions: `EXECUTE` granted to `authenticated` and `service_role`. RLS still applies on the underlying tables (`SECURITY INVOKER`).

---

## 4. What didn't change (and why)

- **`scope_mappings`** is still on the table. Don't drop it from your read paths yet — existing rows still use it.
- **No unique constraint** on `agx_agent_surface(agent_id, surface_name)`. We deliberately deferred this because the scope-column interaction (user/org/project/task) needs more design before we enforce a key.
- **`context_mappings`** on `agx_shortcut` is unused (0 rows) but left in place for now.

---

## 5. Suggested FE follow-ups

1. **Shortcut creation flow** — when the user picks "create shortcut for this agent on this surface," call the new RPC with `p_agent_surface_id` and an empty `p_overrides`; let them edit the seeded row afterward.
2. **Shortcut read paths** — start reading `value_mappings` with fallback to `scope_mappings`:
   `const mappings = shortcut.value_mappings ?? shortcut.scope_mappings;`
3. **Shortcut write paths** — when creating/updating, write to `value_mappings` (not `scope_mappings`) so we can eventually retire the legacy column.
4. **Surface filtering** — for surface-scoped UI ("show me all shortcuts that render on this surface"), filter by `surface_name`.

---

## 6. Migration provenance

Three named migrations applied:

| # | Name | What |
|---|---|---|
| 1 | `add_surface_and_value_mappings_to_agx_shortcut` | Adds `surface_name` (FK, indexed) and `value_mappings` (jsonb) to `agx_shortcut`. |
| 2 | `add_surface_and_value_mappings_to_context_menu_views` | Recreates `agx_context_menu_view` to emit the two new fields. |
| 3 | `add_surface_and_value_mappings_to_agent_context_menu_view` | Recreates `agent_context_menu_view` to emit the two new fields. |
| 4 | `create_agx_shortcut_from_agent_surface_rpc` | Creates the duplication RPC. |
