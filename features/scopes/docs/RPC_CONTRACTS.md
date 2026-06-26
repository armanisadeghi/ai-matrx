# RPC_CONTRACTS.md — `features/scopes`

**Status:** `proposed` — first round for Python-team review. Locking the surface before client code lands.
**Owner:** `features/scopes` (frontend authoritative for shape; Python team authoritative for implementation, RLS, and indexes).
**Last updated:** `2026-05-16`

> This doc specifies the **only** RPC surface that `features/scopes/service/scopesService.ts` is allowed to call. The frontend never queries `ctx_*` tables directly — all reads and writes go through the RPCs listed here. ESLint enforces the chokepoint.

---

## Why RPCs (not direct queries)

1. **One mutation path per protected resource** (per `CLAUDE.md` Protected Resources doctrine). Bug fixes happen in one place.
2. **RLS is the enforcement layer.** RPCs are `SECURITY DEFINER` where needed and call `is_member_of_org(...)` internally — clients never bypass.
3. **Server-side resolution stays consistent** with client `selectResolvedContext()` because both call the same `resolve_*` RPCs (server-side at invocation, client-side for previews/contradiction detection).
4. **Audit trail is uniform.** Mutations log to `ctx_context_access_log` (for value reads/writes) and `admin_audit_log` (for scope-type/template-apply admin actions) from one place.

---

## Conventions

### Auth & RLS

- All RPCs assume `auth.uid()` is present. None are anonymous.
- Read RPCs return rows for orgs the user is a member of, including the user's personal organization (`organizations.is_personal = true`).
- Mutation RPCs additionally check the user's role in the target org. Roles are read via `is_member_of_org(org_id, min_role)`.
- Personal context is not synthesized. Frontend and RPC callers pass the real personal organization id.

### Error semantics

All RPCs return `Promise<RpcResult<T>>`:

```ts
type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; hint?: string; detail?: unknown } };
```

Standard error codes:

| Code | Meaning |
|---|---|
| `unauthorized` | No `auth.uid()`. |
| `forbidden_org` | User is not a member of the requested org. |
| `forbidden_role` | User's role in the org is insufficient for the action. |
| `not_found` | Target row does not exist or is filtered out by RLS (collapsed deliberately). |
| `conflict_in_use` | Cannot delete because the row is referenced elsewhere. |
| `invalid_argument` | Input fails server-side validation (e.g. negative `max_assignments_per_entity`). |
| `version_conflict` | Optimistic concurrency check failed on values write. |
| `quota_exceeded` | Soft limits hit (max scope_types per org, etc.). |
| `template_missing` | `apply_template` target does not exist or is inactive. |
| `internal` | Unexpected server error. Always include `detail` if safe to expose. |

Never throw to the client. Return a typed result.

### Idempotency

- Read RPCs are pure.
- Mutations are designed to be safe to retry within a short window. Where ID collision matters, accept a client-generated `id` (UUID) and let `INSERT … ON CONFLICT (id) DO NOTHING` be a no-op rather than an error.
- Bulk reorder / bulk replace endpoints accept a full target list and reconcile to it (set semantics), not delta.

### Batching

- Boot fetch is one bundled call (`get_user_scope_tree_with_projects`).
- Tasks-per-level and orphans are separate, on-demand, never batched into boot.
- Bulk mutations (e.g. `set_entity_scopes(entity_type, entity_id, scope_ids[])`) replace the full M2M list atomically — no per-row add/remove churn.

### Naming

- Read: `get_*` (single row), `list_*` (collection).
- Mutate: `<verb>_<noun>` (`create_scope_type`, `set_entity_scopes`, `apply_template`).
- Resolve: `resolve_*` for derived views.

---

## Read RPCs

### `get_user_scope_tree_with_projects(p_refresh boolean default false)`

The boot fetch. One round-trip. ~20 KB for a typical user.

**Returns:**

```ts
{
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    is_personal: boolean;        // true for the user's real personal organization row
    role: 'owner' | 'admin' | 'member';   // mirrors public.org_role exactly — no read-only role exists
    scope_types: Array<{
      id: string;
      organization_id: string;
      label_singular: string;
      label_plural: string;
      icon: string;
      color: string;
      max_assignments_per_entity: number | null;
      sort_order: number;
      parent_type_id: string | null;
      default_variable_keys: string[];
      scopes: Array<{
        id: string;
        scope_type_id: string;
        organization_id: string;
        name: string;
        description: string;
        parent_scope_id: string | null;
        settings: Json;
        // NOTE: `name` is sufficient for tree rendering;
        // values are NOT inlined here (high churn, separate fetch).
      }>;
    }>;
    projects: Array<{
      id: string;
      organization_id: string;
      name: string;
      slug: string;
      // FK list of associated scope_ids (denormalized for UI filtering)
      scope_ids: string[];
    }>;
  }>;
  fetched_at: string;          // ISO timestamp
}
```

