# Phase 1 + Phase 2.0 — Frontend handoff

**Status:** Both phases shipped to aidream. **No existing endpoint behavior changed.** The frontend does not need any immediate updates — these are purely additive backend changes that the FE can opt into when ready.

This doc covers two things:
1. **Phase 1 — matrx-scheduler HTTP surface** (new richer CRUD for scheduled tasks, mounted at `/scheduler/*`)
2. **Phase 2.0 — dedup foundation** (new strict-intent endpoints at `/dedup/*` + schema additions)

For each, you'll find: what's new, what does NOT change, what's optional to adopt, and copy-paste code examples for any new endpoints.

---

## TL;DR — what the FE must do today

**Nothing required.** All existing endpoints (`/files/*`, `/pdf/full-pipeline`, `/scheduling/*`, `/page-extraction/*`, `/rag/*`) still produce identical responses for identical requests. Schema additions are nullable / have defaults; old PostgREST queries keep working.

The new endpoints are opt-in. Two will eventually become the default (file upload with `intent`, and "extract this document" with `intent`), but only after a coordinated FE/BE flip. Until that flip, the FE can keep doing exactly what it does today.

---

## Phase 1 — matrx-scheduler HTTP surface

### What shipped

The matrx-scheduler package gained a full FastAPI router exposing 16 endpoints under `/scheduler/*`. These are **NEW** — they don't replace any existing routes.

aidream's existing `/scheduling/*` routes (validate-cron, run-now, scanner-status, force-disable) are **untouched**. Both prefixes coexist:

| Prefix | Owner | Status |
|---|---|---|
| `/scheduling/*` (gerund) | aidream's own router | unchanged from before |
| `/scheduler/*` (singular) | matrx-scheduler package | new, optional to use |

### What the FE should know

aidream **mounts both** today. If your existing FE code calls `/scheduling/validate-cron` etc., it continues to work identically. The new prefix exists primarily for matrx-local (the desktop app, which has no scheduling routes of its own and needs the full surface).

### Optional adoption: the new `/scheduler/*` endpoints

If you want richer task management (full CRUD on tasks/triggers/runs from the FE), the new endpoints are available. Otherwise skip this section.

#### Endpoints (alphabetical)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/scheduler/compute-next-due-at` | Compute next_due_at for a trigger config |
| `POST` | `/scheduler/cron/preview-fires` | Preview next N fires for any trigger type |
| `POST` | `/scheduler/cron/validate` | Validate cron expression + preview fires |
| `GET` | `/scheduler/runs?task_id=...&status=...&limit=...&offset=...` | List run history (RLS-scoped) |
| `GET` | `/scheduler/runs/{run_id}` | Get one run |
| `GET` | `/scheduler/status` | Scanner health (admin only) |
| `POST` | `/scheduler/tasks` | Create a task (optionally with agent_task + trigger) |
| `GET` | `/scheduler/tasks?kind=...&enabled=...&limit=...&offset=...` | List tasks |
| `GET` | `/scheduler/tasks/{id}?runs_limit=10` | Get task hydrated with agent_task + triggers + recent runs |
| `PATCH` | `/scheduler/tasks/{id}` | Patch task fields |
| `DELETE` | `/scheduler/tasks/{id}` | Soft-delete (set enabled=false) |
| `POST` | `/scheduler/tasks/{id}/run-now` | Manual fire via `sch_enqueue_manual_run` |
| `GET` | `/scheduler/triggers?task_id=...` | List triggers for a task |
| `POST` | `/scheduler/triggers` | Create a trigger on an existing task |
| `PATCH` | `/scheduler/triggers/{id}` | Patch trigger (recomputes next_due_at on type/config change) |
| `DELETE` | `/scheduler/triggers/{id}` | Hard-delete trigger |

#### Example: create a task with a cron trigger

