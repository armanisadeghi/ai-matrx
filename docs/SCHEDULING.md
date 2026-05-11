# Scheduling System — `sch_*` tables & UI guide

**Audience.** matrx-frontend team building the scheduling UI on aimatrx.com, and any future surface (desktop, mobile, server worker) that will create or claim scheduled work.

**Status.** Live in Supabase project `txzxabzwovsujtloxrus` as of 2026-05-10. Migration: [`migrations/2026_05_10_sch_v0.sql`](../migrations/2026_05_10_sch_v0.sql). TypeScript reference implementation: [`src/lib/agenda/queries.ts`](../src/lib/agenda/queries.ts) (the agent-kind façade over the raw tables).

---

## 1. What this is

A shared, multi-surface scheduling spine for AI Matrx. **Any surface can register a task; any other surface can claim and execute it.** Today the only kind is `agent` (scheduled agent runs). Coming soon under the same `sch_*` namespace: workflows, scrapes, webhooks, user actions, and anything else that needs to be executed somewhere, sometime, by someone.

**Design rule.** Every future kind is a new sibling table (`sch_workflow_task`, `sch_scrape_task`, …), never a new column on `sch_task`. The spine never bloats.

---

## 2. The four tables

```
sch_task                 — the kind-agnostic definition (the WHAT)
  ↳ sch_agent_task         — agent-kind extension (1:1 by id)
sch_trigger              — when it fires (many per task)
sch_run                  — each execution
```

### `sch_task` — kind-agnostic spine

Everything that's true of *every* scheduled thing.

| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | RLS owner |
| `kind` | text | `'agent'` today. Filter the UI list on this. |
| `title` | text | shown in lists |
| `description` | text? | optional long-form |
| `queue` | text | default `'default'`; routing lane (use later for sharding) |
| `surfaces` | text[] | which surfaces are *allowed* to pick this up. `'any'` = first eligible online surface. |
| `enabled` | bool | pause/resume |
| `expires_at` | timestamptz? | task auto-disables after this |
| `tags` | text[] | for filtering |
| `next_due_at` | timestamptz? | cache of soonest enabled trigger; **the scanner's primary filter** |
| `last_run_at` | timestamptz? | bookkeeping |
| `created_at`, `updated_at` | timestamptz | `updated_at` auto-bumps on UPDATE |

### `sch_agent_task` — agent-kind extension (1:1 with `sch_task` by id)

| column | type | notes |
|---|---|---|
| `id` | uuid | FK → `sch_task(id)` ON DELETE CASCADE |
| `agent_id` | uuid? | soft FK to `agx_agent`. Null = use the platform default agent. |
| `prompt` | text | the user message sent to the agent |
| `variables` | jsonb | template variables injected into the prompt |
| `persistent_conversation_id` | uuid? | soft FK to `cx_conversation`. For heartbeat / continuous tasks: all runs append to this thread. Null = each run gets a fresh conversation. |
| `auth_mode` | text | `'ask'` or `'auto'`. `ask` shows a notification, user clicks to run. `auto` tries to run immediately. |
| `max_runtime_seconds` | int | default 600; lease length |
| `max_concurrent` | int | default 1 |

### `sch_trigger` — when it fires (many per task)

| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK → `sch_task(id)` |
| `user_id` | uuid | denormalized for RLS |
| `type` | text | see §3 |
| `config` | jsonb | type-specific config; see §3 |
| `enabled` | bool | per-trigger pause |
| `next_due_at` | timestamptz? | when this specific trigger fires next |
| `last_fired_at` | timestamptz? | bookkeeping |

**v0 limitation.** Today the UI assumes **one trigger per task** (the legacy schema had it inline). Multi-trigger support will arrive when a user can plausibly want "every weekday at 9am AND when this webhook arrives." Build the form for one trigger now; design it so a future "add another trigger" button isn't a rewrite.

### `sch_run` — each execution

| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK → `sch_task(id)` |
| `trigger_id` | uuid? | which trigger fired this; null for manual runs |
| `user_id` | uuid | RLS owner |
| `status` | text | `queued` → `claimed` → `running` → `success` \| `failed` \| `cancelled` \| `skipped` |
| `surface` | text? | which surface picked it up (e.g., `'chrome-extension-chat'`) |
| `queue` | text? | denormalized from task at claim time |
| `output_ref` | jsonb? | polymorphic pointer to whatever the run produced — see §6 |
| `due_at` | timestamptz | when the run was scheduled |
| `claimed_at` | timestamptz? | lease acquired |
| `started_at` | timestamptz? | execution actually began |
| `finished_at` | timestamptz? | terminal status reached |
| `claim_token`, `claim_expires_at` | uuid, ts | lease; if expired, another surface can re-claim |
| `result_summary` | text? | short human summary |
| `error_message` | text? | populated when `status='failed'` |
| `result_metadata` | jsonb? | arbitrary surface-specific payload |

---

## 3. Trigger types

All five live in `sch_trigger.type`. Each has a typed `config` shape.

### `one-shot`
Fires once at a specific time.
```json
{ "at": "2026-05-12T15:00:00Z" }
```
**After firing:** task auto-disables.

### `interval`
Fires every N seconds, starting N seconds from creation.
```json
{ "every_seconds": 3600 }
```
**After firing:** `next_due_at` is bumped by `every_seconds`. Repeats forever (until disabled or `expires_at`).

### `cron`
Fires per a cron expression in a given timezone.
```json
{ "expression": "0 9 * * 1-5", "tz": "America/Los_Angeles" }
```
**v0 note.** No cron parser yet on the client. UI must compute the next fire time and pass it explicitly as `next_due_at` on create/update. A server-side parser will land before public release.

### `heartbeat`
Fires every N seconds, **and all runs append to the same conversation** (`persistent_conversation_id`). Used for long-running monitor-style agents that need memory across pulses.
```json
{ "every_seconds": 60 }
```
**Special behavior.** On the first run, the surface captures the new conversation id and writes it back to `sch_agent_task.persistent_conversation_id`. Every subsequent run appends to that thread.

### `context-match`
Fires when the user navigates to a page matching the criteria. **Not schedule-driven** — `next_due_at` stays null. Currently only the Chrome extension knows how to evaluate these.
```json
{
  "kind": "pull_request",
  "url_pattern": "github\\.com/.+/pull/.+",
  "hostname": "github.com"
}
```
At least one of `kind`, `url_pattern`, `hostname` must be set. Any/all combine with AND.

### Future trigger types (DB accepts; no UI yet)
- `event` — `{ event_name, filter? }` — fired by webhooks or queue events
- `manual` — `{}` — only fires via the UI's "Run now" button
- `dependency` — `{ after_task_id, on: 'success' | 'any' }` — fires when another task completes

---

## 4. Surfaces — where a task can run

The `sch_task.surfaces text[]` column controls **which client is allowed to pick the task up**. Current valid values:

| value | meaning |
|---|---|
| `'any'` | first eligible online surface picks it up |
| `'chrome-extension-chat'` | only the matrx-extend Chrome extension |
| `'desktop'` | the Tauri desktop app (matrx-local) |
| `'web'` | aimatrx.com Next.js app (you) |
| `'mobile'` | future mobile app |
| `'sandbox'` | a sandbox runner (future) |

Pick `'any'` by default. Pick a specific surface only when the task **requires** capabilities only that surface has — e.g., a `context-match` trigger on a Gmail URL only makes sense in the Chrome extension because only the extension can detect the page.

**UI implication.** The "surfaces" picker should default to `'any'` and only expose surface-specific options when the user has selected a trigger type or capability that needs them.

---

## 5. Lifecycle of a scheduled task