**Errors:** `unauthorized`, `internal`.

**Notes:**

- `p_refresh = true` is a hint for cache invalidation on the server side. Pure read otherwise.
- Tasks are NOT returned. See `list_scope_tasks`.
- Orphan projects (org_id present but no scope) ARE returned in the `projects` array — the client decides whether to show them under "Other projects" based on `scope_ids` length.
- Personal projects are returned under the user's real personal organization.
- Result is bounded — max 200 scope_types per org, max 500 scopes per type, max 1000 projects per org. If a user exceeds these, return what fits in stable order (alpha) and set a `truncated: true` flag (extension to the shape — TBD if needed).

### `list_scope_tasks(p_level text, p_id uuid, p_limit int default 200, p_offset int default 0)`

On-demand tasks for a tree node. Called when the user expands a scope/project/org.

**Params:**

- `p_level`: `'scope' | 'project' | 'org'`.
- `p_id`: the id of the level node.

**Returns:**

```ts
{
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    project_id: string | null;
    organization_id: string | null;
    scope_ids: string[];        // M2M assignments
    updated_at: string;
  }>;
  total_count: number;          // for pagination
  fetched_at: string;
}
```

**Errors:** `unauthorized`, `forbidden_org`, `not_found`, `invalid_argument`.

**Notes:**

- For `p_level = 'org'`: returns tasks in the org without scope or project association — i.e. "org-level orphans." Use `list_orphan_tasks` instead if that's the explicit intent.
- Pagination via `p_limit` / `p_offset`. Default 200 should fit most cases.

### `list_orphan_projects(p_org_id uuid)`

**Returns:**

```ts
{
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    organization_id: string;
    updated_at: string;
  }>;
  fetched_at: string;
}
```

Projects in `p_org_id` with no `ctx_scope_assignments` row. Distinct from `get_user_scope_tree_with_projects` orphan handling because the client explicitly opts in (the "Load others" button).

**Errors:** `unauthorized`, `forbidden_org`.

### `list_orphan_tasks(p_level text, p_id uuid)`

**Returns:**

```ts
{
  tasks: Array<{ id; title; status; updated_at; }>;
  fetched_at: string;
}
```

Tasks within the level node's scope but with no scope/project association. Mirrors `list_orphan_projects`.

### `list_context_items(p_scope_type_id uuid)`

**Returns:**

```ts
{
  items: Array<{
    id: string;
    scope_type_id: string;
    key: string;
    display_name: string;
    description: string;
    category: string | null;
    value_type: 'text' | 'number' | 'boolean' | 'json' | 'document' | 'reference';
    fetch_hint: 'eager' | 'on_demand' | 'manual';
    sensitivity: 'public' | 'internal' | 'sensitive';
    depends_on: string[];        // other context item ids
    is_active: boolean;
    review_interval_days: number | null;
    last_verified_at: string | null;
    next_review_at: string | null;
  }>;
}
```

### `list_context_values(p_scope_id uuid)`

**Returns:**

```ts
{
  values: Array<{
    context_item_id: string;
    id: string;
    version: number;
    is_current: boolean;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: Json | null;
    value_document_url: string | null;
    value_document_size_bytes: number | null;
    value_reference_id: string | null;
    value_reference_type: string | null;
    source_type: string;
    authored_by: string | null;
    created_at: string;
  }>;
}
```

Only `is_current = true` rows are returned by default. Pass `p_include_history = true` to fetch full version history (also see `get_context_value_history`).

### `get_context_value_history(p_context_item_id uuid, p_scope_id uuid, p_limit int default 50)`

**Returns:** version history for a single (item, scope) cell.

### `list_templates(p_active_only boolean default true)`

**Returns:**

```ts
{
  templates: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    is_active: boolean;
    sort_order: number;
    scope_type_count: number;
    context_item_count: number;
  }>;
}
```

### `get_template_detail(p_template_id uuid)`

**Returns:** full template with nested `template_scope_types[]` and their `template_context_items[]`. Read-only.

### `list_entity_scopes(p_entity_type text, p_entity_id uuid)`

**Returns:**

```ts
{
  scope_ids: string[];
}
```

The M2M list for a specific entity. Cheap, frequently called.

### `list_scopes_for_entities(p_entity_type text, p_entity_ids uuid[])`

**Returns:**

```ts
{
  rows: Array<{ entity_id: string; scope_ids: string[] }>;
}
```

Batch variant for list views (notes list, tasks list) that need scope chips per row.

---

## Mutation RPCs

### Scope types

#### `create_scope_type(p_org_id uuid, p_payload jsonb)`

**Payload:**