```ts
const res = await fetch("/scheduler/tasks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwt}`,
  },
  body: JSON.stringify({
    kind: "agent",
    title: "Weekly digest",
    description: "Generates a digest every Monday at 9am",
    enabled: true,
    surfaces: ["any"],
    agent_task: {
      agent_id: "<agx_agent uuid>",
      prompt: "Generate a digest of last week's activity",
      variables: {},
      max_runtime_seconds: 300,
    },
    trigger: {
      type: "cron",
      config: { expression: "0 9 * * 1", tz: "UTC" },
      enabled: true,
    },
  }),
});
// 201 -> { task: {...}, agent_task: {...}, triggers: [{...}], recent_runs: [] }
// 401 if not authenticated; 400 if kind invalid; 4xx with Supabase error otherwise
```

#### Example: validate a cron expression

```ts
const res = await fetch("/scheduler/cron/validate", {
  method: "POST",
  headers: { /* … */ },
  body: JSON.stringify({ expression: "0 9 * * 1-5", tz: "UTC", next_n: 5 }),
});
// { valid: true, error: null, next_fires_utc: ["2026-05-19T09:00:00+00:00", …] }
```

Auth: every endpoint requires a Bearer JWT. The server resolves a per-request Supabase client; RLS enforces ownership.

---

## Phase 2.0 — Dedup foundation

This is the bigger one. It introduces a four-level pyramid for content provenance:

```
file (cld_files)
  → ONE initial_extract (per content_hash + extractor + version)
    → MANY clean variants (per cleaner + version + params_hash)
       ↳ one is the canonical (the "official" cleanup)
    → MANY derivatives (agent extracts, summaries, etc.)
       ↳ each user-controlled, no canonical
  → MANY chunks (per chunker + version + chunk_index)
