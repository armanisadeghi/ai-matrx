# FEATURE.md — `api-integrations` (+ MCP protocol)

**Status:** catalog `active / thin` · MCP integration `active`
**Tier:** `2`
**Last updated:** `2026-07-23`

> Cross-repo proposed plan: `/Users/armanisadeghi/code/common-docs/projects/unified-credential-vault/PLAN.md` — read it before changing MCP credential storage or resolution in any repository.

> This doc covers two layered surfaces: the user-facing API Integrations catalog at `features/api-integrations/`, and the substantive runtime it now fronts — the **MCP (Model Context Protocol)** bridge wired into the agents system at `features/agents/services/mcp*` and `features/agents/redux/mcp/`. MCP is the reason api-integrations is relevant.

---

## Purpose

- **API Integrations catalog** — the user-facing surface for configuring which external APIs can act as agent tools.
- **MCP integration** — the runtime that makes third-party MCP servers first-class tool providers inside the agents system. External MCP servers expose tool definitions, OAuth when needed, and execute tool calls; Matrx agents use them through the durable delegated-tool path.

---

## Two parts of this doc

### Part A — API Integrations catalog (`features/api-integrations/`)

Feature directory contents:
- `components/` — the UI catalog
- `constants.ts`, `data.ts` — static registry data
- `types.ts`, `index.ts` — public barrel + types

This is intentionally thin. It's the configuration surface; the runtime lives under the agents tree.

### Part B — MCP integration (the substantive part)

Runtime wiring:
- `features/agents/services/mcp.service.ts` — main service API
- `features/agents/services/mcp-client/` — client to external MCP servers
- `features/agents/services/mcp-oauth/` — OAuth flow for servers that require auth
- `features/agents/redux/mcp/` — Redux slice (connected servers, discovered tools, token state)
- `features/agents/redux/mcp.slice.ts` — state shape

MCP tool calls integrate into the standard **durable delegated tool** pathway — see [`../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md). The MCP service does not create a parallel execution path.

---

## Entry points

**Catalog**
- `features/api-integrations/index.ts` — public barrel

**MCP**
- `features/agents/services/mcp.service.ts` — imperative API (connect, list tools, invoke)
- MCP hooks exposed through the agents feature

**Matrx-provided MCP server** (separate surface)
- `app/api/mcp/[transport]/route.ts` — see [`app/api/mcp/FEATURE.md`](../../app/api/mcp/FEATURE.md) for the cross-project agent feedback MCP server Matrx *publishes* to other agents.

---

## Data model

- Catalog: static / seed data in `data.ts`; any user-created integrations likely live in a DB table (verify — may be represented via the agents' connected-MCP state rather than its own table)
- MCP connections: per-user or per-org records tracking connected servers, OAuth tokens (server-side only), tool discovery cache

---

## Key flows

### Flow 1 — Connect to a third-party MCP server

1. User initiates connection from the catalog UI.
2. OAuth flow via `mcp-oauth/` if the server requires auth.
3. Tokens stored server-side; client never sees them.
4. Tool discovery fetches the server's tool list; cached.

### Flow 2 — MCP tool surfaces on an agent

1. Agent invocation runs.
2. Server resolves available tools from both built-in tools and connected MCP servers (user/org scoped).
3. The LLM sees the combined tool list in its context.

### Flow 3 — MCP tool call execution

1. LLM requests an MCP tool.
2. Server emits `tool_delegated` — this routes through the standard durable tool pathway.
3. Client executes via `mcp-client/`, POSTs result to `/ai/conversations/{id}/tool_results`.
4. Server resumes the stream. (MCP tools are not widget tools — the stream pauses until results arrive.)

---

## Invariants & gotchas

- **MCP tools integrate through the durable delegated tool path.** Do not build a parallel execution path.
- **OAuth tokens stay server-side.** Client never sees raw credentials. The MCP service is the only thing that handles tokens.
- **Tool discovery is per-invocation** (not cached indefinitely) — servers can change tool lists.
- **`features/api-integrations/` is thin catalog UI; the runtime lives under the agents tree.** Don't migrate MCP runtime into this feature dir — the agents tree is the correct owner.
- **Matrx-published MCP server is a separate surface** (see `app/api/mcp/FEATURE.md`). Do not conflate: this doc = Matrx *consuming* external MCP servers; that doc = Matrx *being* an MCP server.
- **Agent tool lists are server-computed** from the agent's connection config + MCP-discovered tools. The client never mints tool definitions.

---

## Related features

- **Depends on:** `features/agents/` (durable-tool pipeline, invocation routing)
- **Depended on by:** Every agent that uses external tools beyond built-ins
- **Cross-links:** [`../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](../agents/docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md), [`../agent-connections/FEATURE.md`](../agent-connections/FEATURE.md), [`app/api/mcp/FEATURE.md`](../../app/api/mcp/FEATURE.md)

---

## Change log

- `2026-07-23` — codex: linked the proposed cross-repository Unified Credential Vault plan governing future MCP credential storage and resolution.
- `2026-04-22` — claude: initial combined doc for API integrations catalog + MCP protocol runtime.

---

> **Keep-docs-live:** MCP is evolving fast. Any change to the connection flow, OAuth handling, tool discovery cadence, or durable-tool integration path MUST update this doc and cross-update the durable-tool doc.