```ts
{
  id?: string;                      // client-generated UUID, optional
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;                    // hex
  max_assignments_per_entity?: number | null;
  parent_type_id?: string | null;
  sort_order?: number;
  default_variable_keys?: string[];
}
```

Requires `is_member_of_org(p_org_id, 'admin')`. Returns the inserted row.

#### `update_scope_type(p_scope_type_id uuid, p_payload jsonb)`

Partial update. Any subset of the create payload (except `id`). Same role gate.

#### `delete_scope_type(p_scope_type_id uuid, p_cascade boolean default false)`

If `p_cascade = false` and there are any `ctx_scopes` rows referencing it: returns `conflict_in_use`. If `true`: hard-delete cascades to scopes → values → assignments.

#### `reorder_scope_types(p_org_id uuid, p_ordered_ids uuid[])`

Replace `sort_order` to match the array order in one transaction.

### Scopes

#### `create_scope(p_payload jsonb)`

**Payload:**

```ts
{
  id?: string;
  scope_type_id: string;
  organization_id: string;
  name: string;
  description?: string;
  parent_scope_id?: string | null;
  settings?: Json;
}
```

Role gate: `'member'` (anyone in the org can author scopes; admin restrictions are policy-driven via `default_variable_keys`).

#### `update_scope(p_scope_id uuid, p_payload jsonb)`

Partial update.

#### `delete_scope(p_scope_id uuid, p_cascade boolean default false)`

`conflict_in_use` if values or assignments exist and `p_cascade = false`. Cascade deletes values + assignments.

### Context items (columns on a scope type)

#### `create_context_item(p_scope_type_id uuid, p_payload jsonb)`
#### `update_context_item(p_item_id uuid, p_payload jsonb)`
#### `delete_context_item(p_item_id uuid, p_cascade boolean default false)`
#### `reorder_context_items(p_scope_type_id uuid, p_ordered_ids uuid[])`

Same pattern as scope_types. Admin role required.

### Context values (cells)

#### `set_context_value(p_payload jsonb)`

**Payload:**

```ts
{
  context_item_id: string;
  scope_id: string;
  source_type: 'user_input' | 'ai_generated' | 'imported' | 'system';
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_json?: Json | null;
  value_document_url?: string | null;
  value_document_size_bytes?: number | null;
  value_reference_id?: string | null;
  value_reference_type?: string | null;
  change_summary?: string | null;
  expected_version?: number;        // for optimistic concurrency
}
```

Behaviour: marks any current row `is_current = false`, inserts a new row with `version = previous + 1`, `is_current = true`. If `expected_version` is provided and the current `version` doesn't match, returns `version_conflict` with the latest current row in `error.detail`.

#### `revert_context_value(p_value_id uuid)`

Restores the given historical row as the new current. Inserts a new version that copies the historical row, marks it current. Audit trail preserved.

#### `delete_context_value(p_context_item_id uuid, p_scope_id uuid)`

Removes all versions for one cell. `conflict_in_use` if there are active references to this value's `id` from elsewhere (rare).

### Scope assignments (M2M tagging)

#### `set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])`

**Set semantics**, not delta. Replaces the entity's full assignment list atomically.