```

Every level has a strict-intent contract: callers declare WHAT they're doing and the server either does exactly that or refuses with a 409. **No upsert ambiguity.**

### What changed (and what didn't)

#### Schema (all additive, no breaking changes)

**`cld_files`** — new columns:
- `duplicate_of_file_id` (uuid, nullable) — when set, this row is a deliberate parallel copy of the referenced canonical
- `canonical_processed_document_id` (uuid, nullable) — points at the "official" initial_extract for this file

**`processed_documents`** — new columns:
- `file_content_hash` (text) — sha256 of source bytes (the dedup key for raw extraction)
- `extractor_name`, `extractor_version` (defaults `'pymupdf'` / `'v1'`)
- `cleaner_name`, `cleaner_version` — populated on `re_clean` rows
- `params_hash` (text) — sha256 of params; lets variants with different prompts coexist
- `canonical_clean_id` (uuid, nullable) — points at the "official" clean variant
- `rag_boost` (smallint, default 0) — user-controlled retrieval boost
- `replace_reason` (text) — audit when `replace_extract` / `replace_clean` was used
- `clean_content_completed_at`, `clean_content_cost_usd`
- `archived_at`, `archived_reason` — soft-delete for individual rows

**`agx_agent`** — new column:
- `default_rag_boost` (smallint, default 0) — when this agent produces extractions, its derivatives inherit this boost

**`page_extraction_jobs`** — new column:
- `rag_boost` (smallint, nullable) — per-job override of the agent default

**`rag.kg_chunks`** — new columns:
- `priority` (smallint, default 0) — retrieval ranking multiplier
- `derivation_kind` (text, default `'initial_extract'`)
- `derived_from_chunk_id` — lineage to a source chunk
- `agent_id`, `extraction_run_id`, `extraction_result_id` — provenance to the agent extraction that produced this chunk

**Extended CHECK constraints** — `derivation_kind` on both `processed_documents` and `rag.kg_chunks` now allows:
- `agent_extract`, `agent_summary`, `agent_structured_json`, `page_image_caption`, `manual_curation` (in addition to the existing values)

**FE implications:**
- Existing PostgREST queries selecting all columns from these tables will see extra fields with safe defaults. No breaking change.
- If you have generated TypeScript types from the schema, regenerate them when you're ready. New fields are mostly nullable / numeric.

#### Endpoints

aidream gained 6 new endpoints under `/dedup/*`. All existing endpoints (`/files/*`, `/pdf/full-pipeline`, `/page-extraction/*`, `/rag/*`) are **untouched**.

Endpoints list:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/dedup/processed-documents/extract` | Create or reuse an `initial_extract` row |
| `POST` | `/dedup/processed-documents/{id}/clean` | Create or reuse a `re_clean` variant |
| `POST` | `/dedup/processed-documents/{id}/derivative` | Create or reuse a derivative (agent extract, summary, …) |
| `POST` | `/dedup/files/{file_id}/set-canonical-extract` | Promote a processed_document to canonical for its file |
| `POST` | `/dedup/processed-documents/{id}/set-canonical-clean` | Promote a re_clean to canonical for its parent |
| `POST` | `/dedup/processed-documents/{id}/archive` | Soft-archive a processed_document |

### The intent contract

Every dedup endpoint requires an explicit `intent` field. The server returns 409 if intent and reality conflict. There is **no auto-create-or-update** behavior; the FE must declare what it's trying to do.

#### Initial extraction

| `intent` | Behavior |
|---|---|
| `extract` | 201 on success. **409** if an extract already exists. Use this when you expect to create a new row. |
| `get_or_extract` | Returns existing if present (200), else creates (201). Safe idempotent verb. Use this when you just want "make sure an extract exists." |
| `replace_extract` | Requires `reason` (≥ 4 chars). Creates a NEW `re_extract` row chained to the existing canonical via `parent_processed_id`. Does NOT auto-promote — call `set-canonical-extract` separately if you want the new row to become THE one. |

#### Clean variant

| `intent` | Behavior |
|---|---|
| `clean` | 201 or **409** if a variant with the same `(parent, cleaner, version, params_hash)` exists. |
| `get_or_clean` | Reuse or create. |
| `replace_clean` | Requires `reason`. Creates a new `re_clean` chained to parent. Does NOT auto-promote. |

#### Derivative (agent extracts, summaries, captions)

| `intent` | Behavior |
|---|---|
| `create_derivative` | 201 or **409** if a row with same `(parent, kind, agent_id, agent_version, params_hash)` exists. |
| `get_or_create_derivative` | Reuse or create. |

There is **no** `replace_derivative` intent. To "replace," either:
- Submit with different `params` (different `params_hash` → new row, both coexist), or
- Archive the existing one (`POST /dedup/processed-documents/{id}/archive`), then create a fresh one.

### 409 response shape (FE handling)

Every 409 carries the existing row id and the allowed alternative intents. The FE should surface this to the user and let them choose.

```json
{
  "detail": {
    "error": "extraction_exists",
    "status_code": 409,
    "message": "An initial_extract already exists for this content (file_content_hash=ab12cd34ef56…, extractor=pymupdf/v1, id=…). Use intent='get_or_extract' to reuse, or 'replace_extract' with a reason to create a re_extract derivation.",
    "existing_id": "<uuid>",
    "file_content_hash": "<sha256>",
    "extractor": "pymupdf",
    "version": "v1",
    "allowed_intents": ["get_or_extract", "replace_extract"]
  }
}
```

Other 409 codes follow the same shape with different `error` values: `duplicate_file`, `clean_variant_exists`, `derivative_exists`.

### Code examples

#### Create or reuse an extraction (the safe verb)

```ts
const res = await fetch("/dedup/processed-documents/extract", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
  body: JSON.stringify({
    intent: "get_or_extract",
    source_kind: "cld_file",
    source_id: fileId,
    file_content_hash: sha256OfFileBytes,  // 64-char hex
    extractor_name: "pymupdf",
    extractor_version: "v1",
    name: "report.pdf",
    mime_type: "application/pdf",
    total_pages: 87,
    source_hash: sha256OfExtractedText,
    storage_uri: `supabase://files/${fileId}`,
    content: rawExtractedText,
    structured_json: { pages: [...] },  // optional
    organization_id: orgId,              // optional; falls back to ctx.organization_id
    rag_boost: 0,
    metadata: {},
  }),
});
// 200 if reused: { outcome: "reused", id, derivation_kind: "initial_extract", … }
// 201 if created: { outcome: "created", id, derivation_kind: "initial_extract", … }
```

#### Create an extraction with fail-on-collision

```ts
const res = await fetch("/dedup/processed-documents/extract", {
  method: "POST",
  body: JSON.stringify({ intent: "extract", /* … */ }),
});
if (res.status === 409) {
  const body = await res.json();
  // body.detail.existing_id is the row to reuse
  // Show UI: "This document is already extracted. [Reuse existing] [Replace with reason]"
}
```

#### Run a cleanup variant on an existing extract

```ts
const res = await fetch(
  `/dedup/processed-documents/${initialExtractId}/clean`,
  {
    method: "POST",
    body: JSON.stringify({
      intent: "clean",
      cleaner_name: "gpt-4o-mini",
      cleaner_version: "v1",
      params: { prompt_template: "medical_focused", temperature: 0.0 },
      clean_content: cleanedTextProducedByYourLLMCall,
      cost_usd: 0.23,
      rag_boost: 0,
    }),
  },
);
// 201 with row + first cleanup also auto-sets the parent's canonical_clean_id.
// 409 if a variant with the same cleaner+version+params_hash already exists.
```

#### Record an agent-driven extraction as a derivative

This is the "WC Ellie Data Extraction" case — agent outputs structured fields and you want them as a first-class document.

```ts
const res = await fetch(
  `/dedup/processed-documents/${initialExtractId}/derivative`,
  {
    method: "POST",
    body: JSON.stringify({
      intent: "create_derivative",
      derivation_kind: "agent_structured_json",
      agent_id: agxAgentId,
      agent_version: 3,
      params: {
        prompt_id: "med_extraction_v3",
        scope_pages: [78, 79, 80, 81, 82, 83],
      },
      name: "Medical fields — pages 78-83",
      content: JSON.stringify(agentOutput),
      structured_json: agentOutput,  // also stored as JSONB for direct query
      rag_boost: 20,  // ranks ahead of raw extract in RAG search
      metadata: {
        page_extraction_run_id: runId,
        canonical_page: 78,
      },
    }),
  },
);
// 201 -> { outcome: "created", id, derivation_kind: "agent_structured_json", parent_processed_id }
```

#### Promote a clean variant to canonical

```ts
const res = await fetch(
  `/dedup/processed-documents/${initialExtractId}/set-canonical-clean`,
  {
    method: "POST",
    body: JSON.stringify({
      clean_id: betterCleanVariantId,
      reason: "user picked this variant as the official cleanup",
    }),
  },
);
// 200 -> { parent_processed_id, canonical_clean_id, reason, actor_user_id }
```

#### Archive a bad agent extraction

```ts
const res = await fetch(
  `/dedup/processed-documents/${badDerivativeId}/archive`,
  {
    method: "POST",
    body: JSON.stringify({ reason: "agent returned malformed output" }),
  },
);
// 200 -> { processed_document_id, archived: true, reason }
```

---

## File-upload dedup contract (heads up — flip is COMING but not yet)

The matrx-utils `FileService.upload_with_intent` method is shipped. It exposes the three upload intents (`create` / `alias_existing` / `force_new_copy`) at the service level, but **the existing `/files/upload` HTTP endpoint has not been switched to use it yet**. When that flip happens (in a future phase), uploads will require an `intent` field:

```ts
// FUTURE shape (not live yet — your code does NOT need to change today):
await fetch("/files/upload", {
  method: "POST",
  body: formData,  // includes 'intent' field as 'create' | 'alias_existing' | 'force_new_copy'
});
// 409 if intent=create and file already exists, with body.existing_file_id
```

We'll send a separate handoff doc when this flip is scheduled, with a feature-flag rollout plan and capture-and-replay validation. Until then, `/files/upload` continues to work as today.

---

## Existing-duplicate cleanup (running soon)

There are currently **1,743 dupe groups covering 4,316 cld_files rows** — re-uploads of the same content from before dedup-on-upload existed. A consolidation script ([scripts/consolidate_cld_files_dupes.py](../scripts/consolidate_cld_files_dupes.py)) will:

- Soft-delete the duplicate rows (`deleted_at = now()`)
- Stamp `duplicate_of_file_id = keeper.id` on each
- Leave the keeper (oldest per group) untouched

**FE impact when this runs:**
- File listings (`WHERE deleted_at IS NULL`) will show fewer rows. Users who had 7 copies of the same PDF will see 1.
- Any direct references to the soft-deleted ids still work (the rows physically remain). If you stored a `file_id` in app state and the underlying row got soft-deleted as part of consolidation, the file is still queryable via the `duplicate_of_file_id` chain.
- The FE can optionally show a "duplicate of [keeper]" badge on rows where `duplicate_of_file_id` is set (currently null for everything).

We'll coordinate a date for the cleanup run separately. The script is reversible (restore `deleted_at = NULL`, `duplicate_of_file_id = NULL`) so it can be rolled back if needed.

---

## What I recommend the FE team do this week

**Required:** nothing. Everything still works.

**Optional (worth the small effort):**

1. **Regenerate Supabase TypeScript types.** New columns become available. Mostly nullable / defaulted, but the typed FE will see them.
2. **If you have an admin / power-user UI for scheduled tasks**, consider migrating to `/scheduler/*` for the richer CRUD. Existing `/scheduling/*` keeps working — this is purely an upgrade path.

**Eventually required (we'll coordinate dates):**

1. **File upload flow** — when we flip `/files/upload` to require `intent`, the FE will need to:
   - Send `intent: "create"` by default
   - Handle 409 with a dialog: "This file already exists as `<path>`. [Use existing] [Upload separate copy] [Cancel]"
   - On "Upload separate copy," ask for a reason, then resubmit with `intent: "force_new_copy"`
2. **Extraction / cleanup flow** — when we wire the existing `/pdf/full-pipeline` and `/page-extraction/*` paths through the strict-intent service layer, the FE will need to:
   - Send `intent: "get_or_extract"` for the normal "make sure this is extracted" call
   - Handle 409 on `intent: "extract"` if the FE wants to be strict
   - Show a "Replace extraction" button that requires a user-typed reason
3. **Agent extraction → RAG bridge** — when the `page_extraction_results.payload` → `kg_chunks` bridge ships, agent-extracted content becomes RAG-searchable with user-assigned priority. The agent builder UI should expose `default_rag_boost` on `agx_agent` and the per-job override on `page_extraction_jobs`.

---

## Endpoint reference card

Copy this into your API client config:

```
# Existing (unchanged):
GET    /scheduling/validate-cron        -- legacy cron validate (aidream-owned)
POST   /scheduling/run-now/{task_id}    -- legacy manual run
GET    /scheduling/scanner-status       -- legacy scanner status (admin)

# New optional richer CRUD (matrx-scheduler package):
POST   /scheduler/tasks
GET    /scheduler/tasks
GET    /scheduler/tasks/{id}
PATCH  /scheduler/tasks/{id}
DELETE /scheduler/tasks/{id}
POST   /scheduler/tasks/{id}/run-now
GET    /scheduler/triggers?task_id=...
POST   /scheduler/triggers
PATCH  /scheduler/triggers/{id}
DELETE /scheduler/triggers/{id}
GET    /scheduler/runs
GET    /scheduler/runs/{id}
GET    /scheduler/status                -- admin
POST   /scheduler/cron/validate
POST   /scheduler/cron/preview-fires
POST   /scheduler/compute-next-due-at

# New strict-intent dedup (opt-in for new flows; old endpoints still work):
POST   /dedup/processed-documents/extract                         body: { intent, file_content_hash, source_kind, source_id, ... }
POST   /dedup/processed-documents/{id}/clean                      body: { intent, cleaner_name, cleaner_version, params, clean_content, ... }
POST   /dedup/processed-documents/{id}/derivative                 body: { intent, derivation_kind, agent_id?, agent_version?, params?, ... }
POST   /dedup/files/{file_id}/set-canonical-extract               body: { processed_document_id, reason }
POST   /dedup/processed-documents/{id}/set-canonical-clean        body: { clean_id, reason }
POST   /dedup/processed-documents/{id}/archive                    body: { reason }
```

---

## Questions / coordination

Open questions for the FE team that we'd want to align on before any of the "eventually required" items ship:

1. **Duplicate-detection UX on file upload.** When a user uploads a file that already exists in their org, what does the dialog look like? Options:
   - "Use existing" (alias) — most common, ~95% case
   - "Upload separate copy" (force_new_copy with reason) — power-user case
   - "Cancel" — let user investigate
2. **Canonical variant picker.** For documents with multiple clean variants (medical-focused cleaner vs general cleaner), how does the user choose which is canonical? Suggested UI: a "Variants" tab in the document detail view, with a "Make canonical" button next to each row.
3. **Agent extraction display in RAG results.** When a search returns an `agent_extract` chunk, the FE should ideally show it as a structured card (the source agent + the payload fields) instead of raw text. The `metadata.payload` field carries the original JSON.

Reach out in the engineering channel when ready to coordinate the file-upload-flip schedule.