```
                  ┌────────────────────────────────────┐
                  │            sch_task                │
                  │  enabled=true, next_due_at=…       │
                  └────────────────────────────────────┘
                                 │
                  scanner finds it (next_due_at <= now AND surfaces match)
                                 │
                  ┌──────────────▼─────────────────┐
                  │   surface inserts sch_run      │
                  │   with claim_token, status=    │
                  │   'claimed', claim_expires_at  │
                  └──────────────┬─────────────────┘
                                 │
                  surface starts execution
                                 │
                  ┌──────────────▼─────────────────┐
                  │   update sch_run set status=   │
                  │   'running', started_at=now,   │
                  │   output_ref={kind,id}         │
                  └──────────────┬─────────────────┘
                                 │
                  execution finishes (or errors / cancelled)
                                 │
                  ┌──────────────▼─────────────────┐
                  │   update sch_run set status=   │
                  │   'success'|'failed'|'cancelled',│
                  │   finished_at=now,             │
                  │   claim_token=null,            │
                  │   result_summary=…             │
                  └────────────────────────────────┘

                  scanner advances sch_task.next_due_at + sch_trigger.next_due_at
                  for recurring kinds; disables the task for one-shot
```

**Lease expiration.** If a surface crashes mid-run, its `claim_expires_at` lapses and any other surface may re-claim. UI should NEVER show a task as "stuck running" — query `sch_run` where `status IN ('claimed','running')` and `claim_expires_at < now()` to detect orphaned leases (they'll get picked up automatically; UI can show "retrying").

---

## 6. The `output_ref` pattern

Different kinds produce different artifacts. Instead of one column per output type, runs point at the artifact polymorphically:

```jsonc
// Agent runs:
{ "kind": "conversation", "id": "<cx_conversation uuid>" }

// Future scrape runs:
{ "kind": "capture", "id": "<wbx_capture uuid>" }

// Future workflow runs:
{ "kind": "workflow_run", "id": "<sch_workflow_run uuid>" }
```

**UI use.** Click a run row → if `output_ref.kind === 'conversation'`, deep-link to the chat thread; if `'capture'`, deep-link to the capture viewer; etc. Always switch on `kind` first.

---

## 7. UI to build (v1)

Four screens. Build them in this order.

### A. List view — "My Schedules"

Route: `/schedules` (or wherever fits the app shell).

**Data source:** `sch_task` joined to `sch_agent_task` and `sch_trigger` (see §8 for the query). Filter `kind = 'agent'`.

**Columns / per-row info:**
- Icon (heart for heartbeat, calendar for cron, clock for one-shot/interval, target for context-match)
- Title (bold) + description (muted)
- Trigger chip ("Every 5 min", "Daily at 9 AM", "When on github.com")
- Surfaces chips
- Next run (relative time)
- Last run (relative time)
- Enabled toggle
- Overflow menu: Run now · Edit · Pause/Resume · Delete

**Empty state.** "No scheduled tasks yet. Create one to have an agent run on a schedule, when a page matches, or as a heartbeat conversation." + Create button.

**Loading state.** Skeleton rows. **Error state.** Inline error banner with retry.

### B. Detail view — single task

Route: `/schedules/[id]`.

**Sections:**
1. **Header** — title, description, enabled toggle, "Run now" button.
2. **Spec card** — agent, prompt (collapsible code block), variables (key/value table), surfaces, auth_mode, max_runtime_seconds.
3. **Trigger card** — type, config rendered human-readable, next run, last run. "Edit trigger" button.
4. **Run history** — last 20 `sch_run` rows for this task. Each row: status pill, started_at, finished_at (or "running"), surface, `result_summary`. Click to expand: `error_message`, `result_metadata`, deep-link via `output_ref`.

### C. Create / Edit modal

Six form sections, top to bottom:

1. **Basics** — `title` (required), `description` (optional).
2. **What to run** — agent picker (queries `agx_agent`; null = platform default), `prompt` (textarea, required), `variables` (key/value editor, optional).
3. **When to run** — trigger type picker (5 chips). Beneath the picker, the type-specific form:
   - **one-shot:** date/time input → `{ at: ISO }`
   - **interval:** number + unit picker (s/m/h/d) → `{ every_seconds }`
   - **cron:** expression input + tz picker → `{ expression, tz }`. v0: also require the user to pick the first fire time (until the parser lands).
   - **heartbeat:** number + unit picker → `{ every_seconds }`
   - **context-match:** three optional inputs (kind, url_pattern regex, hostname). Show a "this fires only in the Chrome extension" hint.
4. **Where to run** — surfaces multi-select. Default `['any']`. Tooltip explaining each option.
5. **How to run** — auth_mode toggle (Ask vs Auto), `max_runtime_seconds` (default 600).
6. **Tags** — chip-input.

**Validation:**
- `title` required, ≤ 200 chars
- `prompt` required, ≤ 10,000 chars
- Trigger-specific config (e.g., `every_seconds >= 60` for interval/heartbeat; valid ISO for one-shot)
- `surfaces` non-empty

**Submit behavior.** Create → POST 3 rows (`sch_task`, `sch_agent_task`, `sch_trigger`) as in §8. Edit → PATCH the rows that changed. Show optimistic state in the list while writing.

### D. Run history list (per task; also a global "All runs" view if useful)

**Columns:** status pill (color-coded), task title (link), started_at (relative), duration, surface, `result_summary`.

**Filter chips:** status (all / queued / running / success / failed), surface, date range.

**Row expansion:** error_message, result_metadata pretty-printed, "Open conversation" / "Open capture" deep-link via `output_ref`.

---

## 8. Data access — recommended FE shape

Build a façade module in the matrx-frontend codebase that mirrors [`src/lib/agenda/queries.ts`](../src/lib/agenda/queries.ts). All access via `supabase-js`; RLS handles authorization automatically.

### The reusable select string

```ts
const SELECT_AGENT_TASK =
  '*, agent:sch_agent_task!inner(agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent), triggers:sch_trigger(id, type, config, enabled, next_due_at)';
```

### List

```ts
const { data } = await supabase
  .from('sch_task')
  .select(SELECT_AGENT_TASK)
  .eq('kind', 'agent')
  .order('updated_at', { ascending: false });
```

Reshape each row into a flat `AgendaTask` object (see [queries.ts](../src/lib/agenda/queries.ts) `rowToAgendaTask`).

### Create (three sequential inserts)

```ts
// 1. sch_task
const { data: t } = await supabase
  .from('sch_task')
  .insert({ kind: 'agent', title, description, surfaces, next_due_at, /* … */ })
  .select('id').single();

// 2. sch_agent_task — cleanup parent on failure
const { error: e1 } = await supabase.from('sch_agent_task').insert({
  id: t.id, agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent,
});
if (e1) { await supabase.from('sch_task').delete().eq('id', t.id); throw e1; }

// 3. sch_trigger
const { error: e2 } = await supabase.from('sch_trigger').insert({
  task_id: t.id, type, config, enabled: true, next_due_at,
});
if (e2) { await supabase.from('sch_task').delete().eq('id', t.id); throw e2; }
```

> **Why three writes, not one.** The 1:1 inheritance and the 1:N trigger relationship can't be inserted in one `from().insert()` call. A future `create_agent_task` Postgres function will collapse this into a single atomic RPC; build the façade so swapping it in is a one-line change.

### Update

Split the patch across the three tables. See [queries.ts](../src/lib/agenda/queries.ts) `updateTask` for the field→table mapping.

### Delete

`supabase.from('sch_task').delete().eq('id', taskId)` — FK CASCADE drops `sch_agent_task`, `sch_trigger`, `sch_run` rows automatically.

### Run now (manual fire)

Insert a `sch_run` row directly:

```ts
await supabase.from('sch_run').insert({
  task_id, trigger_id: null, status: 'queued', surface: 'web',
  queue: 'default', due_at: new Date().toISOString(),
});
```

Then either (a) execute inline on the FE if the surface is `'web'` and the agent stack is available, or (b) let a backend worker pick it up. Web-surface execution is a v2 question — for v1, only the Chrome extension actually executes runs.

### Run history

```ts
const { data } = await supabase
  .from('sch_run')
  .select('*')
  .eq('task_id', taskId)
  .order('created_at', { ascending: false })
  .limit(20);
```

---

## 9. Permissions (RLS)

All four tables are RLS-protected with owner-only policies: a row is readable / writable only if `user_id = auth.uid()`. The user's JWT (set via `supabase.auth.setSession`) is the authority. **No server-side admin endpoints needed for v1** — direct Supabase access from the browser is the model.

`sch_agent_task` ownership flows through the parent `sch_task` (EXISTS subquery in its policy). All other tables denormalize `user_id` for one-line policies.

---

## 10. Real-time updates (optional, but recommended)

Subscribe to `sch_run` changes on visible tasks so the UI updates live as runs progress:

```ts
supabase
  .channel('sch_run-changes')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'sch_run', filter: `task_id=eq.${taskId}` },
      (payload) => /* re-render */)
  .subscribe();
```

Use this in the detail view's Run History card. For the list view, subscribe to `sch_task` UPDATE events so `next_due_at` and `last_run_at` stay fresh without polling.

---

## 11. v0 scope summary

**Works today**
- All 4 tables live in production
- 1 task + 17 historical runs migrated from `agenda_*`
- Chrome extension creates, edits, scans, executes, and reports agent-kind tasks against the new schema (see [queries.ts](../src/lib/agenda/queries.ts))
- All 5 trigger types insertable; one-shot / interval / heartbeat / context-match fully functional; cron requires caller-computed `next_due_at`

**Not yet built**
- Cron parser (caller must compute `next_due_at`)
- Multi-trigger UI (1 trigger per task in v0)
- Web-surface execution (web surfaces can create tasks but only the Chrome extension currently executes them)
- Workflow / scrape / webhook / user-action kinds (DB constraint rejects them; widening lands per-kind in its own migration)
- DB trigger that auto-maintains `sch_task.next_due_at` from `sch_trigger` (application maintains it today)

**Not changing**
- Table names and column shapes are stable. New kinds add sibling tables; the spine doesn't move.

---

## 12. Glossary

- **Task** — a scheduled unit of work (`sch_task` row). Has a kind, a definition, triggers, and a run history.
- **Trigger** — a rule that decides when a task fires (`sch_trigger` row). Many per task in the future; one per task today.
- **Run** — a single execution attempt (`sch_run` row). Goes through claimed → running → terminal state.
- **Surface** — a client capable of claiming and executing tasks. Web app, Chrome extension, desktop app, mobile app, future server workers.
- **Lease** — the `claim_token` + `claim_expires_at` pair. Lets multiple surfaces race for pickup without double-running.
- **Output ref** — polymorphic pointer in `sch_run.output_ref` to whatever artifact the run produced.

---

## 13. Where to ask

- DB / schema / migration questions: this doc + the migration file.
- Agent runtime / streaming / how runs actually execute: [`src/lib/agenda/runner.ts`](../src/lib/agenda/runner.ts) and [`src/lib/agenda/scanner.ts`](../src/lib/agenda/scanner.ts) in matrx-extend.
- Cross-repo integration shape: [`docs/CROSS_REPO_INTEGRATION.md`](./CROSS_REPO_INTEGRATION.md).
- Naming conventions for future `sch_*` tables: §1 of [`migrations/2026_05_10_sch_v0.sql`](../migrations/2026_05_10_sch_v0.sql) (the header doc-comment is the canon).