Role: caller must have write access to the entity (delegated check — RPC calls back into the owning feature's permission check via `check_entity_writable(entity_type, entity_id)`). The scope module does not own per-entity permissions.

**Returns:**

```ts
{
  entity_type: string;
  entity_id: string;
  scope_ids: string[];           // final state after replacement
}
```

#### `add_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])`
#### `remove_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])`

Delta variants. Useful for keyboard-driven taggers. Same return shape.

### Templates

#### `apply_template(p_template_id uuid, p_org_id uuid, p_options jsonb default '{}')`

**Options:**

```ts
{
  skip_existing_keys?: boolean;      // default true — skip context items whose key already exists in the org
  apply_subset?: {                   // optional pick-and-choose
    template_scope_type_ids: string[];
  };
}
```

**Behaviour:** creates the template's `scope_types` and their `context_items` inside `p_org_id`. Idempotent: re-running with the same template + org and `skip_existing_keys: true` is a safe no-op. Returns the new IDs:

```ts
{
  inserted_scope_type_ids: string[];
  inserted_context_item_ids: string[];
  skipped_keys: string[];
}
```

Role: `'admin'`. Logs to `admin_audit_log` via the same pattern as protected-resource RPCs.

---

## Resolution RPCs

These are the **load-bearing** server-side equivalents of the client's `selectResolvedContext`. The agent invocation path calls one of these at the boundary; the client uses them for previews and contradiction warnings without re-implementing the algorithm.

### `resolve_active_context(p_app_context jsonb)`

For globally-triggered actions. No entity in scope.

**`p_app_context`:**

```ts
{
  organization_id: string | null;
  scope_selections: Record<string, string>;   // scope_type_id → scope_id
  project_id: string | null;
  task_id: string | null;
  conversation_id: string | null;
}
```

**Returns:** `ResolvedContext` (see `features/scopes/FEATURE.md` §"The resolution algorithm" for the shape).

```ts
{
  values: Record<string, ResolvedValue>;       // context_item.key → value bundle
  source_per_key: Record<string, ContextSource>;
  active_scopes: Array<ContextSource>;
  contradictions: [];                          // always empty for global-only
  organization_id: string | null;
  user_id: string;
}
```

Where `ResolvedValue`:

```ts
{
  context_item_id: string;
  display_name: string;
  value_type: string;
  value: string | number | boolean | Json | null;
  document_url?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  version: number;
}
```

### `resolve_local_context(p_app_context jsonb, p_entity_type text, p_entity_id uuid)`

For locally-triggered actions. Closest-wins merge of entity tags over global active.

**Returns:** same shape as `resolve_active_context`, plus:

```ts
{
  contradictions: Array<{
    scope_type_id: string;
    global_scope_id: string;
    local_scope_id: string;
  }>;
}
```

**Notes:**

- Implementation: union the entity's `ctx_scope_assignments` with `p_app_context.scope_selections`, with local winning on same `scope_type_id` collision. Then resolve values for the merged set.
- The contradiction detection is the per-scope-type comparison — it is **not** dependent on whether the contradicting scopes share or differ on actual context-item values. A scope-type collision is the contradiction, regardless of whether the underlying cells happen to be identical.

### `preview_resolution(p_payload jsonb)`

A hypothetical-resolution endpoint for the UI: "if I were to set these scopes, what would resolve?" Used by `<ActiveScopePicker />` hover previews and the "Compare scopes" admin tool.

---

## Audit

### `log_context_access(p_payload jsonb)`

Append-only insert into `ctx_context_access_log`. Called from the invocation path to record which values the agent received.

```ts
{
  context_item_id: string;
  value_id: string;
  conversation_id?: string;
  task_id?: string;
  was_useful?: boolean | null;        // updated later by feedback signals
}
```

### `mark_context_access_useful(p_log_id uuid, p_was_useful boolean)`

Updates the `was_useful` flag on an access log row. Drives usage analytics for refining `fetch_hint`.

---

## Under discussion / open questions for the Python team

1. **Bundled boot size.** `get_user_scope_tree_with_projects` is expected to stay under ~20 KB for typical users. If we see users with many orgs blowing past 100 KB, do we split the call (per-org lazy)? Frontend prefers bundled; we'll iterate.
2. **`max_assignments_per_entity` enforcement.** Currently a UI hint. Should the server enforce in `add_entity_scopes` / `set_entity_scopes`? Recommendation: yes, but return a structured error with the current count + max so the UI can show a clean message.
3. **Cross-org assignment.** `set_entity_scopes` allows tagging an entity with scopes from any org the user is in. We need to confirm the entity's owning org is always one of those — otherwise we'd allow tagging a personal note with a corporate scope, which is probably a leak. **Proposed:** reject if `entity.organization_id` is set and doesn't match every `scope.organization_id` in the list.
4. **Context item dependencies (`depends_on`).** Today this is informational. Should `set_context_value` validate the dependencies are populated for the same scope? **Recommendation:** warning, not block — same posture as the contradiction rule.
5. **Soft deletes vs hard deletes.** Scope types and scopes are referenced widely. For now we propose hard delete with `p_cascade` flag. Long-term, a soft-delete column (`deleted_at`) might be safer to enable "undo for 30 days." Defer until a user actually asks for it.
6. **Realtime.** None of these RPCs are subscribed via Realtime today. When we wire scope CRUD multi-user editing, broadcast on `ctx_scopes` / `ctx_context_item_values` would be the cheapest path. Out of scope for the initial cutover.
7. **`resolve_local_context` vs server-side invocation.** Today the Python backend at `server.app.matrxserver.com` does its own scope resolution. Do we want it to call `resolve_local_context` over Postgres functions, or implement the same algorithm in Python and keep the RPCs as a frontend convenience? **Recommendation:** Python calls the RPC. One algorithm, two consumers.
8. **`apply_template` partial failures.** If a template has 12 scope_types and 4 collide with existing keys, do we insert the 8 successes or fail the whole batch? **Proposed:** insert successes, return `skipped_keys` so the admin can decide. Atomicity at the per-scope-type level, not the whole template.

---

## Change log

- `2026-05-16` — composer: initial draft of the RPC surface for Python-team review. Specifies read RPCs (tree, tasks, orphans, items, values, templates, entity scopes), mutation RPCs (CRUD for scope types / scopes / context items / values / assignments / template apply), resolution RPCs (`resolve_active_context`, `resolve_local_context`, `preview_resolution`), and audit RPCs (`log_context_access`, `mark_context_access_useful`). Open questions listed for review.
