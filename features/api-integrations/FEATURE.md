# FEATURE.md — `api-integrations` (index card)

**Status:** `pointer only — no code lives here`
**Tier:** `2`
**Last updated:** `2026-08-12`

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
- Agent tool lists are server-computed; the client never mints tool definitions.

## Known state

MCP user connections have not completed a successful connect since the vault cutover — see
FOUND_DEFECTS.md **D128** (all `tool.mcp_user_conn` rows expired, zero `mcp_discovered`
tools ever synced; the OAuth-popup logic is hand-copied in three places — consolidate when
touched).

## Change log

- `2026-08-12` — rewritten as an index card (D127): the described catalog feature never existed here; pointers corrected to the real agents-tree code.
- `2026-07-23` — linked the Unified Credential Vault plan.
