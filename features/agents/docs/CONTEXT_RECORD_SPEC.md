# Context Record Spec — durable, per-turn "what context did the model actually receive"

**Status:** ✅ **IMPLEMENTED 2026-06-20 — but NOT as specced below.** The durable record was built as **typed columns on `cx_message`** (`tools_on_call`, `model_context`, `error`, `voice`), NOT the `cx_message_context_snapshot` table this doc proposed (which predated the discovery that `cx_request_snapshot` already captures the full wire payload — a second blob table was redundant). The context chips now read **`cx_message.model_context.items`** (mapped to `InstanceContextEntry` in `AgentUserMessage.tsx`), no longer `metadata.context_snapshot` (kept only as the optimistic in-session fallback). Authoritative impl, column shapes, and the post-deploy data migration: **aidream `docs/cx_chat/CX_MESSAGE_CALL_RECORD.md`**. The sections below are retained for design rationale only — do not build from them.
**Origin:** [`KNOWN_DEFECTS.md` D11](../../../KNOWN_DEFECTS.md). The frontend froze a client-side `context_snapshot` at submit; the server now owns the durable record via `model_context`.

---

## 1. The problem (verified against Matrx Main `txzxabzwovsujtloxrus`, 2026-06-19)

**There is no place — none — that records the context the model actually received for a turn.** We assemble org + scopes + project + task + deferred context items + working document + system instruction into a request, send it, and throw the assembled result away. Every audit query was run live:

