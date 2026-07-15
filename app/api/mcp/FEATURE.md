# FEATURE.md — `api/mcp` (Agent Feedback API)

**Status:** `active` — cross-project infrastructure
**Tier:** `2`
**Last updated:** `2026-07-15`

---

## Purpose

The Matrx-provided MCP server + REST endpoint that **external agents** (Claude Code, Cursor, Claude.ai connectors, arbitrary HTTP clients in other repos) use to submit bugs, feature requests, and suggestions into a centralized cross-project issue tracker. Also exposes triage, commenting, work-queue read, and admin-decision tools so the same agents can drive items through a full lifecycle.

This is the API **exposed to** external agents. Contrast with `features/api-integrations/FEATURE.md`, which covers the MCPs and integrations **consumed by** agents running inside this app.

---

## Two surfaces — keep in sync

| Surface | Path | Protocol | Consumers |
|---|---|---|---|
| **MCP server** | `app/api/mcp/[transport]/route.ts` | Model Context Protocol (HTTP, `disableSse: true`) | Cursor, Claude Code, Claude.ai connectors, any MCP client |
| **REST endpoint** | `app/api/agent/feedback/route.ts` | `POST { action, ...params }` action dispatch | Scripts, non-MCP agents, language runtimes without MCP SDKs |

**Both surfaces call the same service layer** (`lib/services/agent-feedback.service.ts`). Any new capability added to one surface MUST be mirrored in the other — otherwise clients that prefer one protocol silently lose parity.

---

## Entry points

**API routes**
- `GET|POST|DELETE /api/mcp/[transport]` — MCP server (transport is typically `mcp`; wrapped by `withMcpAuth`)
- `POST /api/agent/feedback` — REST dispatch endpoint; `{ action: <name>, ...params }`

**Service layer**
- `lib/services/agent-feedback.service.ts` — the single implementation of every action; uses `createAdminClient()` from `utils/supabase/adminClient.ts` to bypass RLS. All functions return `{ success, error?, data? }`.

**Auth**
- `lib/services/agent-auth.ts` — `validateAgentApiKey(request)` + `unauthorizedResponse()` for the REST route
- MCP route has its own inline `verifyToken()` that supports both `Authorization: Bearer` AND `?token=` query param (the latter for Claude.ai connectors, which cannot send custom headers)

**Types**
- `types/feedback.types.ts` — `UserFeedback`, `FeedbackComment`, `FeedbackType`, `FeedbackStatus`, `FeedbackPriority`, `AdminDecision`, `AiComplexity`, `TestingResult`
- `types/feedback-row-mapper.ts` — row → domain mappers and `parseGetTriageBatchResult`

**Not involved**
- `app/api/mcp/oauth/**` and `app/api/mcp/servers/**` are for the **MCP client** flow (agents in this app consuming external MCPs). Unrelated to this surface — see `features/api-integrations/FEATURE.md`.

---

## Auth

Single shared secret: `AGENT_API_KEY` in env.

- **REST:** `Authorization: Bearer <AGENT_API_KEY>` only. Anything else → 401 via `unauthorizedResponse()`.
- **MCP:** Checked in order — (1) `Authorization: Bearer <AGENT_API_KEY>`, then (2) `?token=<AGENT_API_KEY>` query param. On success returns an `AuthInfo` with `scopes: ['feedback']` and `clientId: 'agent' | 'agent-query'`. On failure, `withMcpAuth({ required: true })` rejects the request.
- If `AGENT_API_KEY` is **missing from env**, every call is rejected. Server logs `AGENT_API_KEY environment variable is not configured`. There is no fallback.

The API key is the **entire** security boundary. The service layer deliberately bypasses RLS (see Data model).

---

## Data model

