# FEATURE.md — `api-integrations` (index card)

**Status:** `pointer only — no code lives here`
**Tier:** `2`
**Last updated:** `2026-08-15`

> This directory contains ONLY this file. There is no catalog UI, no `components/`, no
> `types.ts`, no barrel — earlier revisions of this doc described a feature that does not
> exist. This card exists to route you to the real code and to reserve the name.

## Where the real code lives

**MCP — Matrx CONSUMING external MCP servers** (the substantive surface):

- `features/agents/services/mcp.service.ts` — imperative API (connect, list tools, invoke)
- `features/agents/services/mcp-connections.service.ts` — connection records
- `features/agents/services/mcp-client/tool-discovery.ts` — thin discovery stub (client-side MCP execution was deleted; tools execute via the durable delegated-tool path)
- `features/agents/services/mcp-oauth/` — PKCE + discovery helpers; the actual OAuth start/callback machinery is `app/api/mcp/oauth/*` (DCR + CIMD)
- `features/agents/redux/mcp.slice.ts` — connected servers / discovered tools / token state
- User-facing connect UI: `features/settings/` (IntegrationsSettingsPage) and `features/agents/` (AgentToolsManager)

**MCP — Matrx BEING an MCP server** (separate surface, do not conflate):
`app/api/mcp/[transport]/route.ts` — see [`app/api/mcp/FEATURE.md`](../../app/api/mcp/FEATURE.md).

**Credential storage:** governed by the Unified Credential Vault plan —
`/Users/armanisadeghi/code/common-docs/projects/unified-credential-vault/PLAN.md`. Read it
before changing MCP credential storage or resolution in any repo.

## Invariants that survive from the old doc

- MCP tools integrate through the **durable delegated tool path** — never a parallel execution path ([`../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md)).
- OAuth tokens stay server-side; the client never sees raw credentials.
- **DCR credentials are attempt-scoped.** Never cache a returned client ID without its
  matching secret; a downstream failure must not poison the next authorization attempt.
- **Classify the Next.js → aidream boundary before naming a service.** Cloudflare challenge
  HTML means FastAPI and the vault never ran; preserve `cf-ray` / `x-request-id` and report
  the edge failure instead of calling every 403 a vault denial.
- Agent tool lists are server-computed; the client never mints tool definitions.

## Known state (D128)

**The connect → discover → invoke loop has now run end-to-end against real remote MCP
servers (DeepWiki, Context7).** It had never worked in production; four independent
defects each broke it on their own:

1. **aidream, ORM misuse** — every `await McpServer.filter(...)` / `await McpUserConn.filter(...)`
   in `services/mcp_connections/service.py` + `api/routers/mcp_connections.py` awaited a
   `QueryBuilder`, which is not awaitable. Every call 500'd with
   `TypeError: object QueryBuilder can't be used in 'await' expression`. The unit-test fake
   defined `__await__`, so the suite passed while nothing worked. Fixed with `.all()`; the
   fake now mirrors the real builder.
2. **matrx-ai, transport** — `ExternalMCPClient` spoke plain JSON-RPC-over-POST. The MCP
   Streamable HTTP transport requires `Accept: application/json, text/event-stream`
   (compliant servers answer **406** without it), an `initialize` /
   `notifications/initialized` handshake with `Mcp-Session-Id`, and SSE response bodies.
   All three implemented.
3. **matrx-ai, name mangling** — `_strip_namespace` fell back to splitting on the first
   underscore when a name had no `:`, so DeepWiki's `ask_question` became `question`. It
   corrupted both invocation and the names `mcp_sync` registers from discovery. Removed.
4. **DB + FE, connecting at all** — `public.upsert_mcp_connection` omitted the NOT NULL
   `display_name`, so the metadata-only connect RPC raised 23502 for every server/user
   (migration `mcp_upsert_connection_display_name.sql`). And the no-auth Connect button
   sent an _empty bearer token_ to aidream's credentials endpoint (422) instead of calling
   the metadata-only RPC.

**Still open:** `tool.definition` has no routine MCP catalog sync; the only caller of
`mcp_sync.sync_server` is `bundle_lister`.

The OAuth popup is no longer hand-copied — `services/mcp-oauth/popup.ts` is the one
implementation (it also adds the origin check and listener cleanup the settings copy lacked).

## Change log

- `2026-08-15` — Cloudflare Bot Fight Mode challenged Vercel's authenticated token-persist
  POST before aidream ran. Disabled that zone-level machine-client blocker; DCR registration
  is now attempt-scoped, and callback failures distinguish edge HTML from structured aidream
  errors while preserving request identifiers.
- `2026-08-15` — D128: fixed the four defects above; first successful MCP connection since the vault cutover; OAuth popup consolidated onto `mcp-oauth/popup.ts`.
- `2026-08-12` — rewritten as an index card (D127): the described catalog feature never existed here; pointers corrected to the real agents-tree code.
- `2026-07-23` — linked the Unified Credential Vault plan.