- `cx_message.metadata` (user turns): only `abandon_reason` / `watchdog_*` / `voice`. No context.
- `cx_message.user_content`: 0 non-null rows.
- `cx_user_request.metadata`: only `response_id` + `usage_by_model` (token/cost telemetry).
- `cx_request.metadata`: only tool `call_id`s. `cx_request.trim_summary`: tool-output *trimming*, not input context. `cx_request.raw_usage`: provider usage.
- `cx_conversation.metadata`: keys are `conversation_step_label` / `skills_ingested_for` / `voice` / `observational_memory` — **no `context` key exists in any row** (the frontend `loadConversation` reads `metadata.context`, but it is never written).
- `cx_conversation.last_context_breakdown`: **always null**.
- `ctx_context_access_log` — purpose-built for this (`request_id`, `context_item_id`, `value_id`, `value_version`, `char_count_served`, `fetch_reason`, `was_useful`, `latency_ms`): **0 rows. Scaffolded, never wired.**
- `ctx_user_active_context`: **0 rows** (and it's "current global selection", not a per-turn record).

**Consequence.** We cannot answer the most basic trust/debugging/eval questions: *What did the agent see on turn 7? Which scope cell version was injected? Why did the answer change after I edited a context item? Did the working document actually reach the model?* The UI that claimed to show this was reading live state and lying (D11).

**Why it matters beyond debugging.** This record is the substrate for: context attribution ("which context item drove this answer"), `was_useful` feedback loops, automatic variable application, cost/char budgeting per context layer, reproducibility/replay, and compliance ("prove what data the model was given").

---

## 2. What "context" means here — the layers to capture

The record must capture the **resolved** context (what the server actually injected), not just the request inputs (what the client asked for). The two differ: the client sends `scope_ids` + tags; the server's `resolve_full_context` unions them, dereferences cells, applies versions, trims, and renders the final blocks.

Layers, in resolution order:

1. **Scope selection** — `organization_id`, `project_id`, `task_id`, `scope_ids[]` (the request inputs) **→ resolved to** the concrete `ctx_context_items` + `ctx_context_item_values` (with `value_version`) that were dereferenced.
2. **Deferred context dict** — the `context` map sent in the request (key → value, slot-matched or ad-hoc). What the agent retrieves via `ctx_get`.
3. **Working document** — content + title + binding (if enabled), and whether it was injected this turn.
4. **System instruction** — the final system prompt string actually sent (agent base + conversation override + any ambient injection).
5. **Ambient / first-turn context** — `user` block and any one-shot first-send merges.
6. **Variables** — the resolved `variables` map substituted into the prompt.

For each, record **provenance** (source table + id + version), **char_count** (budget accounting), and **whether it was actually injected** (vs. selected-but-trimmed).

---

## 3. What to store — recommended schema

Two complementary records: a **granular access log** (one row per served context item) and a **per-turn snapshot blob** (the full assembled ground truth). Build both; they answer different questions.

### 3a. Granular: populate the existing `ctx_context_access_log` (already designed — just wire it)

One row per context item value served for a request. The table already exists with the right columns. Wire the writer in `resolve_full_context` and add the two missing keys we need to join cleanly:

```sql
-- Additive, idempotent. The table exists and is empty; safe to extend.
alter table public.ctx_context_access_log
  add column if not exists conversation_id uuid references public.cx_conversation(id) on delete cascade,
  add column if not exists message_id      uuid references public.cx_message(id)      on delete set null;

create index if not exists ctx_context_access_log_request_idx
  on public.ctx_context_access_log (request_id);
create index if not exists ctx_context_access_log_conversation_idx
  on public.ctx_context_access_log (conversation_id, accessed_at desc);
```

Write one row per served item with: `context_item_id`, `value_id`, `value_version`, `request_id` (→ `cx_user_request.id`), `message_id` (the user turn), `conversation_id`, `agent_id`, `app_source`, `char_count_served`, `fetch_reason` (`'scope_selection' | 'tag_union' | 'deferred_context' | 'working_document' | 'ambient'`), `latency_ms`. Leave `was_useful` null at write time — it is a later feedback signal.

### 3b. Durable snapshot: the full assembled context per turn

The granular log can't reconstruct the *exact* system prompt / working-doc text / variable substitutions. Store the assembled ground truth once per turn. **Recommended: a dedicated table** (keeps `cx_message` rows lean; the snapshot can be large and is read on demand, not on every bundle load):

```sql
create table if not exists public.cx_message_context_snapshot (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.cx_message(id) on delete cascade,
  user_request_id uuid references public.cx_user_request(id) on delete set null,
  conversation_id uuid not null references public.cx_conversation(id) on delete cascade,
  -- The resolved layers (section 2), each as captured at send time:
  scope_selection jsonb not null default '{}'::jsonb,   -- {organization_id, project_id, task_id, scope_ids[]}
  resolved_items  jsonb not null default '[]'::jsonb,    -- [{context_item_id, value_id, value_version, label, char_count, injected}]
  deferred_context jsonb not null default '{}'::jsonb,   -- the `context` dict (key→{value,type,label,slotMatched})
  working_document jsonb,                                -- {title, char_count, injected, binding} (NOT necessarily full text — see Q3)
  system_instruction_sha text,                           -- hash of final system prompt (full text optional — see Q2)
  system_instruction_chars integer,
  variables       jsonb not null default '{}'::jsonb,
  total_context_chars integer,
  created_at      timestamptz not null default now()
);

create unique index if not exists cx_message_context_snapshot_message_uidx
  on public.cx_message_context_snapshot (message_id);
create index if not exists cx_message_context_snapshot_conversation_idx
  on public.cx_message_context_snapshot (conversation_id, created_at desc);
```

RLS: same ownership rule as `cx_message` (user owns rows for conversations they own; read-only to the user, writes via the backend/service role).

> **Alternative (lighter, frontend already wired for it):** instead of a table, write the snapshot to `cx_message.metadata.context_snapshot` as `InstanceContextEntry[]` + a `scope_layers` block. The frontend D11 read path **already keys off `cx_message.metadata.context_snapshot`** and will light up with zero further frontend change. Downside: bloats every `cx_message` row and rides the conversation bundle on every load. Pick the table for completeness/scale; pick the metadata key for the fastest path to "the UI stops lying after reload." **These are not exclusive** — write the compact display entries to `metadata.context_snapshot` (cheap, drives the chips) AND the full blob to the table (complete, drives audit/eval).

---

## 3c. Reconciliation with the backend's existing `context_manifest` (DISCOVERED 2026-06-19)

The backend already has code that writes `metadata.context_manifest = { rendered, inline_keys, deferred_keys }` — a different key and a different shape than the frontend's `metadata.context_snapshot: InstanceContextEntry[]`. **Important:** as of 2026-06-19 the manifest is **code-only — it appears in ZERO production rows** (scanned `cx_message` / `cx_request` / `cx_user_request` / `cx_conversation` for `context_manifest` / `inline_keys` / `deferred_keys`: 0). Whatever ships must be verified to actually land in `cx_message.metadata` live.

**The FE's exact expected shape (the contract — do not change FE to match the manifest):**

```ts
// cx_message.metadata.context_snapshot : InstanceContextEntry[]
interface InstanceContextEntry {
  key: string;
  value: unknown;
  slotMatched: boolean;                 // matched an agent-defined context slot?
  type: ContextObjectType;              // union below
  label: string;
}
type ContextObjectType =
  | "text" | "file_url" | "json" | "db_ref"
  | "user" | "org" | "workspace" | "project" | "task" | "variable";
```

`context_manifest` (keys + rendered blob) lacks the per-entry `value` / `type` / `label` the chip UI requires, so having the FE read the manifest forces a lossy translation and discards the clean D11 path.

**Recommendation — backend emits BOTH keys on the user `cx_message`; they're different layers, not competitors:**
- Keep `context_manifest` for rich audit (rendered text, inline/deferred split) → feeds the Context Inspector + the snapshot table (§3b).
- Additionally derive `context_snapshot` in the FE shape above (trivial from what the manifest already computes). For each key in `inline_keys ∪ deferred_keys`: `{ key, value, slotMatched: key∈slot keys, type: slot.type ?? infer(value), label: slot.label ?? key }`. Inference rule (FE's): string→`"text"`, URL string→`"file_url"`, object/array→`"json"`. Prefer the slot's declared type/label when slot-matched (the backend knows this authoritatively; the FE only infers).

Result: one backend source of truth, the FE chips light up on reload with **zero frontend change**.

---

## 4. When to write it (backend)

Write at the single point where context is resolved for a turn — `resolve_full_context` (or wherever the assembled payload is finalized before the provider call), inside the same transaction that reserves the user `cx_message`:

1. Resolve scopes → items → values (you already do this).
2. As you dereference each value, **append a `ctx_context_access_log` row** (3a).
3. After assembly, **write one `cx_message_context_snapshot`** (3b) with the totals + the compact display entries mirrored to `cx_message.metadata.context_snapshot`.
4. All of it keyed by `message_id` + `user_request_id` so it joins to the turn and survives reload.

Idempotency: re-running a turn (retry/fork) must upsert on `message_id`, not duplicate.

---

## 5. How the frontend consumes it

- **User bubble chips** (already built, D11): `AgentUserMessage` reads `cx_message.metadata.context_snapshot`. Once the backend writes it, reloaded historical turns show their **true** context automatically — no frontend change.
- **Context inspector (new, follow-up):** a drawer that loads `cx_message_context_snapshot` + `ctx_context_access_log` for a turn → renders the full resolved layers, per-item versions, char budget, and (later) `was_useful` toggles. Natural home: the existing context-items drawer (`features/agents/components/context-items/`).
- **`was_useful` feedback:** later, the inspector or an eval pass writes `ctx_context_access_log.was_useful`.

The frontend D11 freeze stays as the **optimistic, in-session** source (instant display before the server snapshot lands); the server snapshot is authoritative on reload. If both exist, server wins.

---

## 6. Acceptance criteria

1. Every committed user turn produces exactly one `cx_message_context_snapshot` row and N `ctx_context_access_log` rows (N = items served), all joinable by `message_id` / `request_id` / `conversation_id`.
2. `select` for any historical turn returns the exact scope ids, item+value **versions**, deferred-context keys, working-doc injection flag, system-prompt hash+char count, and variables that were sent.
3. After a full page reload, the user bubble shows the same context chips it showed live (server snapshot drives them).
4. Retries/forks upsert, never duplicate.
5. Zero context recorded ⇒ zero chips (no fabrication). The class of "UI shows current context as historical" is structurally impossible because the read path is keyed to an immutable per-message row.

---

## 7. Open questions (decide before building)

1. **Granularity of `resolved_items`** — log every value version, or only the head version + a flag when stale? (Recommend: every version actually injected — that's the whole point.)
2. **Full system prompt vs. hash** — store the full final system-instruction text (replay-complete, but large/possibly sensitive) or just `sha + char_count` (cheap, dedupes, but not replayable)? Recommend hash by default + opt-in full-text capture behind a per-org flag.
3. **Working document text** — full text every turn (durable replay, large) or just `{char_count, injected, sha}` with the text living in `cx_working_documents` history? Recommend the latter (don't duplicate the doc body per turn).
4. **Retention** — snapshots are append-only and can grow fast on long conversations. TTL / archival policy? (e.g. keep full blob 90 days, keep the access-log + totals indefinitely.)
5. **Table vs. metadata-key** (section 3b) — confirm we want both (recommended) or table-only.

---

## Change Log

- `2026-06-19` — claude: added §3c reconciling the backend's existing (code-only, 0 prod rows) `context_manifest` with the FE's `context_snapshot: InstanceContextEntry[]` — recommend the backend emit both keys; derive the snapshot from the manifest's `inline_keys`/`deferred_keys`.
- `2026-06-19` — claude: initial spec. Written after confirming live in Matrx Main that no per-turn (or per-conversation) record of the assembled context exists anywhere, and that the two purpose-built tables (`ctx_context_access_log`, `ctx_user_active_context`) are empty/unwired. Folds in the D11 frontend snapshot as the optimistic layer.