**Database tables (Supabase)**
- `user_feedback` — core items: `id`, `user_id` (the submitting agent's UUID), `username` (agent display name), `feedback_type`, `route`, `description`, `status`, `priority`, `ai_*` triage fields, `admin_decision`, `work_priority`, `testing_*` fields, `parent_id` (for split issues), `category_id`. Inserts go through a direct `.insert()`; reads/writes go through Postgres RPCs.
- `feedback_comments` — internal comments per item; read via `get_feedback_comments` RPC, written via `add_feedback_comment` RPC.
- `feedback_categories` — referenced by `category_id` on triage.

**Postgres RPCs used**
- `get_triage_batch(p_batch_size)` — batch fetch of untriaged items + pipeline counts
- `get_agent_work_queue()` — approved items ordered by `work_priority`
- `get_feedback_comments(p_feedback_id)`
- `add_feedback_comment(p_feedback_id, p_author_type, p_author_name, p_content)`
- `triage_feedback_item(...)` — sets status `new → triaged`; MUST pass `p_category_id` (even as `null`) to disambiguate the overload
- `resolve_with_testing(...)` — sets status to `awaiting_review`; agent's terminal action
- `set_admin_decision(...)` — moves decision through `pending | approved | rejected | deferred | split`

**RLS posture**
- Service layer uses `createAdminClient()` (service role) for every call. RLS is **intentionally bypassed**. The API key check is what gates access. Do not switch to a user-scoped client without redesigning auth.
- Feedback workflow RPCs used by external agents (`triage`, queues, resolve/testing, decisions, email-state marking) are service-role-only. Browser-facing comment/review RPCs have explicit platform-admin or feedback-owner guards, and direct authenticated writes to workflow-sensitive feedback/message/comment tables are revoked.

**Key TS types** (from `types/feedback.types.ts`)
- `FeedbackStatus`: `new | triaged | in_progress | awaiting_review | user_review | resolved | closed | wont_fix | split | deferred`
- `AdminDecision`: `pending | approved | rejected | deferred | split`
- `TestingResult`: `pending | pass | fail | partial | admin_closed`

---

## Tool catalog (10 tools)

All 10 are exposed via MCP; the REST endpoint exposes the same 10 under shorter action names. Parameters marked required; all others optional.

| # | MCP tool | REST action | Purpose | Required params |
|---|---|---|---|---|
| 1 | `submit_feedback` | `submit` | Create a new item (`status: 'new'`) | `agent_id` (UUID), `agent_name`, `feedback_type` (`bug \| feature \| suggestion \| other`), `description`. Optional: `route`. |
| 2 | `get_feedback_item` | `get_item` | Fetch a single item by ID | `feedback_id` |
| 3 | `get_triage_batch` | `get_batch` | Batch of untriaged items + pipeline counts + previews | — (optional `batch_size`, default 3, max 10) |
| 4 | `get_work_queue` | `get_queue` | Approved items ordered by `work_priority` | — |
| 5 | `get_comments` | `get_comments` | All internal comments on an item | `feedback_id` |
| 6 | `get_rework_items` | `get_rework` | Items returned from testing with `fail` or `partial` | — |
| 7 | `triage_item` | `triage` | Push AI analysis; moves `new → triaged`. Accepts proposal, priority, complexity, estimated files, autonomy score (1–5), assessment, category | `feedback_id` |
| 8 | `add_comment` | `comment` | Append an internal comment | `feedback_id`, `author_name`, `content`. Optional: `author_type` (`ai_agent \| admin \| user`, default `ai_agent`). |
| 9 | `resolve_with_testing` | `resolve` | Agent's terminal action — submits fix for admin testing; sets status `awaiting_review` | `feedback_id`, `resolution_notes`. Optional: `testing_instructions`, `testing_url`. |
| 10 | `set_admin_decision` | `decision` | Set admin decision + optional work priority. Use `approved` for autonomy-score auto-approval | `feedback_id`, `decision`. Optional: `direction`, `work_priority`. |

MCP tool registration is in `app/api/mcp/[transport]/route.ts`; REST dispatch table is `ACTION_HANDLERS` in `app/api/agent/feedback/route.ts`.

---

## Key flows

### (a) External agent submits a bug
1. Agent (in some other project) calls `POST /api/mcp/mcp` with tool `submit_feedback`, or `POST /api/agent/feedback` with `{ action: "submit", ... }`.
2. Transport layer: `withMcpAuth` (MCP) or `validateAgentApiKey` (REST) checks the bearer token / query token against `AGENT_API_KEY`. Mismatch → 401 and nothing else runs.
3. `submitFeedback(agentId, agentName, input)` in the service layer builds an admin Supabase client and `INSERT`s into `user_feedback` with `status: 'new'`. The agent's UUID becomes `user_id`, the agent's display name becomes `username`.
4. Returns `{ success: true, data: UserFeedback }`. The row is now visible in the Matrx admin feedback UI queue.

### (b) Triage → decision → resolve lifecycle
1. An agent calls `get_triage_batch` (3 items default) → runs analysis locally → calls `triage_item(feedback_id, {...})`. Service layer invokes `triage_feedback_item` RPC which moves status `new → triaged` and stores AI fields (`ai_solution_proposal`, `ai_suggested_priority`, `ai_complexity`, `ai_estimated_files`, `autonomy_score`, `ai_assessment`).
2. An admin (or a high-autonomy agent for scores 4–5) calls `set_admin_decision(feedback_id, 'approved', direction?, work_priority?)`. Item now sits on the work queue.
3. A worker agent calls `get_work_queue` → picks an item → works on the fix externally → calls `resolve_with_testing(feedback_id, resolution_notes, testing_instructions?, testing_url?)`. Status moves to `awaiting_review`. This is the **agent's final action** on the item; admin testing drives it from there.
4. If admin testing yields `fail` or `partial`, the item re-appears in `get_rework_items` and a worker agent can pick it up again.

### (c) Cross-project identification
- There is **no `project_id` column** on `user_feedback`. The calling agent distinguishes its project through:
  - `agent_id` + `agent_name` on submission (agent attribution)
  - `route` field — file path, route, or component string; agents should prefix or include project-identifying context here
  - `description` content — conventionally include the project name
- If project-level routing becomes necessary, extend the schema and update both surfaces + the service layer in lockstep. Today, triage/categorization is the routing mechanism.

---

## Invariants & gotchas

- **`createAdminClient()` is used everywhere in the service layer — RLS is deliberately bypassed.** The bearer/query token check is the security boundary. Do not "harden" by switching to a user client without rebuilding auth end-to-end.
- **`AGENT_API_KEY` missing → every call 401.** There is no development fallback. Set it in `.env.local` and on every deployment target.
- **MCP and REST MUST stay in sync.** Every action added to `app/api/mcp/[transport]/route.ts` must be mirrored in `ACTION_HANDLERS` in `app/api/agent/feedback/route.ts`, and vice versa. The service layer is the shared contract — add new functions there first, then wire both surfaces.
- **MCP auth has two paths.** Claude.ai connectors cannot send custom headers; they use `?token=<key>`. Do not remove the query-param branch of `verifyToken` without first migrating all Claude.ai connector configurations.
- **MCP runs with `disableSse: true`.** Streaming is off by design; the handler also runs with `maxDuration: 60`. Long-running tools will 504 — keep tool handlers synchronous and cheap.
- **`triage_feedback_item` overload resolution requires `p_category_id`.** Always pass it, even as `null`. Omitting it makes Postgres fail to pick an overload.
- **Agent UUID is stored as `user_id`.** It does not need to exist in `auth.users` — agents are not Supabase users. Do not add a FK constraint.
- **Cross-project infra.** These routes are called by agents running outside this codebase. Breaking changes here break external integrations silently. Version new breaking behavior as new tool/action names; do not repurpose existing ones.
- **`resolve_with_testing` is the agent's terminal action.** Anything after that is admin/human territory via the web UI. Do not encourage agents to call `set_admin_decision` on their own submissions.

---

## Related features

- **`features/api-integrations/FEATURE.md`** — the inverse: MCPs consumed **by** agents in this app. Do not confuse the two.
- **`features/feedback/`** — currently only `FeedbackButton.tsx`; the in-app user-facing feedback capture UI. Writes to the same `user_feedback` table.
- **`features/agents/FEATURE.md`** — the internal agent system. Submissions from internal agents typically flow through the app's own UI, not this external API.
- **`app/api/mcp/oauth/**` + `app/api/mcp/servers/**`** — unrelated MCP **client** infrastructure for agents consuming external MCPs.

---

## Change log

- `2026-07-15` — **Feedback RPC/table boundary hardened.** External-agent pipeline RPCs are service-role-only; browser comment/review/message paths enforce platform-admin or feedback-owner identity; redundant messaging overloads were removed; direct authenticated workflow-state/message/comment writes were revoked. Server actions now authorize the web user before switching to the admin client, and the review-email route loads/authorizes the canonical stored message instead of trusting caller-supplied sender/content fields.
- `2026-04-22` — claude: initial doc expanded from CLAUDE.md "Agent Feedback API" section.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature — especially adding/removing actions, changing auth, altering the DB schema used by the service layer, or changing cross-project identification — update this file, keep the MCP tool catalog and REST action table in sync, and append to the Change log. Stale cross-project infra docs break external integrations silently.
