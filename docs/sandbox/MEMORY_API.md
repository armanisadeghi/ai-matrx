# Per-User Memory — Integration Guide (for the matrx-frontend team)

Status: **backend live** (hosted orchestrator) · Date: 2026-05-23

A small, central, **cross-project** per-user memory: text files (markdown,
notes, preferences) that follow a *user* across every project, tier, and
sandbox — including the ephemeral slim/EC2 boxes that keep no volume. It backs
`/home/agent/.matrx/memory/` inside every sandbox.

This doc is for building the **UI**. The backend (table + orchestrator sync +
REST) is already deployed and verified.

---

## The model in one paragraph

Memory is keyed on **`user_id` only** — *not* project, tier, or sandbox — so
it's the same everywhere. The orchestrator **hydrates** it into a box's
`.matrx/memory/` on create/resume, and **captures** any edits back on graceful
teardown (the reaper/expiry path). The canonical copy lives in one Postgres
table; the box copy is just a working mirror for that session.

---

## The data — `user_memory` (Matrx Main / `txzxabzwovsujtloxrus`)

```
user_memory
  id          uuid pk
  user_id     uuid  -> auth.users(id) on delete cascade
  path        text  -- relative under .matrx/memory/, e.g. 'preferences.md', 'projects/acme.md'
  content     text
  labels      jsonb null
  created_at  timestamptz
  updated_at  timestamptz (auto-updated by trigger)
  UNIQUE (user_id, path)
```

RLS is on: a user can `select/insert/update/delete` **their own** rows
(`auth.uid() = user_id`). It's the same Supabase project this repo already
uses, so **the UI should read/write it Supabase-direct** (per matrx-frontend
doctrine — no Next.js middle tier for user data).

### A user editing their own memory (Supabase-direct, recommended)

```ts
// list
const { data } = await supabase
  .from('user_memory')
  .select('path, content, updated_at')
  .order('path');

// upsert one entry
await supabase
  .from('user_memory')
  .upsert({ user_id: user.id, path: 'preferences.md', content }, { onConflict: 'user_id,path' });

// delete one
await supabase.from('user_memory').delete().eq('path', 'preferences.md');
```

> `user_memory` is a brand-new table — **regenerate Supabase types** so it's in
> `types/database.types.ts` before relying on it (currently absent).

### An admin viewing/editing ANY user's memory

This crosses the RLS boundary, so it's the **admin secret-token exception**: a
super-admin-gated Next.js route using `createAdminClient()` (mirror
`app/api/admin/sandbox/route.ts` — `checkIsSuperAdmin` gate). Query
`user_memory` filtered by the target `user_id`. Treat it like the existing
admin sandbox surfaces.

---

## Orchestrator REST (alternative path — for non-Supabase clients)

The orchestrator also exposes memory over its API (auth: `X-API-Key`). The UI
generally won't need this — it's what the in-box agent and server-side tooling
use — but it's here for completeness. Both tiers share the one table, so either
orchestrator works.

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/users/{user_id}/memory` | → `{ user_id, entries: [{path, content, updated_at}], total }` |
| PUT | `/users/{user_id}/memory/{path}` | `{ "content": "..." }` → upsert |
| DELETE | `/users/{user_id}/memory/{path}` | 204; 404 if absent |

```bash
curl -X PUT https://orchestrator.dev.codematrx.com/users/$UID/memory/preferences.md \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"# Prefs\nConcise answers. TypeScript.\n"}'
```

---

## When does memory change under the UI's feet?

- **On sandbox create/resume:** the orchestrator writes the user's memory into
  the new box. (No change to the central rows — it's a read-out.)
- **On graceful teardown / expiry:** the orchestrator reads `.matrx/memory/`
  back and **upserts** changed/added files. So after a session ends, the
  central rows may have new content the user (or agent) wrote in the box.
- The UI should refetch on focus / after a sandbox the user owns transitions to
  `expired`/`stopped` if it wants to reflect in-session edits promptly. A
  Supabase realtime subscription on `user_memory` (RLS-scoped) is the clean way.

---

## Guardrails (enforced server-side on capture)

- Text only — non-UTF-8 files in `.matrx/memory/` are skipped (the column is text).
- ≤ 256 KB per file, ≤ 5 MB total captured per teardown. Memory is notes, not data.
- Paths are normalized and traversal-safe (`..` rejected; no leading `/`).

---

## Suggested UX (not prescriptive)

- A "Memory" panel (settings or the sandbox area): list files by `path`, edit
  content in a markdown editor, save (upsert), delete (with `ConfirmDialog`).
- Show `updated_at` so the user sees when the agent last touched a file.
- Seed affordance: a "preferences.md" starter so users discover the feature.
- Admin: surface a user's memory from the admin sandbox page (super-admin route).

Backend questions → `orchestrator/routes/users.py` (REST),
`orchestrator/memory_sync.py` (hydrate/capture), `orchestrator/store.py`
(`memory_list/put/delete`), migration `004_user_memory.sql`.
